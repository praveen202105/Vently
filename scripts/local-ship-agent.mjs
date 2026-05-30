#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const BUGS_FILE = path.join(ROOT, 'bugs.md');
const MAX_CAPTURE_BYTES = 5 * 1024 * 1024;

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

const BUILD_ENV_DEFAULTS = {
  DATABASE_URL: 'postgresql://placeholder:placeholder@localhost:5432/placeholder',
  REDIS_URL: 'redis://localhost:6379',
  NEXT_PUBLIC_API_URL: 'http://localhost:4000/api',
  NEXT_PUBLIC_SOCKET_URL: 'http://localhost:4000',
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'placeholder_vapid_key_for_build',
};

function parseArgs(argv) {
  const opts = {
    push: false,
    dryRun: false,
    message: '',
    branch: '',
    e2e: false,
    agentTest: false,
    apiTest: false,
    specs: [],
    heal: false,
    maxHeal: 1,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg === '--push') opts.push = true;
    else if (arg === '--dry-run' || arg === '--no-push') opts.dryRun = true;
    else if (arg === '--e2e') opts.e2e = true;
    else if (arg === '--agent-test') opts.agentTest = true;
    else if (arg === '--api-test') opts.apiTest = true;
    else if (arg === '--heal') opts.heal = true;
    else if (arg === '--message' || arg === '-m') opts.message = argv[++i] || '';
    else if (arg.startsWith('--message=')) opts.message = arg.slice('--message='.length);
    else if (arg === '--branch') opts.branch = argv[++i] || '';
    else if (arg.startsWith('--branch=')) opts.branch = arg.slice('--branch='.length);
    else if (arg === '--spec') opts.specs.push(argv[++i] || '');
    else if (arg.startsWith('--spec=')) opts.specs.push(arg.slice('--spec='.length));
    else if (arg === '--max-heal') opts.maxHeal = Number(argv[++i] || '1');
    else if (arg.startsWith('--max-heal=')) opts.maxHeal = Number(arg.slice('--max-heal='.length));
    else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  opts.specs = opts.specs.map((s) => s.trim()).filter(Boolean);
  opts.maxHeal = Number.isFinite(opts.maxHeal) && opts.maxHeal >= 0 ? opts.maxHeal : 1;
  if (opts.dryRun) opts.push = false;
  return opts;
}

function usage() {
  console.log(`Vently local ship agent

Usage:
  pnpm agent:local
  pnpm agent:local -- --spec 08-chat-header.spec.ts
  pnpm agent:ship -- --message "feat: add video calls" --spec 08-chat-header.spec.ts

Options:
  --push                 Commit and push after all checks pass.
  --dry-run, --no-push   Run checks only. This is what pnpm agent:local uses.
  -m, --message <text>   Commit message for --push mode.
  --branch <name>        Push to this branch. Defaults to the current branch.
  --spec <file>          Run a focused Playwright spec. Can be repeated.
  --e2e                  Run the full web Playwright E2E suite.
  --agent-test           Run the full agent browser suite.
  --api-test             Run all API unit tests.
  --heal                 Try one Gemini code-heal pass on failure. Needs GEMINI_API_KEY.
  --max-heal <n>         Number of heal attempts. Default: 1.
`);
}

function loadEnvFile(relativePath) {
  const absolute = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolute)) return;
  const lines = fs.readFileSync(absolute, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const eq = trimmed.indexOf('=');
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (key === 'NODE_ENV') continue;
    if (!key || process.env[key] !== undefined) continue;
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function printHeader(title) {
  console.log(`\n${colors.cyan}${colors.bold}${title}${colors.reset}`);
  console.log(`${colors.cyan}${'-'.repeat(title.length)}${colors.reset}`);
}

function formatCommand(cmd, args) {
  return [cmd, ...args].join(' ');
}

function capOutput(current, next) {
  const combined = current + next;
  if (combined.length <= MAX_CAPTURE_BYTES) return combined;
  return combined.slice(combined.length - MAX_CAPTURE_BYTES);
}

function run(cmd, args, options = {}) {
  const name = options.name || formatCommand(cmd, args);
  const env = { ...process.env, ...(options.env || {}) };

  console.log(`\n${colors.blue}▶ ${name}${colors.reset}`);
  return new Promise((resolve) => {
    let output = '';
    const child = spawn(cmd, args, {
      cwd: ROOT,
      env,
      shell: false,
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      output = capOutput(output, text);
      process.stdout.write(text);
    });
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      output = capOutput(output, text);
      process.stderr.write(text);
    });
    child.on('error', (error) => {
      output = capOutput(output, `\n${error.message}\n`);
      resolve({ ok: false, code: 1, name, cmd, args, output, error });
    });
    child.on('close', (code) => {
      const ok = code === 0;
      console.log(
        ok ? `${colors.green}✔ ${name}${colors.reset}` : `${colors.red}✘ ${name}${colors.reset}`,
      );
      resolve({ ok, code, name, cmd, args, output });
    });
  });
}

