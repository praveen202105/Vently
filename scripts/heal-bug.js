#!/usr/bin/env node

/**
 * Claude-driven auto-healing for E2E test failures.
 *
 * Reads the failing test output, asks Claude to:
 *   1) Identify the most likely source file(s) to inspect.
 *   2) Propose targeted code patches (full-file rewrites for the changed files).
 *   3) Return the patch as strict JSON.
 *
 * We then write those files to disk and signal the caller to re-run the suite.
 *
 * Safety rails:
 *   - Only touches files under apps/ or packages/ (never .github/, scripts/, etc.)
 *   - Never touches test files (tests/**, *.spec.ts, *.test.ts).
 *   - Soft cap on file size and number of files per attempt.
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
  // Heuristic: grep recent source files for the failing test's keywords
  // and ship Claude a small inventory of repo paths so it can request reads.
  const keywords = new Set();
  for (const f of failures) {
    for (const word of (f.title || '').split(/\s+/)) {
      if (word.length >= 4) keywords.add(word.toLowerCase());
    }
  }

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

async function callClaude({ anthropicKey, systemPrompt, userMessage, tools }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-7',
      max_tokens: 8192,
      system: systemPrompt,
      tools,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Anthropic API HTTP ${res.status}: ${txt.slice(0, 400)}`);
  }
  return res.json();
}

export async function tryAutoHeal({ failures, rawOutput, workspaceRoot, anthropicKey }) {
  if (!anthropicKey) {
    return { applied: false, reason: 'ANTHROPIC_API_KEY not set', filesChanged: [] };
  }

  const candidatePaths = gatherCandidateFiles(workspaceRoot, failures);
  if (candidatePaths.length === 0) {
    return { applied: false, reason: 'no candidate source files found', filesChanged: [] };
  }

  const systemPrompt = `You are an autonomous bug-fixing agent for the Vently chat app monorepo (Next.js + NestJS + Playwright).

Your job: given a failing Playwright test and access to the source tree, find the smallest code change that will make the test pass without breaking other tests.

Rules:
- You MAY read any source file under apps/ or packages/ using the read_file tool.
- You MUST NOT modify test files, configs, package.json, or anything outside apps/ and packages/.
- Prefer the smallest possible patch. Do not refactor unrelated code.
- Keep behavior consistent with the rest of the test suite — failing tests describe the intended behavior.
- When ready, call the propose_patch tool ONCE with the full new contents of each file you want to overwrite.
- If you cannot determine a safe fix, call propose_patch with an empty files array and an explanation in reason.`;

  const tools = [
    {
      name: 'read_file',
      description:
        'Read a source file from the repository. Path must be under apps/ or packages/ and must not be a test/config file.',
      input_schema: {
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
      input_schema: {
        type: 'object',
        properties: {
          reason: { type: 'string', description: 'One-sentence summary of the fix.' },
          files: {
            type: 'array',
            maxItems: MAX_FILES_PER_ATTEMPT,
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
  ];

  const failureSummary = failures
    .map((f, i) => `Failure ${i + 1}: ${f.title}\n${(f.details || []).slice(0, 8).join('\n')}`)
    .join('\n\n');

  const userMessage = [
    {
      type: 'text',
      text:
        `# Failing Playwright tests\n\n${failureSummary}\n\n` +
        `# Tail of test output\n\n\`\`\`\n${rawOutput.slice(-8000)}\n\`\`\`\n\n` +
        `# Source files available (first 400 of ${candidatePaths.length})\n\n` +
        candidatePaths.slice(0, 400).join('\n') +
        `\n\nStart by calling read_file on the most likely culprits. Then call propose_patch exactly once with the final fix.`,
    },
  ];

  // Multi-turn loop: keep responding to tool_use until Claude calls propose_patch
  let conversation = [{ role: 'user', content: userMessage }];
  const MAX_TURNS = 12;
  let proposedPatch = null;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    let response;
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-opus-4-7',
          max_tokens: 8192,
          system: systemPrompt,
          tools,
          messages: conversation,
        }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        return {
          applied: false,
          reason: `Anthropic HTTP ${res.status}: ${txt.slice(0, 200)}`,
          filesChanged: [],
        };
      }
      response = await res.json();
    } catch (err) {
      return {
        applied: false,
        reason: `Anthropic request failed: ${err.message}`,
        filesChanged: [],
      };
    }

    const toolUses = (response.content || []).filter((b) => b.type === 'tool_use');
    if (toolUses.length === 0) {
      // No more tool calls and no patch — bail
      return {
        applied: false,
        reason: 'Claude stopped without proposing a patch',
        filesChanged: [],
      };
    }

    // Echo assistant turn into conversation
    conversation.push({ role: 'assistant', content: response.content });

    const toolResults = [];
    for (const tu of toolUses) {
      if (tu.name === 'read_file') {
        const content = readFileIfSafe(workspaceRoot, tu.input?.path);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content:
            content === null
              ? `ERROR: cannot read "${tu.input?.path}" (out of scope, too large, or missing)`
              : content,
        });
      } else if (tu.name === 'propose_patch') {
        proposedPatch = tu.input;
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: 'patch received',
        });
      } else {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: `ERROR: unknown tool ${tu.name}`,
          is_error: true,
        });
      }
    }

    conversation.push({ role: 'user', content: toolResults });

    if (proposedPatch) break;
  }

  if (!proposedPatch) {
    return { applied: false, reason: 'No patch proposed within turn budget', filesChanged: [] };
  }

  const files = Array.isArray(proposedPatch.files) ? proposedPatch.files : [];
  if (files.length === 0) {
    return {
      applied: false,
      reason: proposedPatch.reason || 'Claude declined to propose a patch',
      filesChanged: [],
    };
  }

  const writtenPaths = [];
  for (const f of files) {
    const safe = safePath(workspaceRoot, f.path);
    if (!safe) {
      return {
        applied: false,
        reason: `unsafe path in patch: ${f.path}`,
        filesChanged: writtenPaths,
      };
    }
    if (typeof f.new_contents !== 'string' || f.new_contents.length === 0) {
      return { applied: false, reason: `empty contents for ${f.path}`, filesChanged: writtenPaths };
    }
    if (f.new_contents.length > MAX_FILE_BYTES) {
      return {
        applied: false,
        reason: `oversized patch for ${f.path}`,
        filesChanged: writtenPaths,
      };
    }
    fs.mkdirSync(path.dirname(safe.absolute), { recursive: true });
    fs.writeFileSync(safe.absolute, f.new_contents);
    writtenPaths.push(safe.relative);
  }

  return { applied: true, reason: proposedPatch.reason, filesChanged: writtenPaths };
}
