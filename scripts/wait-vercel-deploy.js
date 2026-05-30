#!/usr/bin/env node

const PROD_URL = process.env.VERCEL_PROD_URL || 'https://vently-web-gamma.vercel.app';
const token = process.env.VERCEL_TOKEN;
const projectId = process.env.VERCEL_PROJECT_ID;
const teamId = process.env.VERCEL_TEAM_ID || process.env.VERCEL_ORG_ID;
const commitSha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || '';
const commitShort = commitSha.slice(0, 7) || 'unknown';
const waitSeconds = Number(process.env.VERCEL_DEPLOY_WAIT_SECONDS || 600);
const matchWaitSeconds = Number(process.env.VERCEL_MATCH_WAIT_SECONDS || 180);
const intervalSeconds = Number(process.env.VERCEL_DEPLOY_POLL_SECONDS || 15);
const slackWebhook = process.env.SLACK_WEBHOOK_URL;

const runUrl =
  process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_SERVER_URL || 'https://github.com'}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : '';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendSlack(title, description, color, fields = []) {
  if (!slackWebhook) return;

  const finalFields = [...fields];
  if (runUrl) {
    finalFields.push({
      title: 'GitHub Run',
      value: `<${runUrl}|View live logs ↗>`,
      short: false,
    });
  }

  try {
    const res = await fetch(slackWebhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        attachments: [
          {
            color,
            title,
            text: description,
            fields: finalFields,
            footer: 'Vently CI/CD Bot',
            ts: Math.floor(Date.now() / 1000),
          },
        ],
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn(`[Slack] HTTP ${res.status}: ${text}`);
    }
  } catch (err) {
    console.warn(`[Slack] Webhook delivery failed: ${err.message}`);
  }
}

function deploymentUrl(deployment) {
  if (!deployment?.url) return '';
  return deployment.url.startsWith('http') ? deployment.url : `https://${deployment.url}`;
}

async function listDeployments({ sha = commitSha } = {}) {
  const params = new URLSearchParams({
    projectId,
    target: 'production',
    limit: '10',
  });
  if (sha) params.set('sha', sha);
  if (teamId) params.set('teamId', teamId);

  const res = await fetch(`https://api.vercel.com/v6/deployments?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Vercel API ${res.status}: ${text}`);
  }

  return res.json();
}

function pickDeployment(deployments) {
  return deployments
    .filter((deployment) => deployment.target === 'production')
    .sort((a, b) => (b.createdAt || b.created || 0) - (a.createdAt || a.created || 0))[0];
}

