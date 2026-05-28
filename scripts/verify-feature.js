#!/usr/bin/env node

import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { tryAutoHeal } from './heal-bug.js';

// ANSI terminal colors for premium visual aesthetics
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const PURPLE = '\x1b[35m';
const CYAN = '\x1b[36m';

const WORKSPACE_ROOT = process.cwd();
const BUGS_FILE = path.join(WORKSPACE_ROOT, 'bugs.md');
const PROD_URL = 'https://vently-web-gamma.vercel.app';

const args = process.argv.slice(2);
const IS_LOCAL_ONLY = args.includes('--local-only');
const IS_CI = args.includes('--ci') || process.env.CI === 'true';
const NO_HEAL = args.includes('--no-heal');

const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK_URL;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const MAX_HEAL_ATTEMPTS = Number(process.env.MAX_HEAL_ATTEMPTS || 2);

const GITHUB_SERVER_URL = process.env.GITHUB_SERVER_URL || 'https://github.com';
const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY || '';
const GITHUB_RUN_ID = process.env.GITHUB_RUN_ID || '';
const RUN_URL =
  GITHUB_REPOSITORY && GITHUB_RUN_ID
    ? `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`
    : '';

function printHeader(title) {
  console.log(
    `\n${PURPLE}${BOLD}================================================================================${RESET}`,
  );
  console.log(`${CYAN}${BOLD} 🚀 Vently Automated Verification Pipeline: ${title}${RESET}`);
  console.log(
    `${PURPLE}${BOLD}================================================================================${RESET}\n`,
  );
}

function printStep(number, message) {
  console.log(`${CYAN}${BOLD}[Step ${number}]${RESET} ${BOLD}${message}${RESET}`);
}

async function sendSlackNotification(title, description, color, fields = []) {
  if (!SLACK_WEBHOOK) {
    console.warn(`${YELLOW}[Slack] SLACK_WEBHOOK_URL not configured — skipping "${title}"${RESET}`);
    return;
  }
  const finalFields = [...fields];
  if (RUN_URL) {
    finalFields.push({
      title: 'GitHub Run',
      value: `<${RUN_URL}|View live logs ↗>`,
      short: false,
    });
  }
  try {
    const payload = {
      attachments: [
        {
          color,
          title: `Vently Pipeline: ${title}`,
          text: description,
          fields: finalFields,
          footer: 'Vently CI/CD Bot',
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    };
    const res = await fetch(SLACK_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.warn(`${YELLOW}[Slack] HTTP ${res.status}: ${txt}${RESET}`);
    }
  } catch (err) {
    console.warn(`${YELLOW}[Slack] Webhook delivery failed: ${err.message}${RESET}`);
  }
}

function getFailingTests(output) {
  const failures = [];
  const lines = output.split('\n');
  let currentFailure = null;

  for (const line of lines) {
    if (line.match(/^\s*\d+\)\s+/)) {
      if (currentFailure) failures.push(currentFailure);
      currentFailure = {
        title: line.replace(/^\s*\d+\)\s+/, '').trim(),
        details: [],
      };
    } else if (currentFailure) {
      if (line.trim().startsWith('Error:')) {
        currentFailure.details.push(line.trim());
      } else if (line.includes('▶') || line.includes('└') || line.includes('──')) {
        // skip tree-drawing lines
      } else if (line.trim().length > 0 && currentFailure.details.length < 10) {
        currentFailure.details.push(line.trim());
      }
    }
  }
  if (currentFailure) failures.push(currentFailure);
  return failures;
}

async function writeBugsMd(failures, phase) {
  console.log(`\n${RED}${BOLD}❌ Verification Failed! Writing bug report to bugs.md...${RESET}`);

  let content = '';
  if (fs.existsSync(BUGS_FILE)) {
    content = fs.readFileSync(BUGS_FILE, 'utf8');
  }

  const timestamp = new Date().toLocaleString();
  let bugReport = `\n# Bug Report — ${phase} (${timestamp})\n\n`;
  bugReport += `The automated verification pipeline detected the following E2E failures:\n\n`;

  const slackFields = [];

  failures.forEach((f, i) => {
    bugReport += `### ${i + 1}. Failing Spec: \`${f.title}\`\n`;
    bugReport += `> **Error Details**:\n`;
    f.details.forEach((d) => {
      bugReport += `> \`${d}\`\n`;
    });
    bugReport += `\n**Proposed Action Plan**:\n`;
    bugReport += `- [ ] Investigate the root cause in the active component.\n`;
    bugReport += `- [ ] Implement hotfix.\n`;
    bugReport += `- [ ] Re-run the verification pipeline.\n\n`;
    bugReport += `--- \n`;

    slackFields.push({
      title: `Failure ${i + 1}: ${f.title}`.slice(0, 250),
      value: (f.details[0] || 'Unknown error').slice(0, 500),
      short: false,
    });
  });

  fs.writeFileSync(BUGS_FILE, bugReport + content);
  console.log(`${GREEN}✔ Bug report successfully written to: ${BUGS_FILE}${RESET}\n`);

  await sendSlackNotification(
    `❌ Failure during ${phase}`,
    `Test suite failed. See bugs.md for details. Self-heal attempts ${NO_HEAL || !ANTHROPIC_KEY ? 'disabled' : 'in progress'}.`,
    '#a30200',
    slackFields,
  );
}

