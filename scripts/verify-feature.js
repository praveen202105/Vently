#!/usr/bin/env node

import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import readline from 'readline';

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

// Parse command line arguments
const args = process.argv.slice(2);
const IS_LOCAL_ONLY = args.includes('--local-only');
const IS_CI = args.includes('--ci') || process.env.CI === 'true';

const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK_URL;

function printHeader(title) {
  console.log(`\n${PURPLE}${BOLD}================================================================================${RESET}`);
  console.log(`${CYAN}${BOLD} 🚀 Vently Automated Verification Pipeline: ${title}${RESET}`);
  console.log(`${PURPLE}${BOLD}================================================================================${RESET}\n`);
}

function printStep(number, message) {
  console.log(`${CYAN}${BOLD}[Step ${number}]${RESET} ${BOLD}${message}${RESET}`);
}

async function sendSlackNotification(title, description, color, fields = []) {
  if (!SLACK_WEBHOOK) return;
  try {
    const payload = {
      attachments: [
        {
          color: color, // e.g. '#2eb886' (green), '#a30200' (red), '#3aa3e3' (blue)
          title: `Vently Pipeline: ${title}`,
          text: description,
          fields: fields,
          footer: 'Vently CI/CD Bot',
          ts: Math.floor(Date.now() / 1000)
        }
      ]
    };
    await fetch(SLACK_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.warn(`[Slack] Webhook delivery failed: ${err.message}`);
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
        details: []
      };
    } else if (currentFailure) {
      if (line.trim().startsWith('Error:')) {
        currentFailure.details.push(line.trim());
      } else if (line.includes('▶') || line.includes('└') || line.includes('──')) {
        // Skip visual tree lines
      } else if (line.trim().length > 0 && currentFailure.details.length < 5) {
        currentFailure.details.push(line.trim());
      }
    }
  }
  if (currentFailure) failures.push(currentFailure);
  return failures;
}

async function writeBugsMd(failures, phase = 'Local E2E Tests') {
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
    f.details.forEach(d => {
      bugReport += `> \`${d}\`\n`;
    });
    bugReport += `\n**Proposed Action Plan**:\n`;
    bugReport += `- [ ] Investigate the root cause in the active component.\n`;
    bugReport += `- [ ] Implement hotfix.\n`;
    bugReport += `- [ ] Re-run the verification pipeline.\n\n`;
    bugReport += `--- \n`;

    slackFields.push({
      title: `Failure ${i + 1}: ${f.title}`,
      value: f.details[0] || 'Unknown error',
      short: false
    });
  });

  fs.writeFileSync(BUGS_FILE, bugReport + content);
  console.log(`${GREEN}✔ Bug report successfully written to: ${BUGS_FILE}${RESET}\n`);

  // Deliver error card to Slack
  await sendSlackNotification(
    `❌ Failure during ${phase}`,
    `Test suite failed. Generated bugs.md in workspace root.`,
    '#a30200',
    slackFields
  );
}

function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => rl.question(query, (ans) => {
    rl.close();
    resolve(ans);
  }));
}

async function getBranchName() {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
  } catch {
    return 'main';
  }
}