function buildEnv() {
  const merged = {};
  for (const [key, value] of Object.entries(BUILD_ENV_DEFAULTS)) {
    merged[key] = process.env[key] || value;
  }
  return merged;
}

function normalizeSpec(spec) {
  if (spec.startsWith('apps/web/')) return spec.slice('apps/web/'.length);
  if (spec.startsWith('tests/')) return spec;
  if (spec.includes('/')) return spec;
  return `tests/e2e/${spec}`;
}

function checksFor(opts) {
  const env = buildEnv();
  const productionEnv = { ...env, NODE_ENV: 'production' };
  const checks = [
    {
      name: 'Generate Prisma client',
      cmd: 'pnpm',
      args: ['--filter', '@vently/shared', 'prisma:generate'],
      env,
    },
    {
      name: 'Validate Prisma schema',
      cmd: 'pnpm',
      args: ['--filter', '@vently/shared', 'prisma:validate'],
      env,
    },
    {
      name: 'Build shared package',
      cmd: 'pnpm',
      args: ['--filter', '@vently/shared', 'build'],
      env,
    },
    { name: 'Typecheck workspace', cmd: 'pnpm', args: ['typecheck'], env },
    { name: 'Lint workspace', cmd: 'pnpm', args: ['lint'], env },
    {
      name: 'Clean web build cache',
      cmd: 'pnpm',
      args: ['--filter', '@vently/web', 'clean'],
      env,
    },
    { name: 'Build workspace', cmd: 'pnpm', args: ['build'], env: productionEnv },
    { name: 'Prettier check', cmd: 'pnpm', args: ['format:check'], env },
    { name: 'Git whitespace check', cmd: 'git', args: ['diff', '--check'] },
  ];

  if (opts.apiTest) {
    checks.push({
      name: 'API unit tests',
      cmd: 'pnpm',
      args: ['--filter', '@vently/api', 'test'],
      env,
    });
  }

  for (const spec of opts.specs) {
    checks.push({
      name: `Playwright focused spec: ${spec}`,
      cmd: 'pnpm',
      args: ['--dir', 'apps/web', 'exec', 'playwright', 'test', normalizeSpec(spec)],
      env,
    });
  }

  if (opts.e2e) {
    checks.push({
      name: 'Web Playwright E2E suite',
      cmd: 'pnpm',
      args: ['--filter', '@vently/web', 'test:e2e'],
      env,
    });
  }

  if (opts.agentTest) {
    checks.push({
      name: 'Browser agent suite',
      cmd: 'pnpm',
      args: ['--filter', '@vently/web', 'test:agent'],
      env,
    });
  }

  return checks;
}

function tailLines(text, maxLines = 100) {
  return text.split(/\r?\n/).slice(-maxLines).join('\n');
}

function writeBugsMd(failure) {
  const existing = fs.existsSync(BUGS_FILE) ? fs.readFileSync(BUGS_FILE, 'utf8') : '';
  const timestamp = new Date().toLocaleString();
  const command = formatCommand(failure.cmd, failure.args);
  const report = `# Bug Report - Local Ship Agent (${timestamp})

The local ship agent stopped before commit/push because a verification step failed.

## Failed Step

- Name: \`${failure.name}\`
- Command: \`${command}\`
- Exit code: \`${failure.code ?? 'unknown'}\`

## Log Tail

\`\`\`
${tailLines(failure.output)}
\`\`\`

## Next Action

- [ ] Fix the failed step.
- [ ] Re-run \`pnpm agent:local\`.
- [ ] Run \`pnpm agent:ship -- --message "your commit message"\` when checks pass.

---

`;
  fs.writeFileSync(BUGS_FILE, report + existing);
  console.log(`${colors.yellow}Wrote failure report to ${BUGS_FILE}${colors.reset}`);
}