function askQuestion(query) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans);
    }),
  );
}

async function getBranchName() {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
  } catch {
    return 'main';
  }
}

function runTests(filter, scriptName, extraEnv = {}) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    const proc = spawn('pnpm', ['--filter', filter, scriptName], {
      env: { ...process.env, FORCE_COLOR: '1', ...extraEnv },
    });
    proc.stdout.on('data', (data) => {
      const chunk = data.toString();
      stdout += chunk;
      process.stdout.write(chunk);
    });
    proc.stderr.on('data', (data) => {
      const chunk = data.toString();
      stderr += chunk;
      process.stderr.write(chunk);
    });
    proc.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

async function verifyLocalWithHealing() {
  printStep(1, 'Running Local E2E Tests');

  await sendSlackNotification(
    '⏳ Local Verification Started',
    `Running local Playwright test suites...`,
    '#3aa3e3',
  );

  for (let attempt = 0; attempt <= MAX_HEAL_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      console.log(
        `\n${PURPLE}${BOLD}🤖 Self-Heal Attempt ${attempt}/${MAX_HEAL_ATTEMPTS}${RESET} — re-running test suite after auto-fix...\n`,
      );
      await sendSlackNotification(
        `🤖 Self-Heal Retry #${attempt}`,
        `Auto-fix applied. Re-running local E2E suite...`,
        '#f2c744',
      );
    }

    const { code, stdout, stderr } = await runTests('@vently/web', 'test:e2e');
    if (code === 0) {
      console.log(`\n${GREEN}${BOLD}✔ All local E2E tests passed!${RESET}\n`);
      if (attempt > 0) {
        await sendSlackNotification(
          `✅ Self-Heal Succeeded (attempt ${attempt})`,
          `Local E2E suite recovered after auto-fix.`,
          '#2eb886',
        );
      }
      return true;
    }

    const failures = getFailingTests(stdout + '\n' + stderr);
    const failureList =
      failures.length > 0
        ? failures
        : [
            {
              title: 'E2E Suite Failure',
              details: ['Playwright test execution failed. Check console output above.'],
            },
          ];

    // If healing is disabled, or we've exhausted attempts, write bugs.md and bail
    if (NO_HEAL || !ANTHROPIC_KEY || attempt >= MAX_HEAL_ATTEMPTS) {
      await writeBugsMd(failureList, 'Local E2E Tests');
      return false;
    }

    console.log(
      `\n${YELLOW}${BOLD}🩺 Test suite failed. Invoking Claude self-heal (attempt ${attempt + 1}/${MAX_HEAL_ATTEMPTS})...${RESET}\n`,
    );

    const healResult = await tryAutoHeal({
      failures: failureList,
      rawOutput: (stdout + '\n' + stderr).slice(-20_000),
      workspaceRoot: WORKSPACE_ROOT,
      anthropicKey: ANTHROPIC_KEY,
    });

    if (!healResult.applied) {
      console.log(
        `${RED}${BOLD}✗ Self-heal could not produce a safe patch: ${healResult.reason}${RESET}\n`,
      );
      await writeBugsMd(failureList, 'Local E2E Tests');
      return false;
    }

    console.log(
      `${GREEN}${BOLD}✔ Self-heal applied edits to: ${healResult.filesChanged.join(', ')}${RESET}\n`,
    );
    await sendSlackNotification(
      `🤖 Auto-Fix Applied`,
      `Claude proposed edits to: \`${healResult.filesChanged.join('`, `')}\`. Re-running tests...`,
      '#3aa3e3',
    );
  }

  return false;
}

async function runProdSuite() {
  return runTests('@vently/web', 'test:agent', { E2E_WEB_URL: PROD_URL });
}

