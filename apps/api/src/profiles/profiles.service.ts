import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma, type Profile } from '@prisma/client';
import { createHash } from 'node:crypto';
import { ProfilesRepository } from './profiles.repository.js';
import type { UpsertProfileDto, UpdateProfileDto } from './dto/upsert-profile.dto.js';

function avatarSeedFor(nickname: string) {
  return createHash('sha1').update(nickname.toLowerCase()).digest('hex').slice(0, 16);
}

@Injectable()
export class ProfilesService {
  constructor(private readonly profiles: ProfilesRepository) {}

  async upsert(userId: string, dto: UpsertProfileDto): Promise<Profile> {
    try {
      return await this.profiles.upsert(userId, {
        nickname: dto.nickname,
        gender: dto.gender,
        bio: dto.bio,
        mood: dto.mood,
        avatarSeed: avatarSeedFor(dto.nickname),
        user: { connect: { id: userId } },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Nickname is taken');
      }
      throw err;
    }
  }

  async update(userId: string, dto: UpdateProfileDto): Promise<Profile> {
    const data: Prisma.ProfileUpdateInput = {};
    if (dto.nickname !== undefined) {
      data.nickname = dto.nickname;
      data.avatarSeed = avatarSeedFor(dto.nickname);
    }
    if (dto.bio !== undefined) data.bio = dto.bio;
    if (dto.mood !== undefined) data.mood = dto.mood;

    try {
      return await this.profiles.update(userId, data);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Nickname is taken');
      }
      throw err;
    }
  }
}
