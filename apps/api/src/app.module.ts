import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { PrismaModule } from './prisma/prisma.module.js';
import { RedisModule } from './redis/redis.module.js';
import { HealthModule } from './health/health.module.js';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';
import { ProfilesModule } from './profiles/profiles.module.js';
import { ConversationsModule } from './conversations/conversations.module.js';
import { MessagesModule } from './messages/messages.module.js';
import { PresenceModule } from './presence/presence.module.js';
import { MatchmakingModule } from './matchmaking/matchmaking.module.js';
import { ChatModule } from './chat/chat.module.js';
import { RealtimeModule } from './realtime/realtime.module.js';
import { FriendsModule } from './friends/friends.module.js';
import { BlocksModule } from './blocks/blocks.module.js';
import { WebrtcModule } from './webrtc/webrtc.module.js';
import { CallsModule } from './calls/calls.module.js';
import { ModerationModule } from './moderation/moderation.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { PushModule } from './push/push.module.js';
import { IcebreakerModule } from './icebreaker/icebreaker.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { singleLine: true } }
            : undefined,
        redact: {
          paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.token'],
          censor: '[REDACTED]',
        },
      },
    }),
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000, limit: 10 },
      // E2E suite hammers /auth/register; loosen in dev/test, tighten in prod.
      {
        name: 'medium',
        ttl: 60_000,
        limit: process.env.NODE_ENV === 'production' ? 100 : 1000,
      },
    ]),
    PrismaModule,
    RedisModule,
    HealthModule,
    AuthModule,
    UsersModule,
    ProfilesModule,
    ConversationsModule,
    MessagesModule,
    PresenceModule,
    MatchmakingModule,
    ChatModule,
    RealtimeModule,
    FriendsModule,
    BlocksModule,
    WebrtcModule,
    CallsModule,
    ModerationModule,
    NotificationsModule,
    PushModule,
    ReportsModule,
    IcebreakerModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
