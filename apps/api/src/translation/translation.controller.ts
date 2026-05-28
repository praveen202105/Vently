import { Body, Controller, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { IsString, Length } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator.js';
import { ConversationsService } from '../conversations/conversations.service.js';
import { TranslationService, type TranslateResult } from './translation.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

class TranslateMessageDto {
  @IsString()
  @Length(2, 35)
  targetLocale!: string;
}

/**
 * POST /api/conversations/:conversationId/messages/:messageId/translate
 *
 * Accepts the viewer's browser locale (e.g. "en", "hi", "es-MX") and
 * returns the detected source language, translated message body, and 3
 * localized reply chip suggestions — all generated in a single Groq call.
 * Translations are NEVER persisted; they are ephemeral UI overlays.
 */
@Controller('conversations/:conversationId/messages/:messageId/translate')
@UseGuards(JwtAuthGuard)
export class TranslationController {
  constructor(
    private readonly conversations: ConversationsService,
    private readonly translation: TranslationService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  async translate(
    @CurrentUser() user: AuthUser,
    @Param('conversationId') conversationId: string,
    @Param('messageId') messageId: string,
    @Body() dto: TranslateMessageDto,
  ): Promise<TranslateResult> {
    // Membership check — only participants can translate messages in a conv.
    await this.conversations.assertParticipant(conversationId, user.userId);

    // Fetch message body + verify it belongs to this conversation.
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { body: true, conversationId: true },
    });

    if (!message || message.conversationId !== conversationId) {
      throw new NotFoundException('Message not found');
    }

    // Look up the sender's mood for localized chip tone.
    const senderProfile = await this.prisma.conversationParticipant.findFirst({
      where: { conversationId, userId: { not: user.userId } },
      select: { userId: true },
    });
    const senderMood = senderProfile
      ? await this.prisma.profile
          .findUnique({ where: { userId: senderProfile.userId }, select: { mood: true } })
          .then((p) => p?.mood ?? null)
      : null;

    return this.translation.translate({
      body: message.body,
      targetLocale: dto.targetLocale,
      mood: senderMood,
    });
  }
}
