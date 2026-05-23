import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class ProfilesRepository {
  constructor(private readonly prisma: PrismaService) {}

  find(userId: string) {
    return this.prisma.profile.findUnique({ where: { userId } });
  }

  findByNickname(nickname: string) {
    return this.prisma.profile.findUnique({ where: { nickname } });
  }

  upsert(userId: string, data: Prisma.ProfileCreateInput) {
    return this.prisma.profile.upsert({
      where: { userId },
      create: data,
      update: {
        nickname: data.nickname,
        gender: data.gender,
        bio: data.bio,
        mood: data.mood,
      },
    });
  }

  update(userId: string, data: Prisma.ProfileUpdateInput) {
    return this.prisma.profile.update({ where: { userId }, data });
  }
}
