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

    // Find a shared FRIEND-type conversation per pair (the one promoted from
    // the original match — there is only one per friendship).
    const conversations = await this.prisma.conversation.findMany({
      where: {
        participants: {
          some: { userId },
        },
        AND: [
          {
            participants: {
              some: { userId: { in: friendIds } },
            },
          },
        ],
      },
      include: {
        participants: { select: { userId: true } },
      },
    });

    const convoByFriendId = new Map<string, string>();
    for (const c of conversations) {
      const peer = c.participants.find((p) => p.userId !== userId);
      if (peer) convoByFriendId.set(peer.userId, c.id);
    }

    return friendRows.map((r) => {
      const profile = profileMap.get(r.friendUserId);
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
        conversationId: convoByFriendId.get(r.friendUserId) ?? null,
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
    if (shared) {
      await this.prisma.conversation.update({
        where: { id: shared.id },
        data: { type: 'FRIEND' },
      });
      await this.prisma.message.create({
        data: {
          conversationId: shared.id,
          senderId: req.toUserId,
          body: "You're now friends!",
          type: 'SYSTEM',
        },
      });
    }

    return { kind: 'accepted' as const, request: updated, conversationId: shared?.id ?? null };
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

  async unfriend(userId: string, friendUserId: string) {
    const friendship = await this.repo.findFriendship(userId, friendUserId);
    if (!friendship) throw new NotFoundException('Not friends');
    await this.repo.deleteFriendship(userId, friendUserId);
  }
}
