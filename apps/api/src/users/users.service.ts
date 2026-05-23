import { Injectable, NotFoundException } from '@nestjs/common';
import { UsersRepository } from './users.repository.js';

@Injectable()
export class UsersService {
  constructor(private readonly users: UsersRepository) {}

  async getMe(userId: string) {
    const user = await this.users.findWithProfile(userId);
    if (!user) throw new NotFoundException('User not found');

    const { profile, passwordHash: _password, googleId: _google, ...userPublic } = user;

    return {
      user: {
        ...userPublic,
        createdAt: userPublic.createdAt.toISOString(),
        updatedAt: userPublic.updatedAt.toISOString(),
      },
      profile: profile
        ? {
            ...profile,
            lastSeenAt: profile.lastSeenAt.toISOString(),
            createdAt: profile.createdAt.toISOString(),
            updatedAt: profile.updatedAt.toISOString(),
          }
        : null,
    };
  }
}
