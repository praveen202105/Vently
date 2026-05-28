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
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-pro';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const MAX_TURNS = 12;

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

function gatherCandidateFiles(workspaceRoot) {
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
  return allFiles.slice(0, 400);
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

  const candidatePaths = gatherCandidateFiles(workspaceRoot);
  if (candidatePaths.length === 0) {
    return { applied: false, reason: 'no candidate source files found', filesChanged: [] };
  }

  const systemInstruction = {
    parts: [
      {
        text: `You are an autonomous bug-fixing agent for the Vently chat app monorepo (Next.js + NestJS + Playwright).

Your job: given a failing Playwright test and access to the source tree, find the smallest code change that will make the test pass without breaking other tests.

Rules:
- You MAY read any source file under apps/ or packages/ using the read_file function.
- You MUST NOT modify test files, configs, package.json, or anything outside apps/ and packages/.
- Prefer the smallest possible patch. Do not refactor unrelated code.
- Read the most likely culprits FIRST (the test name usually hints at the component).
- When ready, call propose_patch ONCE with full new contents of each file to overwrite.
- If you cannot determine a safe fix, call propose_patch with an empty files array and an explanation in reason.`,
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
    `# Tail of test output\n\n\`\`\`\n${rawOutput.slice(-8000)}\n\`\`\`\n\n` +
    `# Source files available (first 400 of ${candidatePaths.length})\n\n` +
    candidatePaths.slice(0, 400).join('\n') +
    `\n\nStart by calling read_file on the most likely culprits. Then call propose_patch exactly once with the final fix.`;

  const contents = [{ role: 'user', parts: [{ text: initialPrompt }] }];
  let proposedPatch = null;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
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

    if (functionCalls.length === 0) {
      const textOut = parts
        .map((p) => p.text)
        .filter(Boolean)
        .join('\n')
        .slice(0, 400);
      return {
        applied: false,
        reason: `Gemini stopped without calling a function. Last text: "${textOut}"`,
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