async function tryHeal(failure) {
  const failures = [
    {
      title: failure.name,
      details: [
        `Command: ${formatCommand(failure.cmd, failure.args)}`,
        ...tailLines(failure.output, 20).split('\n'),
      ],
    },
  ];
  const { tryAutoHeal } = await import('./heal-bug.js');
  return tryAutoHeal({
    failures,
    rawOutput: failure.output,
    workspaceRoot: ROOT,
    geminiKey: process.env.GEMINI_API_KEY,
    anthropicKey: process.env.ANTHROPIC_API_KEY,
  });
}

async function runAllChecks(opts) {
  const checks = checksFor(opts);
  for (const check of checks) {
    const result = await run(check.cmd, check.args, { name: check.name, env: check.env });
    if (!result.ok) return result;
  }
  return null;
}

function gitOutput(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
}

function configureGitIdentity() {
  try {
    gitOutput(['config', 'user.email']);
  } catch {
    execFileSync('git', ['config', 'user.email', 'vently-bot@users.noreply.github.com'], {
      cwd: ROOT,
      stdio: 'inherit',
    });
  }
  try {
    gitOutput(['config', 'user.name']);
  } catch {
    execFileSync('git', ['config', 'user.name', 'Vently Local Agent'], {
      cwd: ROOT,
      stdio: 'inherit',
    });
  }
}

function defaultCommitMessage(branch) {
  return `chore: local verified changes on ${branch}`;
}

async function commitAndPush(opts) {
  const status = gitOutput(['status', '--porcelain']);
  if (!status) {
    console.log(`${colors.yellow}No local changes to commit.${colors.reset}`);
    return;
  }

  const branch = opts.branch || gitOutput(['rev-parse', '--abbrev-ref', 'HEAD']);
  if (!branch || branch === 'HEAD') {
    throw new Error(
      'Cannot push from detached HEAD. Pass --branch <name> after checking out a branch.',
    );
  }

  configureGitIdentity();
  const message = opts.message || defaultCommitMessage(branch);

  await run('git', ['add', '.'], { name: 'Stage changes' });
  const commit = await run('git', ['commit', '-m', message], { name: `Commit: ${message}` });
  if (!commit.ok) throw new Error('git commit failed');

  const push = await run('git', ['push', 'origin', `HEAD:${branch}`], {
    name: `Push to origin/${branch}`,
  });
  if (!push.ok) throw new Error('git push failed');

  if (branch === 'main') {
    console.log(
      `${colors.green}Pushed to main. GitHub Actions will run CI, then Deploy, then production verification.${colors.reset}`,
    );
  } else {
    console.log(
      `${colors.yellow}Pushed to ${branch}. Production deploy only runs after this reaches main.${colors.reset}`,
    );
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    usage();
    return;
  }

  loadEnvFile('apps/api/.env');
  loadEnvFile('apps/web/.env.local');

  printHeader('Vently Local Ship Agent');
  console.log(opts.push ? 'Mode: check, commit, push' : 'Mode: local checks only');

  let healAttempt = 0;
  while (true) {
    const failure = await runAllChecks(opts);
    if (!failure) break;

    if (opts.heal && healAttempt < opts.maxHeal) {
      healAttempt += 1;
      console.log(
        `\n${colors.yellow}Attempting Gemini heal ${healAttempt}/${opts.maxHeal}...${colors.reset}`,
      );
      const healed = await tryHeal(failure);
      if (healed.applied) {
        console.log(`${colors.green}Heal applied: ${healed.reason}${colors.reset}`);
        console.log(
          `${colors.green}Files changed: ${healed.filesChanged.join(', ')}${colors.reset}`,
        );
        continue;
      }
      console.log(`${colors.yellow}Heal skipped: ${healed.reason}${colors.reset}`);
    }

    writeBugsMd(failure);
    process.exit(1);
  }

  console.log(`\n${colors.green}${colors.bold}All local checks passed.${colors.reset}`);
  if (!opts.push) {
    console.log(
      'Run `pnpm agent:ship -- --message "your commit message"` to commit, push, and trigger deploy.',
    );
    return;
  }

  await commitAndPush(opts);
}

main().catch((error) => {
  console.error(
    `${colors.red}${colors.bold}Local ship agent failed:${colors.reset} ${error.message}`,
  );
  process.exit(1);
});
