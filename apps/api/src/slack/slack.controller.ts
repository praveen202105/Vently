import { Controller, Post, Body, HttpCode, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Controller('slack')
export class SlackController {
  private readonly logger = new Logger(SlackController.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * Receives incoming Slack slash commands (e.g. /verify-vently).
   * Responds with an interactive Block Kit developer dashboard containing a run trigger button!
   */
  @Post('trigger-verify')
  @HttpCode(HttpStatus.OK)
  async triggerVerify(@Body() body: any) {
    const slackUser = body.user_name || 'Anonymous';
    const commandText = (body.text || 'main').trim();

    this.logger.log(
      `Slack Slash Command '/verify-vently' requested by @${slackUser} for branch: ${commandText}`,
    );

    return {
      response_type: 'in_channel',
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '🛠️ Vently CI/CD Pipeline Dashboard',
            emoji: true,
          },
        },
        {
          type: 'divider',
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Pipeline Action:* Ready to run local E2E verification, commit/push, and run production smoke tests.\n*Target Branch:* \`${commandText}\`\n*Requested By:* \`@${slackUser}\``,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: 'Click the primary button below to manually start the automated CI/CD pipeline:',
          },
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: `🚀 Run '${commandText}' Pipeline`,
                emoji: true,
              },
              action_id: 'trigger_pipeline_action',
              value: commandText,
              style: 'primary',
            },
          ],
        },
        {
          type: 'divider',
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: '⚡ *Vently CI/CD Integration Bot* • Remote dispatch ready',
            },
          ],
        },
      ],
    };
  }

  /**
   * Receives incoming interactive actions from Slack (such as button clicks).
   * Triggers the GitHub Repository Dispatch API and updates the Slack message layout.
   */
  @Post('interactivity')
  @HttpCode(HttpStatus.OK)
  async handleInteractivity(@Body() body: any) {
    if (!body.payload) {
      this.logger.warn('Incoming Slack interactivity POST is missing the payload body field.');
      return { error: 'Payload missing' };
    }

    try {
      const payload = JSON.parse(body.payload);
      const action = payload.actions?.[0];
      const slackUser = payload.user?.name || 'Anonymous';
      // Diagnostic: log every interactivity hit so we can tell from Railway
      // logs whether button clicks are actually reaching this endpoint.
      this.logger.log(
        `[slack/interactivity] action_id=${action?.action_id || 'none'} user=@${slackUser} build=heal-v2`,
      );
      const responseUrl = payload.response_url;

      // Heal-strategy buttons posted by verify-feature.js on test failure.
      // Two action_ids share the same dispatch path; only the `mode` field
      // (decoded from the button value) tells heal.yml whether to land
      // the patch on `main` or on a fresh auto-heal branch + PR.
      if (
        action &&
        (action.action_id === 'heal_same_branch' || action.action_id === 'heal_new_branch')
      ) {
        const githubToken = this.config.get<string>('GITHUB_TOKEN');
        const owner = this.config.get<string>('GITHUB_OWNER') || 'praveen202105';
        const repo = this.config.get<string>('GITHUB_REPO') || 'Vently';

        let ctx: { mode?: string; commit?: string; run_id?: string; phase?: string } = {};
        try {
          ctx = JSON.parse(Buffer.from(action.value || '', 'base64').toString('utf8'));
        } catch {
          this.logger.error(`Could not decode heal button value: ${action.value}`);
        }
        const mode = ctx.mode || 'same_branch';

        this.logger.log(
          `Slack heal button clicked by @${slackUser} mode=${mode} commit=${ctx.commit}`,
        );

        if (!githubToken) {
          this.logger.error('GITHUB_TOKEN missing — cannot dispatch heal workflow.');
          if (responseUrl) {
            await this.updateSlackMessage(responseUrl, {
              text: '❌ Heal aborted: `GITHUB_TOKEN` is not configured on the backend.',
            });
          }
          return;
        }

        const dispatchRes = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/dispatches`,
          {
            method: 'POST',
            headers: {
              Accept: 'application/vnd.github+json',
              Authorization: `Bearer ${githubToken}`,
              'X-GitHub-Api-Version': '2022-11-28',
              'User-Agent': 'Vently-NestJS-Backend',
            },
            body: JSON.stringify({
              event_type: 'heal_pipeline',
              client_payload: {
                mode,
                commit: ctx.commit || '',
                run_id: ctx.run_id || '',
                phase: ctx.phase || '',
                triggered_by_slack: slackUser,
              },
            }),
          },
        );

        if (!dispatchRes.ok) {
          const errText = await dispatchRes.text();
          this.logger.error(`Heal dispatch failed: ${dispatchRes.status} - ${errText}`);
          if (responseUrl) {
            await this.updateSlackMessage(responseUrl, {
              text: `❌ Heal dispatch failed (${dispatchRes.status}): \`${errText}\``,
            });
          }
          return;
        }

        if (responseUrl) {
          const branchLabel = mode === 'new_branch' ? '`auto-heal/<sha>` (new branch)' : '`main`';
          await this.updateSlackMessage(responseUrl, {
            response_type: 'in_channel',
            replace_original: true,
            blocks: [
              {
                type: 'header',
                text: { type: 'plain_text', text: '🤖 Heal Pipeline Triggered', emoji: true },
              },
              { type: 'divider' },
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text:
                    `*Strategy:* ${mode === 'new_branch' ? 'create new branch + open PR' : 'patch in-place on main'}\n` +
                    `*Target:* ${branchLabel}\n` +
                    `*Failing commit:* \`${(ctx.commit || 'unknown').slice(0, 7)}\`\n` +
                    `*Triggered by:* \`@${slackUser}\``,
                },
              },
              { type: 'divider' },
              {
                type: 'context',
                elements: [
                  {
                    type: 'mrkdwn',
                    text: '⚡ Gemini is reading the source. Status update will follow.',
                  },
                ],
              },
            ],
          });
        }
        return;
      }

      if (action && action.action_id === 'trigger_pipeline_action') {
        const branch = (action.value || 'main').trim();
        const githubToken = this.config.get<string>('GITHUB_TOKEN');
        const owner = this.config.get<string>('GITHUB_OWNER') || 'praveen202105';
        const repo = this.config.get<string>('GITHUB_REPO') || 'Vently';

        this.logger.log(`Slack Interactive Button clicked by @${slackUser} for branch: ${branch}`);

        if (!githubToken) {
          this.logger.error(
            'GITHUB_TOKEN is missing in NestJS config — Slack interactivity dispatch aborted.',
          );
          if (responseUrl) {
            await this.updateSlackMessage(responseUrl, {
              text: '❌ Could not trigger the pipeline: `GITHUB_TOKEN` is not configured on the backend NestJS server.',
            });
          }
          return;
        }

        // Dispatch the workflow on GitHub
        const dispatchRes = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/dispatches`,
          {
            method: 'POST',
            headers: {
              Accept: 'application/vnd.github+json',
              Authorization: `Bearer ${githubToken}`,
              'X-GitHub-Api-Version': '2022-11-28',
              'User-Agent': 'Vently-NestJS-Backend',
            },
            body: JSON.stringify({
              event_type: 'verify_pipeline',
              client_payload: {
                branch: branch,
                triggered_by_slack: slackUser,
              },
            }),
          },
        );

        if (!dispatchRes.ok) {
          const errText = await dispatchRes.text();
          this.logger.error(`GitHub Dispatch API failed: ${dispatchRes.status} - ${errText}`);
          if (responseUrl) {
            await this.updateSlackMessage(responseUrl, {
              text: `❌ GitHub Dispatch failed with status ${dispatchRes.status}: \`${errText}\``,
            });
          }
          return;
        }

        // Replace the button card in-place with a dispatch confirmation card
        if (responseUrl) {
          await this.updateSlackMessage(responseUrl, {
            response_type: 'in_channel',
            replace_original: true,
            blocks: [
              {
                type: 'header',
                text: {
                  type: 'plain_text',
                  text: '🚀 Vently Automation Pipeline Triggered',
                  emoji: true,
                },
              },
              {
                type: 'divider',
              },
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `*Pipeline Status:* ⌛ Remote Dispatch Initiated\n*Target Branch:* \`${branch}\`\n*Triggered By:* \`@${slackUser}\` (via Interactive Button)\n*Action:* GitHub Actions E2E verification loop started successfully! 🌐`,
                },
              },
              {
                type: 'section',
                fields: [
                  {
                    type: 'mrkdwn',
                    text: `*Environment:*\nProduction`,
                  },
                  {
                    type: 'mrkdwn',
                    text: `*GitHub Repository:*\n\`${owner}/${repo}\``,
                  },
                ],
              },
              {
                type: 'divider',
              },
              {
                type: 'context',
                elements: [
                  {
                    type: 'mrkdwn',
                    text: '⚡ *Vently CI/CD Integration Bot* • Active monitoring in progress...',
                  },
                ],
              },
            ],
          });
        }
      }

      return;
    } catch (err: any) {
      this.logger.error(`Slack interactivity handler error: ${err.message}`);
      return { error: err.message };
    }
  }

  /**
   * Posts back to Slack response URL to replace or update active messages in-channel.
   */
  private async updateSlackMessage(responseUrl: string, messagePayload: any) {
    try {
      await fetch(responseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(messagePayload),
      });
    } catch (err: any) {
      this.logger.error(`Failed to update Slack message via response_url: ${err.message}`);
    }
  }
}
