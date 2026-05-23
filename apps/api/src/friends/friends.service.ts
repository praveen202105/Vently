import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FriendsRepository } from './friends.repository.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class FriendsService {
  constructor(
    private readonly repo: FriendsRepository,
    private readonly prisma: PrismaService,
  ) {}

  async listFriends(userId: string) {
    const friendRows = await this.repo.listFriendsForUser(userId);
    if (friendRows.length === 0) return [];

    const friendIds = friendRows.map((r) => r.friendUserId);
    const profiles = await this.prisma.profile.findMany({
      where: { userId: { in: friendIds } },
    });
    const profileMap = new Map(profiles.map((p) => [p.userId, p]));

    // Find the FRIEND-type conversation per pair. Filter by type so a stray
    // DIRECT conversation between the same two users (rematch after unfriend,
    // legacy data) doesn't shadow the real friend thread. There's at most one
    // active FRIEND conversation per pair by construction (respond() promotes
    // the existing one, the fallback below creates one when none exists).
    const conversations = await this.prisma.conversation.findMany({
      where: {
        type: 'FRIEND',
        endedAt: null,
        AND: [
          { participants: { some: { userId } } },
          { participants: { some: { userId: { in: friendIds } } } },
        ],
      },
      include: {
        participants: { select: { userId: true } },
        // Most-recent non-deleted message per conv — drives the tile preview.
        messages: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true, body: true, senderId: true, type: true, createdAt: true },
        },
      },
    });

    interface FriendConvSummary {
      id: string;
      lastMessage: {
        id: string;
        body: string;
        senderId: string;
        type: string;
        createdAt: string;
      } | null;
    }
    const convoByFriendId = new Map<string, FriendConvSummary>();
    for (const c of conversations) {
      const peer = c.participants.find((p) => p.userId !== userId);
      if (!peer) continue;
      const last = c.messages[0];
      convoByFriendId.set(peer.userId, {
        id: c.id,
        lastMessage: last
          ? {
              id: last.id,
              body: last.body,
              senderId: last.senderId,
              type: last.type,
              createdAt: last.createdAt.toISOString(),
            }
          : null,
      });
    }

    // Per-conversation unread count for the badge on each friend tile.
    // Aggregated in one query with groupBy so we don't run N+1 counts.
    const convIds = [...convoByFriendId.values()].map((v) => v.id);
    const unreadGroups = convIds.length
      ? await this.prisma.message.groupBy({
          by: ['conversationId'],
          where: {
            conversationId: { in: convIds },
            deletedAt: null,
            senderId: { not: userId },
            receipts: { none: { userId, readAt: { not: null } } },
          },
          _count: { _all: true },
        })
      : [];
    const unreadByConvId = new Map<string, number>(
      unreadGroups.map((g) => [g.conversationId, g._count._all]),
    );

    return friendRows.map((r) => {
      const profile = profileMap.get(r.friendUserId);
      const summary = convoByFriendId.get(r.friendUserId);
      return {
        profile: profile
          ? {
              ...profile,
              lastSeenAt: profile.lastSeenAt.toISOString(),
              createdAt: profile.createdAt.toISOString(),
              updatedAt: profile.updatedAt.toISOString(),
            }
          : null,
        friendedAt: r.since.toISOString(),
        conversationId: summary?.id ?? null,
        lastMessage: summary?.lastMessage ?? null,
        unreadCount: summary ? (unreadByConvId.get(summary.id) ?? 0) : 0,
      };
    });
  }

  async sendRequest(fromUserId: string, toUserId: string) {
    if (fromUserId === toUserId) {
      throw new BadRequestException("You can't friend yourself");
    }

    // Already friends?
    const existing = await this.repo.findFriendship(fromUserId, toUserId);
    if (existing) throw new ConflictException('Already friends');

    // Existing pending request in either direction?
    const outgoing = await this.repo.findRequestBetween(fromUserId, toUserId);
    if (outgoing && outgoing.status === 'PENDING') {
      throw new ConflictException('Already requested');
    }
    const incoming = await this.repo.findRequestBetween(toUserId, fromUserId);
    if (incoming && incoming.status === 'PENDING') {
      // Auto-accept if the other side already asked.
      return this.respond(fromUserId, incoming.id, true);
    }

    const request = await this.repo.createRequest(fromUserId, toUserId);
    return { kind: 'requested' as const, request };
  }

  async respond(userId: string, requestId: string, accept: boolean) {
    const req = await this.repo.findRequest(requestId);
    if (!req) throw new NotFoundException('Request not found');
    if (req.toUserId !== userId) throw new ForbiddenException('Not your request');
    if (req.status !== 'PENDING') throw new ConflictException('Already resolved');

    if (!accept) {
      const updated = await this.repo.updateRequestStatus(req.id, 'REJECTED');
      return { kind: 'rejected' as const, request: updated };
    }

    const updated = await this.repo.updateRequestStatus(req.id, 'ACCEPTED');
    await this.repo.createFriendship(req.fromUserId, req.toUserId);

    // Promote the active conversation (if any) to type=FRIEND + insert a
    // SYSTEM message so both clients see "You're now friends!".
    const shared = await this.prisma.conversation.findFirst({
      where: {
        endedAt: null,
        AND: [
          { participants: { some: { userId: req.fromUserId } } },
          { participants: { some: { userId: req.toUserId } } },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });

    let conversationId: string;
    if (shared) {
      await this.prisma.conversation.update({
        where: { id: shared.id },
        data: { type: 'FRIEND' },
      });
      conversationId = shared.id;
    } else {
      // Edge case: friends accepted with no active conversation between them
      // (legacy data, request expired then revived, or future flows that
      // create friendships outside of an in-progress chat). Create the
      // FRIEND conversation on the spot so it's available from /connections
      // immediately, with no client-side branching for "friend with no
      // conversation yet".
      const fresh = await this.prisma.conversation.create({
        data: {
          type: 'FRIEND',
          participants: {
            create: [{ userId: req.fromUserId }, { userId: req.toUserId }],
          },
        },
      });
      conversationId = fresh.id;
    }

    await this.prisma.message.create({
      data: {
        conversationId,
        senderId: req.toUserId,
        body: "You're now friends!",
        type: 'SYSTEM',
      },
    });

    return { kind: 'accepted' as const, request: updated, conversationId };
  }

  async cancelRequest(userId: string, requestId: string) {
    const req = await this.repo.findRequest(requestId);
    if (!req) throw new NotFoundException('Request not found');
    if (req.fromUserId !== userId) throw new ForbiddenException('Not your request');
    if (req.status !== 'PENDING') throw new ConflictException('Already resolved');
    return this.repo.updateRequestStatus(req.id, 'CANCELLED');
  }

  async listIncomingRequests(userId: string) {
    const rows = await this.repo.listIncoming(userId);
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.fromUserId);
    const profiles = await this.prisma.profile.findMany({ where: { userId: { in: ids } } });
    const map = new Map(profiles.map((p) => [p.userId, p]));
    return rows.map((r) => ({
      id: r.id,
      fromUserId: r.fromUserId,
      toUserId: r.toUserId,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      from: (() => {
        const p = map.get(r.fromUserId);
        return p
          ? {
              ...p,
              lastSeenAt: p.lastSeenAt.toISOString(),
              createdAt: p.createdAt.toISOString(),
              updatedAt: p.updatedAt.toISOString(),
            }
          : undefined;
      })(),
    }));
  }

  async unfriend(userId: string, friendUserId: string): Promise<{ endedConversationIds: string[] }> {
    const friendship = await this.repo.findFriendship(userId, friendUserId);
    if (!friendship) throw new NotFoundException('Not friends');
    await this.repo.deleteFriendship(userId, friendUserId);

    // End the FRIEND conversation so it disappears from /connections on both
    // sides. Mirror the block + chat-leave flow: return the IDs and let the
    // controller emit CHAT_CONVERSATION_ENDED to the other side (controller
    // has the RealtimeGateway dep, this service can't without re-introducing
    // the cycle we broke in Batch D).
    const activeConvs = await this.prisma.conversation.findMany({
      where: {
        type: 'FRIEND',
        endedAt: null,
        AND: [
          { participants: { some: { userId } } },
          { participants: { some: { userId: friendUserId } } },
        ],
      },
      select: { id: true },
    });
    if (activeConvs.length > 0) {
      await this.prisma.conversation.updateMany({
        where: { id: { in: activeConvs.map((c) => c.id) } },
        data: { endedAt: new Date() },
      });
    }
    return { endedConversationIds: activeConvs.map((c) => c.id) };
  }
}