async function main() {
  if (!token || !projectId) {
    const missing = [!token ? 'VERCEL_TOKEN' : '', !projectId ? 'VERCEL_PROJECT_ID' : ''].filter(
      Boolean,
    );
    const message = `Skipping Vercel web deploy status because ${missing.join(', ')} is not configured.`;
    console.warn(message);
    await sendSlack('▲ Vercel Web deploy status skipped', message, '#daa038', [
      { title: 'Commit', value: commitShort, short: true },
      { title: 'Required secrets', value: '`VERCEL_TOKEN`, `VERCEL_PROJECT_ID`', short: false },
    ]);
    return;
  }

  await sendSlack(
    '▲ Vercel Web deploy check started',
    `Waiting for Vercel production deployment for commit \`${commitShort}\`.`,
    '#3aa3e3',
    [
      { title: 'Commit', value: commitShort, short: true },
      { title: 'Production URL', value: `<${PROD_URL}|Open web app>`, short: true },
    ],
  );

  const startedAt = Date.now();
  let lastState = 'not found';
  let lastDeployment = null;
  let foundMatchingDeployment = false;

  while (Date.now() - startedAt <= waitSeconds * 1000) {
    const result = await listDeployments();
    const deployment = pickDeployment(result.deployments || []);
    lastDeployment = deployment || lastDeployment;

    if (!deployment) {
      console.log(`No Vercel production deployment found yet for ${commitShort}.`);
      if (Date.now() - startedAt > matchWaitSeconds * 1000) {
        const latest = await listDeployments({ sha: '' });
        const latestReady = (latest.deployments || []).find(
          (candidate) =>
            candidate.target === 'production' &&
            (candidate.readyState === 'READY' || candidate.state === 'READY'),
        );
        if (!latestReady) {
          console.log('No latest READY Vercel production deployment found yet.');
          await sleep(intervalSeconds * 1000);
          continue;
        }
        const latestUrl = deploymentUrl(latestReady);
        await sendSlack(
          '▲ Vercel Web deploy unchanged',
          `No new frontend deployment appeared for commit \`${commitShort}\` within ${matchWaitSeconds}s. Continuing with the latest READY production web deployment.`,
          '#daa038',
          [
            { title: 'Commit', value: commitShort, short: true },
            { title: 'Production URL', value: `<${PROD_URL}|Open web app>`, short: true },
            ...(latestUrl
              ? [
                  {
                    title: 'Latest deployment',
                    value: `<${latestUrl}|${latestReady.url}>`,
                    short: false,
                  },
                ]
              : []),
            ...(latestReady?.inspectorUrl
              ? [
                  {
                    title: 'Vercel Logs',
                    value: `<${latestReady.inspectorUrl}|Open deployment>`,
                    short: false,
                  },
                ]
              : []),
          ],
        );
        return;
      }
      await sleep(intervalSeconds * 1000);
      continue;
    }

    foundMatchingDeployment = true;
    lastState = deployment.readyState || deployment.state || 'unknown';
    const url = deploymentUrl(deployment);
    console.log(`Vercel deployment ${deployment.uid || deployment.id} is ${lastState}: ${url}`);

    if (lastState === 'READY') {
      await sendSlack(
        '▲ Vercel Web deploy ✅',
        `Frontend deployed for commit \`${commitShort}\`.`,
        '#2eb886',
        [
          { title: 'State', value: lastState, short: true },
          { title: 'Production URL', value: `<${PROD_URL}|Open web app>`, short: true },
          ...(url
            ? [{ title: 'Deployment', value: `<${url}|${deployment.url}>`, short: false }]
            : []),
          ...(deployment.inspectorUrl
            ? [
                {
                  title: 'Vercel Logs',
                  value: `<${deployment.inspectorUrl}|Open deployment>`,
                  short: false,
                },
              ]
            : []),
        ],
      );
      return;
    }

    if (
      lastState === 'CANCELED' &&
      /not affected|ignored|skip/i.test(deployment.errorMessage || '')
    ) {
      await sendSlack(
        '▲ Vercel Web deploy skipped',
        `Vercel did not create a new frontend build for commit \`${commitShort}\`: ${deployment.errorMessage}`,
        '#daa038',
        [
          { title: 'State', value: lastState, short: true },
          { title: 'Production URL', value: `<${PROD_URL}|Open web app>`, short: true },
          ...(deployment.inspectorUrl
            ? [
                {
                  title: 'Vercel Logs',
                  value: `<${deployment.inspectorUrl}|Open deployment>`,
                  short: false,
                },
              ]
            : []),
        ],
      );
      return;
    }

    if (['ERROR', 'CANCELED'].includes(lastState)) {
      const detail =
        deployment.errorMessage || deployment.errorCode || 'Deployment did not complete.';
      await sendSlack(
        '▲ Vercel Web deploy ❌',
        `Frontend deployment failed for commit \`${commitShort}\`: ${detail}`,
        '#a30200',
        [
          { title: 'State', value: lastState, short: true },
          ...(deployment.inspectorUrl
            ? [
                {
                  title: 'Vercel Logs',
                  value: `<${deployment.inspectorUrl}|Open deployment>`,
                  short: false,
                },
              ]
            : []),
        ],
      );
      throw new Error(`Vercel deployment failed: ${detail}`);
    }

    await sleep(intervalSeconds * 1000);
  }

  const url = deploymentUrl(lastDeployment);
  await sendSlack(
    '▲ Vercel Web deploy timeout',
    `Timed out waiting for Vercel deployment for commit \`${commitShort}\`. Last state: \`${lastState}\`. Matching deployment found: \`${foundMatchingDeployment}\`.`,
    '#a30200',
    [
      { title: 'Waited', value: `${waitSeconds}s`, short: true },
      ...(url
        ? [{ title: 'Last deployment', value: `<${url}|${lastDeployment.url}>`, short: false }]
        : []),
    ],
  );
  throw new Error(`Timed out waiting for Vercel deployment. Last state: ${lastState}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