async function verifyLocal() {
  printStep(1, 'Running Local E2E Tests');
  
  await sendSlackNotification(
    '⏳ Local Verification Started',
    `Running local Playwright test suites...`,
    '#3aa3e3'
  );

  let stdout = '';
  let stderr = '';
  
  const proc = spawn('pnpm', ['--filter', '@vently/web', 'test:e2e'], {
    env: { ...process.env, FORCE_COLOR: '1' }
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

  return new Promise((resolve) => {
    proc.on('close', (code) => {
      if (code !== 0) {
        const failures = getFailingTests(stdout + '\n' + stderr);
        if (failures.length > 0) {
          writeBugsMd(failures, 'Local E2E Tests');
        } else {
          writeBugsMd([{ title: 'E2E Suite Failure', details: ['Playwright test execution failed. Check console output above.'] }], 'Local E2E Tests');
        }
        resolve(false);
      } else {
        console.log(`\n${GREEN}${BOLD}✔ All local E2E tests passed successfully!${RESET}\n`);
        resolve(true);
      }
    });
  });
}

async function verifyProd() {
  printStep(4, 'Running Production Verification Smoke Tests');
  
  await sendSlackNotification(
    '⏳ Production Verification Started',
    `Running production Playwright smoke tests against ${PROD_URL}...`,
    '#3aa3e3'
  );

  let stdout = '';
  let stderr = '';
  
  const proc = spawn('pnpm', ['--filter', '@vently/web', 'test:agent'], {
    env: { ...process.env, FORCE_COLOR: '1', E2E_WEB_URL: PROD_URL }
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

  return new Promise((resolve) => {
    proc.on('close', (code) => {
      if (code !== 0) {
        const failures = getFailingTests(stdout + '\n' + stderr);
        if (failures.length > 0) {
          writeBugsMd(failures, 'Production E2E Tests');
        } else {
          writeBugsMd([{ title: 'Production E2E Suite Failure', details: ['Playwright production tests failed. Check console output.'] }], 'Production E2E Tests');
        }
        resolve(false);
      } else {
        console.log(`\n${GREEN}${BOLD}✔ All Production E2E tests passed successfully against ${PROD_URL}!${RESET}\n`);
        resolve(true);
      }
    });
  });
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
      // Offline or DNS not ready yet
    }
    console.log(`${YELLOW}Waiting for production build to complete... (${i + 1}/${maxRetries})${RESET}`);
    await new Promise(r => setTimeout(r, 10000));
  }
  return false;
}

async function main() {
  const branch = await getBranchName();
  printHeader(`Verification Loop Start (Branch: ${branch})`);
  
  // 1. Run local verification
  const localPassed = await verifyLocal();
  if (!localPassed) {
    console.log(`${RED}${BOLD}Pipeline halted. Please review bugs.md and apply necessary fixes.${RESET}`);
    process.exit(1);
  }

  // If local-only mode was selected, exit clean here
  if (IS_LOCAL_ONLY) {
    await sendSlackNotification(
      '✔ Local Verification Succeeded',
      `All E2E tests passed successfully (Local Only Mode).`,
      '#2eb886'
    );
    console.log(`${GREEN}${BOLD}✔ Local verification complete. Exiting (--local-only).${RESET}`);
    process.exit(0);
  }

  // 2. Local passed -> Commit & Push
  printStep(2, 'Staging and Committing Changes');
  try {
    const status = execSync('git status --porcelain').toString().trim();
    if (status.length === 0) {
      console.log(`${YELLOW}No changes to commit. Proceeding to deployment verification.${RESET}`);
    } else {
      console.log(`${BLUE}Staging all changes...${RESET}`);
      execSync('git add .');
      
      const commitMsg = `verify: automatic E2E check pass on branch ${branch}`;
      console.log(`${BLUE}Committing: "${commitMsg}"...${RESET}`);
      execSync(`git commit -m "${commitMsg}"`);
      
      printStep(3, `Pushing changes to Git branch: ${branch}`);
      execSync(`git push origin ${branch}`);
      console.log(`${GREEN}✔ Changes successfully pushed to remote!${RESET}\n`);
    }
  } catch (err) {
    console.log(`${RED}Git operations failed: ${err.message}${RESET}`);
    process.exit(1);
  }

  // 3. Monitor / Wait for Prod Deployment
  console.log(`${PURPLE}${BOLD}================================================================================${RESET}`);
  console.log(`${YELLOW}${BOLD} ⏳ Deployment In Progress...${RESET}`);
  console.log(`${YELLOW} Please wait for your Vercel/Railway build to finish deploying to production.${RESET}`);
  console.log(`${YELLOW} Host URL: ${BOLD}${PROD_URL}${RESET}`);
  console.log(`${PURPLE}${BOLD}================================================================================${RESET}\n`);

  if (IS_CI) {
    // Under CI mode, automatically poll the URL instead of waiting interactively
    const isOnline = await pollProdUrl();
    if (!isOnline) {
      console.log(`${RED}${BOLD}Deployment timeout: Production URL failed to respond with 200 OK within 5 minutes.${RESET}`);
      process.exit(1);
    }
  } else {
    const deployAns = await askQuestion(`${CYAN}${BOLD}Type 'ok' and press Enter once the build is successfully deployed: ${RESET}`);
    if (deployAns.trim().toLowerCase() !== 'ok') {
      console.log(`${YELLOW}Smoke tests skipped by user request.${RESET}`);
      process.exit(0);
    }
  }

  // 4. Verification in Prod
  const prodPassed = await verifyProd();
  if (!prodPassed) {
    console.log(`${RED}${BOLD}Pipeline finished with production errors. See bugs.md for detail.${RESET}`);
    process.exit(1);
  }

  await sendSlackNotification(
    '🎉 Pipeline Deployment & E2E Succeeded',
    `All smoke tests successfully verified against the live environment: ${PROD_URL}!`,
    '#2eb886',
    [
      { title: 'Branch', value: branch, short: true },
      { title: 'Environment', value: 'Production', short: true }
    ]
  );

  console.log(`\n${GREEN}${BOLD}🎉 Pipeline Finished Successfully! Your feature is live and fully verified! 🥂${RESET}\n`);
}

main().catch((err) => {
  console.error(`${RED}Pipeline crash: ${err.message}${RESET}`);
  process.exit(1);
});
