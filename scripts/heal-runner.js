#!/usr/bin/env node

/**
 * Heal runner — invoked by .github/workflows/heal.yml after the user
 * clicks a heal button in Slack.
 *
 * Flow:
 *   1. Run the production agent suite once to capture a fresh failure.
 *      (We could pass the failure forward from the verify pipeline, but
 *      re-running keeps the data contract simple — heal.yml only needs
 *      the commit SHA from the button payload.)
 *   2. Hand the failure tail + parsed failures to tryAutoHeal().
 *   3. If Gemini proposes a patch, the file changes are written by
 *      heal-bug.js. The workflow commits/pushes them.
 *
 * Outputs (GitHub Actions step outputs):
 *   applied=true|false
 *   reason="<one-line>"
 *   files="path1,path2"
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { tryAutoHeal } from './heal-bug.js';

const WORKSPACE_ROOT = process.cwd();
const PROD_URL = 'https://vently-web-gamma.vercel.app';

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const PURPLE = '\x1b[35m';

const HEAL_KEY = process.env.GEMINI_API_KEY || process.env.ANTHROPIC_API_KEY;

function setOutput(name, value) {
  // GitHub Actions step output protocol. Multi-line safe via heredoc style.
  const output = process.env.GITHUB_OUTPUT;
  if (!output) return;
  const sanitized = String(value).replace(/\n/g, ' ').replace(/"/g, '\\"');
  fs.appendFileSync(output, `${name}=${sanitized}\n`);
}

function runProdTests() {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    const proc = spawn('pnpm', ['--filter', '@vently/web', 'test:agent'], {
      env: { ...process.env, FORCE_COLOR: '1', E2E_WEB_URL: PROD_URL },
    });
    proc.stdout.on('data', (d) => {
      const chunk = d.toString();
      stdout += chunk;
      process.stdout.write(chunk);
    });
    proc.stderr.on('data', (d) => {
      const chunk = d.toString();
      stderr += chunk;
      process.stderr.write(chunk);
    });
    proc.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

function parseFailures(output) {
  const failures = [];
  const lines = output.split('\n');
  let current = null;
  for (const line of lines) {
    if (line.match(/^\s*\d+\)\s+/)) {
      if (current) failures.push(current);
      current = { title: line.replace(/^\s*\d+\)\s+/, '').trim(), details: [] };
    } else if (current) {
      if (line.trim().startsWith('Error:')) {
        current.details.push(line.trim());
      } else if (line.includes('▶') || line.includes('└') || line.includes('──')) {
        // skip
      } else if (line.trim().length > 0 && current.details.length < 10) {
        current.details.push(line.trim());
      }
    }
  }
  if (current) failures.push(current);
  return failures;
}

async function main() {
  console.log(
    `\n${PURPLE}${BOLD}================================================================================${RESET}`,
  );
  console.log(`${BLUE}${BOLD} 🤖 Vently Auto-Heal Runner${RESET}`);
  console.log(
    `${PURPLE}${BOLD}================================================================================${RESET}\n`,
  );

  if (!HEAL_KEY) {
    const msg = 'GEMINI_API_KEY is not configured — cannot run heal';
    console.error(`${RED}${BOLD}${msg}${RESET}`);
    setOutput('applied', 'false');
    setOutput('reason', msg);
    process.exit(1);
  }

  // Demo / dry-run mode: skip the prod-test capture and use a stubbed
  // failure description provided via env. Used by .github/workflows/heal.yml
  // when triggered with `synthetic_failure` input — proves the patch +
  // commit + PR chain works against a branch that has a real source bug,
  // without needing the live Vercel build to be broken.
  const stubTitle = process.env.DEMO_FAILURE_TITLE;
  const stubDetail = process.env.DEMO_FAILURE_DETAIL;
  let stdout = '';
  let stderr = '';
  let failureList;

  if (stubTitle) {
    console.log(`${BLUE}${BOLD}[DEMO MODE] Skipping prod-test capture.${RESET}`);
    console.log(`  Stub failure title: ${stubTitle}`);
    if (stubDetail) console.log(`  Stub failure detail: ${stubDetail}`);
    failureList = [
      {
        title: stubTitle,
        details: [stubDetail || `Error: ${stubTitle}`],
      },
    ];
  } else {
    // 1. Reproduce the failure to capture fresh output for Gemini.
    console.log(`${YELLOW}Running production agent suite to capture failure...${RESET}`);
    const result = await runProdTests();
    stdout = result.stdout;
    stderr = result.stderr;

    if (result.code === 0) {
      console.log(`\n${GREEN}${BOLD}✔ Production tests now pass — nothing to heal.${RESET}`);
      setOutput('applied', 'false');
      setOutput('reason', 'tests passed on re-run; no patch needed');
      return;
    }

    const failures = parseFailures(stdout + '\n' + stderr);
    failureList =
      failures.length > 0
        ? failures
        : [
            {
              title: 'Production E2E Suite Failure',
              details: ['Playwright execution failed. See workflow log for full output.'],
            },
          ];
  }

  console.log(
    `\n${YELLOW}${BOLD}Captured ${failureList.length} failure(s). Invoking Gemini...${RESET}\n`,
  );

  // 2. Hand off to Gemini.
  const healResult = await tryAutoHeal({
    failures: failureList,
    rawOutput: (stdout + '\n' + stderr).slice(-20_000),
    workspaceRoot: WORKSPACE_ROOT,
    geminiKey: HEAL_KEY,
  });

  if (!healResult.applied) {
    console.log(`\n${RED}${BOLD}✗ Gemini did not produce a patch: ${healResult.reason}${RESET}\n`);
    setOutput('applied', 'false');
    setOutput('reason', healResult.reason || 'no patch proposed');
    return;
  }

  console.log(
    `\n${GREEN}${BOLD}✔ Patch applied to: ${healResult.filesChanged.join(', ')}${RESET}\n`,
  );
  console.log(`  reason: ${healResult.reason}`);
  setOutput('applied', 'true');
  setOutput('reason', healResult.reason || 'patch applied');
  setOutput('files', healResult.filesChanged.join(','));

  // Branch-name slug: derive from the failing test title so branches/PRs
  // are scannable in GitHub instead of `auto-heal/<sha>-<timestamp>`.
  // Example: "16. Typing indicator shows peer nickname in chat header"
  //  -> "typing-indicator-shows-peer-nickname"
  const firstTitle = failureList[0]?.title || 'unknown-failure';
  const slug = firstTitle
    .toLowerCase()
    .replace(/^\d+[.)\s]+/, '') // strip "16. " / "1) " leaders
    .replace(/[^a-z0-9]+/g, '-') // non-alphanumerics -> dash
    .replace(/^-+|-+$/g, '') // trim dashes
    .slice(0, 40) // cap length
    .replace(/-+$/, ''); // re-trim if slice cut mid-dash-run
  setOutput('failure_slug', slug || 'auto-heal');
  console.log(`  branch slug: ${slug}`);
}

main().catch((err) => {
  console.error(`${RED}heal-runner crashed: ${err.message}${RESET}`);
  setOutput('applied', 'false');
  setOutput('reason', `heal-runner crashed: ${err.message}`);
  process.exit(1);
});
