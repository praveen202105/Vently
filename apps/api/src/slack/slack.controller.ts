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

    this.logger.log(`Slack Slash Command '/verify-vently' requested by @${slackUser} for branch: ${commandText}`);

    return {
      response_type: 'in_channel',
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '🛠️ Vently CI/CD Pipeline Dashboard',
            emoji: true
          }
        },
        {
          type: 'divider'
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Pipeline Action:* Ready to run local E2E verification, commit/push, and run production smoke tests.\n*Target Branch:* \`${commandText}\`\n*Requested By:* \`@${slackUser}\``
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: 'Click the primary button below to manually start the automated CI/CD pipeline:'
          }
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: `🚀 Run '${commandText}' Pipeline`,
                emoji: true
              },
              action_id: 'trigger_pipeline_action',
              value: commandText,
              style: 'primary'
            }
          ]
        },
        {
          type: 'divider'
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: '⚡ *Vently CI/CD Integration Bot* • Remote dispatch ready'
            }
          ]
        }
      ]
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
      const responseUrl = payload.response_url;

      if (action && action.action_id === 'trigger_pipeline_action') {
        const branch = (action.value || 'main').trim();
        const githubToken = this.config.get<string>('GITHUB_TOKEN');
        const owner = this.config.get<string>('GITHUB_OWNER') || 'praveen202105';
        const repo = this.config.get<string>('GITHUB_REPO') || 'Vently';

        this.logger.log(`Slack Interactive Button clicked by @${slackUser} for branch: ${branch}`);

        if (!githubToken) {
          this.logger.error('GITHUB_TOKEN is missing in NestJS config — Slack interactivity dispatch aborted.');
          if (responseUrl) {
            await this.updateSlackMessage(responseUrl, {
              text: '❌ Could not trigger the pipeline: `GITHUB_TOKEN` is not configured on the backend NestJS server.',
            });
          }
          return;
        }

        // Dispatch the workflow on GitHub
        const dispatchRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/dispatches`, {
          method: 'POST',
          headers: {
            'Accept': 'application/vnd.github+json',
            'Authorization': `Bearer ${githubToken}`,
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
        });

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
                  emoji: true
                }
              },
              {
                type: 'divider'
              },
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `*Pipeline Status:* ⌛ Remote Dispatch Initiated\n*Target Branch:* \`${branch}\`\n*Triggered By:* \`@${slackUser}\` (via Interactive Button)\n*Action:* GitHub Actions E2E verification loop started successfully! 🌐`
                }
              },
              {
                type: 'section',
                fields: [
                  {
                    type: 'mrkdwn',
                    text: `*Environment:*\nProduction`
                  },
                  {
                    type: 'mrkdwn',
                    text: `*GitHub Repository:*\n\`${owner}/${repo}\``
                  }
                ]
              },
              {
                type: 'divider'
              },
              {
                type: 'context',
                elements: [
                  {
                    type: 'mrkdwn',
                    text: '⚡ *Vently CI/CD Integration Bot* • Active monitoring in progress...'
                  }
                ]
              }
            ]
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
