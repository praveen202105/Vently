import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma, type Profile } from '@prisma/client';
import { createHash } from 'node:crypto';
import { ProfilesRepository } from './profiles.repository.js';
import { EmbeddingService } from './embedding.service.js';
import type { UpsertProfileDto, UpdateProfileDto } from './dto/upsert-profile.dto.js';

function avatarSeedFor(nickname: string) {
  return createHash('sha1').update(nickname.toLowerCase()).digest('hex').slice(0, 16);
}

@Injectable()
export class ProfilesService {
  constructor(
    private readonly profiles: ProfilesRepository,
    private readonly embedding: EmbeddingService,
  ) {}

  async upsert(userId: string, dto: UpsertProfileDto): Promise<Profile> {
    let bioEmbedding: Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue = Prisma.DbNull;
    if (dto.bio) {
      const embeddingArray = await this.embedding.generate(dto.bio);
      if (embeddingArray) {
        bioEmbedding = embeddingArray as Prisma.InputJsonValue;
      }
    }

    try {
      return await this.profiles.upsert(userId, {
        nickname: dto.nickname,
        gender: dto.gender,
        bio: dto.bio,
        mood: dto.mood,
        avatarSeed: avatarSeedFor(dto.nickname),
        bioEmbedding,
        activeStartHour: dto.activeStartHour ?? undefined,
        activeEndHour: dto.activeEndHour ?? undefined,
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
    if (dto.bio !== undefined) {
      data.bio = dto.bio;
      if (dto.bio === null || dto.bio.trim() === '') {
        data.bioEmbedding = Prisma.DbNull;
      } else {
        const embeddingArray = await this.embedding.generate(dto.bio);
        if (embeddingArray) {
          data.bioEmbedding = embeddingArray as Prisma.InputJsonValue;
        }
      }
    }
    if (dto.mood !== undefined) data.mood = dto.mood;
    if (dto.activeStartHour !== undefined) data.activeStartHour = dto.activeStartHour;
    if (dto.activeEndHour !== undefined) data.activeEndHour = dto.activeEndHour;

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
