import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { checkProfanity, type ProfanityResult } from './profanity.filter.js';

const SEVERITY_RANK: Record<ProfanityResult['severity'], number> = {
  CLEAN: 0,
  MILD: 1,
  SEVERE: 3,
};

@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Inspects a message body before persisting. Caller decides what to do:
   * SEVERE → don't persist + reject; MILD → persist but write a flag; CLEAN → noop.
   */
  inspectMessage(body: string) {
    return checkProfanity(body);
  }

  async flagMessage(messageId: string, result: ProfanityResult, action?: string) {
    if (result.severity === 'CLEAN') return;
    await this.prisma.moderationFlag.create({
      data: {
        messageId,
        reason: `profanity:${result.severity.toLowerCase()}:${result.match}`,
        severity: SEVERITY_RANK[result.severity],
        action,
      },
    });
  }

  // For severe rejections we still want a trail, but there's no Message row
  // yet — store the flag with messageId=null + the rejected body in `reason`.
  async logRejection(userId: string, body: string, result: ProfanityResult) {
    if (result.severity !== 'SEVERE') return;
    await this.prisma.moderationFlag.create({
      data: {
        reason: `rejected:${userId}:${result.match}`,
        severity: SEVERITY_RANK.SEVERE,
        action: 'BLOCKED',
      },
    });
    this.logger.warn(`Rejected severe message from ${userId}: matched ${result.match}`);
  }
}