async function verifyProdWithHealing(branch) {
  printStep(4, 'Running Production Verification Smoke Tests');

  await sendSlackNotification(
    '⏳ Production Verification Started',
    `Running production Playwright smoke tests against ${PROD_URL}...`,
    '#3aa3e3',
  );

  for (let attempt = 0; attempt <= MAX_HEAL_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      console.log(
        `\n${PURPLE}${BOLD}🤖 Prod Self-Heal Attempt ${attempt}/${MAX_HEAL_ATTEMPTS}${RESET}\n`,
      );
    }

    const { code, stdout, stderr } = await runProdSuite();
    if (code === 0) {
      console.log(
        `\n${GREEN}${BOLD}✔ All Production E2E tests passed against ${PROD_URL}!${RESET}\n`,
      );
      if (attempt > 0) {
        await sendSlackNotification(
          `✅ Prod Self-Heal Succeeded (attempt ${attempt})`,
          `Production E2E recovered after auto-fix + redeploy.`,
          '#2eb886',
        );
      }
      return true;
    }

    const failures = getFailingTests(stdout + '\n' + stderr);
    const failureList =
      failures.length > 0
        ? failures
        : [
            {
              title: 'Production E2E Suite Failure',
              details: ['Playwright production tests failed. Check console output.'],
            },
          ];

    if (NO_HEAL || !ANTHROPIC_KEY || attempt >= MAX_HEAL_ATTEMPTS) {
      await writeBugsMd(failureList, 'Production E2E Tests');
      return false;
    }

    console.log(
      `\n${YELLOW}${BOLD}🩺 Prod tests failed. Invoking Claude self-heal (attempt ${attempt + 1}/${MAX_HEAL_ATTEMPTS})...${RESET}\n`,
    );
    await sendSlackNotification(
      `🤖 Prod Self-Heal Triggered`,
      `Production tests failed. Asking Claude to patch the source...`,
      '#f2c744',
    );

    const healResult = await tryAutoHeal({
      failures: failureList,
      rawOutput: (stdout + '\n' + stderr).slice(-20_000),
      workspaceRoot: WORKSPACE_ROOT,
      anthropicKey: ANTHROPIC_KEY,
    });

    if (!healResult.applied) {
      console.log(
        `${RED}${BOLD}✗ Self-heal could not produce a safe patch: ${healResult.reason}${RESET}\n`,
      );
      await writeBugsMd(failureList, 'Production E2E Tests');
      return false;
    }

    console.log(
      `${GREEN}${BOLD}✔ Self-heal applied edits to: ${healResult.filesChanged.join(', ')}${RESET}\n`,
    );

    // Commit + push the auto-fix so prod redeploys.
    try {
      await commitAndPush(
        branch,
        `fix(auto-heal): patch failing prod E2E tests (attempt ${attempt + 1})`,
      );
      await sendSlackNotification(
        `🤖 Auto-Fix Pushed (prod attempt ${attempt + 1})`,
        `Patched \`${healResult.filesChanged.join('`, `')}\`. Waiting for production redeploy...`,
        '#3aa3e3',
      );
    } catch (err) {
      console.log(`${RED}Auto-heal commit failed: ${err.message}${RESET}`);
      await writeBugsMd(failureList, 'Production E2E Tests');
      return false;
    }

    // Wait for prod redeploy before retrying.
    const isOnline = await pollProdUrl();
    if (!isOnline) {
      const msg = 'Auto-heal redeploy timeout. Production URL never came back online.';
      console.log(`${RED}${BOLD}${msg}${RESET}`);
      await sendSlackNotification('❌ Auto-Heal Redeploy Timeout', msg, '#a30200');
      return false;
    }
  }

  return false;
}

async function pollProdUrl(maxRetries = 30) {
  console.log(`${BLUE}Polling production URL to check deployment status...${RESET}`);
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(PROD_URL, { method: 'HEAD' });
      if (res.status === 200) {
        console.log(`${GREEN}✔ Production site is online and active!${RESET}\n`);
        return true;
      }
    } catch {
      // not ready yet
    }
    console.log(
      `${YELLOW}Waiting for production build to complete... (${i + 1}/${maxRetries})${RESET}`,
    );
    await new Promise((r) => setTimeout(r, 10000));
  }
  return false;
}

function configureGitIdentity() {
  // CI runs as a detached HEAD without a configured identity. Set one so
  // auto-heal commits don't crash. No-op locally when identity already exists.
  try {
    execSync('git config user.email', { stdio: 'pipe' });
  } catch {
    execSync('git config user.email "vently-bot@users.noreply.github.com"');
  }
  try {
    execSync('git config user.name', { stdio: 'pipe' });
  } catch {
    execSync('git config user.name "Vently CI Bot"');
  }
}

async function commitAndPush(branch, commitMsg) {
  const status = execSync('git status --porcelain').toString().trim();
  if (status.length === 0) {
    console.log(`${YELLOW}No changes to commit. Continuing.${RESET}`);
    return false;
  }
  configureGitIdentity();
  console.log(`${BLUE}Staging all changes...${RESET}`);
  execSync('git add .');
  console.log(`${BLUE}Committing: "${commitMsg}"...${RESET}`);
  execSync(`git commit -m "${commitMsg}"`);
  printStep(3, `Pushing changes to Git branch: ${branch}`);
  execSync(`git push origin HEAD:${branch}`);
  console.log(`${GREEN}✔ Changes successfully pushed to remote!${RESET}\n`);
  return true;
}

