#!/usr/bin/env node

/**
 * Gemini-driven auto-healing for E2E test failures.
 *
 * Given a failing Playwright test, asks Gemini to:
 *   1) Read candidate source files via the `read_file` function tool.
 *   2) Propose targeted code patches via the `propose_patch` function tool.
 *
 * We then write those files to disk and signal the caller to re-run the suite.
 *
 * Safety rails:
 *   - Only touches files under apps/ or packages/ (never .github/, scripts/, etc.)
 *   - Never touches test files (tests/**, *.spec.ts, *.test.ts).
 *   - Soft cap on file size and number of files per attempt.
 *
 * Auth:
 *   GEMINI_API_KEY (preferred) or ANTHROPIC_API_KEY (legacy name, still
 *   accepted to avoid breaking older workflows). Either way, the request
 *   goes to the Google Generative Language API.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const ALLOWED_PREFIXES = ['apps/', 'packages/'];
const FORBIDDEN_SUBSTRINGS = [
  '/tests/',
  '.spec.ts',
  '.spec.tsx',
  '.test.ts',
  '.test.tsx',
  'playwright.',
  'package.json',
  'pnpm-lock',
  '.env',
];
const MAX_FILES_PER_ATTEMPT = 5;
const MAX_FILE_BYTES = 120_000;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const MAX_TURNS = 8;
// Free-tier gemini-flash allows ~10 RPM. Throttle to ~8 RPM to leave headroom.
const MIN_DELAY_BETWEEN_CALLS_MS = 7500;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function safePath(workspaceRoot, relPath) {
  if (typeof relPath !== 'string' || relPath.length === 0) return null;
  const normalized = path.posix.normalize(relPath.replace(/\\/g, '/'));
  if (normalized.startsWith('..') || normalized.startsWith('/')) return null;
  if (!ALLOWED_PREFIXES.some((p) => normalized.startsWith(p))) return null;
  if (FORBIDDEN_SUBSTRINGS.some((s) => normalized.includes(s))) return null;
  const absolute = path.join(workspaceRoot, normalized);
  if (!absolute.startsWith(workspaceRoot)) return null;
  return { relative: normalized, absolute };
}

function gatherCandidateFiles(workspaceRoot, failures) {
  let allFiles = [];
  try {
    const out = execSync(
      `git ls-files apps packages | grep -E '\\.(ts|tsx)$' | grep -v '/tests/' | grep -v '\\.spec\\.' | grep -v '\\.test\\.'`,
      { cwd: workspaceRoot, maxBuffer: 4 * 1024 * 1024 },
    ).toString();
    allFiles = out.split('\n').filter(Boolean);
  } catch {
    return [];
  }

  // Pull keywords from the failing test titles, e.g.
  //   "16. Typing indicator shows peer nickname in chat header"
  //   -> ['typing', 'indicator', 'peer', 'nickname', 'chat', 'header']
  const STOPWORDS = new Set([
    'the', 'and', 'with', 'shows', 'when', 'this', 'that', 'from', 'into',
    'should', 'expect', 'test', 'tests', 'spec', 'agent', 'page', 'visible',
    'timeout', 'click', 'error', 'failed', 'failure',
  ]);
  const keywords = new Set();
  for (const f of failures || []) {
    for (const raw of (f.title || '').split(/[^a-zA-Z]+/)) {
      const w = raw.toLowerCase();
      if (w.length >= 4 && !STOPWORDS.has(w)) keywords.add(w);
    }
  }

  // Rank: files whose path contains any keyword bubble up first.
  const scored = allFiles.map((p) => {
    const lp = p.toLowerCase();
    let score = 0;
    for (const k of keywords) if (lp.includes(k)) score += 1;
    return { p, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 60).map((x) => x.p);
}

function readFileIfSafe(workspaceRoot, relPath) {
  const safe = safePath(workspaceRoot, relPath);
  if (!safe) return null;
  try {
    const stat = fs.statSync(safe.absolute);
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return null;
    return fs.readFileSync(safe.absolute, 'utf8');
  } catch {
    return null;
  }
}

async function callGemini({ apiKey, contents, systemInstruction, tools }) {
  const res = await fetch(GEMINI_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents,
      systemInstruction,
      tools,
      // Force Gemini to ALWAYS call one of our functions instead of falling
      // back to a free-form text answer. Without this, gemini-2.5-flash
      // frequently prefers to just describe the bug in prose.
      toolConfig: {
        functionCallingConfig: {
          mode: 'ANY',
          allowedFunctionNames: ['read_file', 'propose_patch'],
        },
      },
      generationConfig: {
        temperature: 0.2,
        // No explicit maxOutputTokens — let Gemini use the model's full
        // built-in output budget so large full-file rewrites aren't cut off.
        // gemini-2.5-flash "thinks" implicitly and that eats the output
        // budget before it emits the functionCall. Force budget=0 to skip
        // thinking and go straight to tool calls.
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Gemini HTTP ${res.status}: ${txt.slice(0, 500)}`);
  }
  return res.json();
}

export async function tryAutoHeal({ failures, rawOutput, workspaceRoot, anthropicKey, geminiKey }) {
  // Accept either name; GEMINI_API_KEY wins if both are set.
  const apiKey = geminiKey || process.env.GEMINI_API_KEY || anthropicKey;
  if (!apiKey) {
    return { applied: false, reason: 'GEMINI_API_KEY not set', filesChanged: [] };
  }

  const candidatePaths = gatherCandidateFiles(workspaceRoot, failures);
  if (candidatePaths.length === 0) {
    return { applied: false, reason: 'no candidate source files found', filesChanged: [] };
  }

  const systemInstruction = {
    parts: [
      {
        text: `You are an autonomous bug-fixing agent for the Vently chat app monorepo (Next.js + NestJS + Playwright).

Your job: given a failing Playwright test and the source tree, find the smallest code change that makes the test pass.

Hard budget: you have at most ${MAX_TURNS} turns. Each call to the API counts. Be efficient.

Process you MUST follow:
1. Read at most 2-3 files: the file the test most likely targets (use keyword matching against the test name) and any helper it imports. DO NOT read more than 3 files.
2. As soon as you understand the bug, call propose_patch.
3. Each propose_patch entry must be the FULL new contents of the file. No diffs.

Hard rules:
- Touch only files under apps/ or packages/.
- Never modify tests, configs, package.json, lockfiles, env files.
- Prefer the smallest possible patch. Do not refactor unrelated code.
- If the source code already looks correct and the failure is environmental (cache, deploy lag, flaky socket), call propose_patch with files: [] and explain in reason. Do NOT keep reading files looking for a bug that isn't there.`,
      },
    ],
  };

  const tools = [
    {
      functionDeclarations: [
        {
          name: 'read_file',
          description:
            'Read a source file from the repository. Path must be under apps/ or packages/ and must not be a test/config file.',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Workspace-relative path' },
            },
            required: ['path'],
          },
        },
        {
          name: 'propose_patch',
          description:
            'Submit the final patch as a set of full-file rewrites. Each entry replaces the file at `path` with `new_contents` verbatim.',
          parameters: {
            type: 'object',
            properties: {
              reason: { type: 'string', description: 'One-sentence summary of the fix.' },
              files: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    path: { type: 'string' },
                    new_contents: { type: 'string' },
                  },
                  required: ['path', 'new_contents'],
                },
              },
            },
            required: ['reason', 'files'],
          },
        },
      ],
    },
  ];

  const failureSummary = failures
    .map((f, i) => `Failure ${i + 1}: ${f.title}\n${(f.details || []).slice(0, 8).join('\n')}`)
    .join('\n\n');

  const initialPrompt =
    `# Failing Playwright tests\n\n${failureSummary}\n\n` +
    `# Tail of test output\n\n\`\`\`\n${rawOutput.slice(-6000)}\n\`\`\`\n\n` +
    `# Top ${candidatePaths.length} source files (ranked by test-keyword match)\n\n` +
    candidatePaths.join('\n') +
    `\n\nRead AT MOST 2-3 files. Then call propose_patch.`;

  const contents = [{ role: 'user', parts: [{ text: initialPrompt }] }];
  let proposedPatch = null;
  let lastCallAt = 0;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    // Throttle to stay under the 10 RPM free-tier limit.
    const elapsed = Date.now() - lastCallAt;
    if (lastCallAt > 0 && elapsed < MIN_DELAY_BETWEEN_CALLS_MS) {
      const waitMs = MIN_DELAY_BETWEEN_CALLS_MS - elapsed;
      console.log(`  [heal turn ${turn + 1}] throttling ${waitMs}ms before next Gemini call`);
      await sleep(waitMs);
    }
    lastCallAt = Date.now();

    let data;
    try {
      data = await callGemini({ apiKey, contents, systemInstruction, tools });
    } catch (err) {
      return { applied: false, reason: err.message, filesChanged: [] };
    }

    const candidate = data?.candidates?.[0];
    if (!candidate) {
      return { applied: false, reason: 'Gemini returned no candidate', filesChanged: [] };
    }

    const parts = candidate.content?.parts || [];
    const functionCalls = parts.filter((p) => p.functionCall);
    const finishReason = candidate.finishReason || 'UNKNOWN';

    // Surface what Gemini did this turn so failures aren't a black box.
    const fnNames = functionCalls.map((p) => p.functionCall.name).join(', ') || 'none';
    console.log(
      `  [heal turn ${turn + 1}] finishReason=${finishReason} functionCalls=[${fnNames}] partsCount=${parts.length}`,
    );

    if (functionCalls.length === 0) {
      const textOut = parts
        .map((p) => p.text)
        .filter(Boolean)
        .join('\n')
        .slice(0, 400);
      // Common Gemini failure modes: MAX_TOKENS (thinking ate the budget),
      // SAFETY (output redacted), MALFORMED_FUNCTION_CALL (schema mismatch).
      return {
        applied: false,
        reason: `Gemini stopped without calling a function (finishReason=${finishReason}). Last text: "${textOut}"`,
        filesChanged: [],
      };
    }

    // Echo the model's turn verbatim so the conversation stays in sync
    contents.push({ role: 'model', parts: candidate.content.parts });

    const responseParts = [];
    for (const fc of functionCalls) {
      const { name, args } = fc.functionCall;
      if (name === 'read_file') {
        const fileContent = readFileIfSafe(workspaceRoot, args?.path);
        responseParts.push({
          functionResponse: {
            name: 'read_file',
            response: {
              content:
                fileContent === null
                  ? `ERROR: cannot read "${args?.path}" (out of scope, too large, or missing)`
                  : fileContent,
            },
          },
        });
      } else if (name === 'propose_patch') {
        proposedPatch = args;
        responseParts.push({
          functionResponse: { name: 'propose_patch', response: { content: 'patch received' } },
        });
      } else {
        responseParts.push({
          functionResponse: {
            name,
            response: { content: `ERROR: unknown function ${name}` },
          },
        });
      }
    }

    contents.push({ role: 'user', parts: responseParts });

    if (proposedPatch) break;
  }

  if (!proposedPatch) {
    return { applied: false, reason: 'No patch proposed within turn budget', filesChanged: [] };
  }

  const files = Array.isArray(proposedPatch.files) ? proposedPatch.files : [];
  if (files.length === 0) {
    return {
      applied: false,
      reason: proposedPatch.reason || 'Gemini declined to propose a patch',
      filesChanged: [],
    };
  }
  if (files.length > MAX_FILES_PER_ATTEMPT) {
    return {
      applied: false,
      reason: `Patch touches ${files.length} files (max ${MAX_FILES_PER_ATTEMPT})`,
      filesChanged: [],
    };
  }

  const writtenPaths = [];
  for (const f of files) {
    const safe = safePath(workspaceRoot, f.path);
    if (!safe) {
      return { applied: false, reason: `unsafe path in patch: ${f.path}`, filesChanged: writtenPaths };
    }
    if (typeof f.new_contents !== 'string' || f.new_contents.length === 0) {
      return { applied: false, reason: `empty contents for ${f.path}`, filesChanged: writtenPaths };
    }
    if (f.new_contents.length > MAX_FILE_BYTES) {
      return { applied: false, reason: `oversized patch for ${f.path}`, filesChanged: writtenPaths };
    }
    fs.mkdirSync(path.dirname(safe.absolute), { recursive: true });
    fs.writeFileSync(safe.absolute, f.new_contents);
    writtenPaths.push(safe.relative);
  }

  return { applied: true, reason: proposedPatch.reason, filesChanged: writtenPaths };
}
