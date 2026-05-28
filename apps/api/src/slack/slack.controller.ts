import { Controller, Post, Body, HttpCode, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Controller('slack')
export class SlackController {
  private readonly logger = new Logger(SlackController.name);

  constructor(private readonly config: ConfigService) {}

  @Post('trigger-verify')
  @HttpCode(HttpStatus.OK)
  async triggerVerify(@Body() body: any) {
    const slackUser = body.user_name || 'Anonymous';
    const channelId = body.channel_id;
    const commandText = (body.text || 'main').trim();

    const githubToken = this.config.get<string>('GITHUB_TOKEN');
    const owner = this.config.get<string>('GITHUB_OWNER') || 'praveen202105';
    const repo = this.config.get<string>('GITHUB_REPO') || 'Vently';

    this.logger.log(`Slack Slash Command '/verify-vently' triggered by @${slackUser} for branch/payload: ${commandText}`);

    if (!githubToken) {
      this.logger.warn('GITHUB_TOKEN is missing in environment configs — Slack trigger aborted');
      return {
        response_type: 'ephemeral',
        text: '❌ Could not trigger the pipeline: `GITHUB_TOKEN` is not configured on the backend NestJS server.',
      };
    }

    try {
      // Dispatch the workflow run on GitHub
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/dispatches`, {
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
            branch: commandText,
            triggered_by_slack: slackUser,
            slack_channel: channelId,
          },
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        this.logger.error(`GitHub Dispatch API failed: ${res.status} - ${errText}`);
        return {
          response_type: 'ephemeral',
          text: `❌ GitHub Dispatch failed with status ${res.status}: \`${errText}\``,
        };
      }

      return {
        response_type: 'in_channel',
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
              text: `*Pipeline Status:* ⌛ Remote Dispatch Initiated\n*Target Branch:* \`${commandText}\`\n*Triggered By:* \`@${slackUser}\`\n*Action:* GitHub Actions E2E verification loop started successfully! 🌐`
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
      };
    } catch (err: any) {
      this.logger.error(`Slack trigger controller error: ${err.message}`);
      return {
        response_type: 'ephemeral',
        text: `❌ An unexpected error occurred while dispatching the pipeline: \`${err.message}\``,
      };
    }
  }
}