async function main() {
  const branch = await getBranchName();
  printHeader(`Verification Loop Start (Branch: ${branch})`);

  if (IS_CI && !SLACK_WEBHOOK) {
    console.log(
      `${YELLOW}${BOLD}⚠️  SLACK_WEBHOOK_URL is missing — Slack updates disabled.${RESET}`,
    );
  }
  if (IS_CI && !ANTHROPIC_KEY && !NO_HEAL) {
    console.log(
      `${YELLOW}${BOLD}⚠️  ANTHROPIC_API_KEY is missing — self-heal disabled. Add the secret to enable AI auto-fix.${RESET}`,
    );
  }

  // 1. Local verification (with self-healing retries)
  if (IS_CI && !IS_LOCAL_ONLY) {
    console.log(
      `${YELLOW}${BOLD}ℹ️  CI Run: Skipping local E2E. Going straight to commit + prod smoke tests.${RESET}\n`,
    );
  } else {
    const localPassed = await verifyLocalWithHealing();
    if (!localPassed) {
      console.log(`${RED}${BOLD}Pipeline halted. Review bugs.md and apply fixes manually.${RESET}`);
      process.exit(1);
    }

    if (IS_LOCAL_ONLY) {
      await sendSlackNotification(
        '✔ Local Verification Succeeded',
        `All E2E tests passed (Local Only Mode).`,
        '#2eb886',
        [{ title: 'Branch', value: branch, short: true }],
      );
      console.log(`${GREEN}${BOLD}✔ Local verification complete. Exiting (--local-only).${RESET}`);
      process.exit(0);
    }
  }

  // 2. Commit & push (including any self-heal edits)
  printStep(2, 'Staging and Committing Changes');
  try {
    const pushed = await commitAndPush(
      branch,
      `verify: automatic E2E check pass on branch ${branch}`,
    );
    if (pushed) {
      await sendSlackNotification(
        '📤 Auto-Commit Pushed',
        `Changes pushed to \`${branch}\`. Waiting for production deployment...`,
        '#3aa3e3',
      );
    }
  } catch (err) {
    console.log(`${RED}Git operations failed: ${err.message}${RESET}`);
    await sendSlackNotification(
      '❌ Auto-Commit Failed',
      `Could not commit/push pipeline changes: \`${err.message}\``,
      '#a30200',
    );
    process.exit(1);
  }

  // 3. Wait for prod deployment
  console.log(
    `${PURPLE}${BOLD}================================================================================${RESET}`,
  );
  console.log(`${YELLOW}${BOLD} ⏳ Deployment In Progress...${RESET}`);
  console.log(`${YELLOW} Host URL: ${BOLD}${PROD_URL}${RESET}`);
  console.log(
    `${PURPLE}${BOLD}================================================================================${RESET}\n`,
  );

  if (IS_CI) {
    const isOnline = await pollProdUrl();
    if (!isOnline) {
      const msg = 'Deployment timeout: Production URL failed to respond within 5 minutes.';
      console.log(`${RED}${BOLD}${msg}${RESET}`);
      await sendSlackNotification('❌ Deployment Timeout', msg, '#a30200');
      process.exit(1);
    }
  } else {
    const deployAns = await askQuestion(`${CYAN}${BOLD}Type 'ok' once deployed: ${RESET}`);
    if (deployAns.trim().toLowerCase() !== 'ok') {
      console.log(`${YELLOW}Smoke tests skipped by user request.${RESET}`);
      process.exit(0);
    }
  }

  // 4. Production verification (with self-heal + redeploy loop)
  const prodPassed = await verifyProdWithHealing(branch);
  if (!prodPassed) {
    console.log(
      `${RED}${BOLD}Pipeline finished with production errors. See bugs.md for detail.${RESET}`,
    );
    process.exit(1);
  }

  await sendSlackNotification(
    '🎉 Pipeline Deployment & E2E Succeeded',
    `All smoke tests verified against ${PROD_URL}!`,
    '#2eb886',
    [
      { title: 'Branch', value: branch, short: true },
      { title: 'Environment', value: 'Production', short: true },
    ],
  );

  console.log(`\n${GREEN}${BOLD}🎉 Pipeline Finished Successfully! 🥂${RESET}\n`);
}

main().catch(async (err) => {
  console.error(`${RED}Pipeline crash: ${err.message}${RESET}`);
  await sendSlackNotification(
    '💥 Pipeline Crash',
    `Unhandled error: \`${err.message}\``,
    '#a30200',
  );
  process.exit(1);
});
