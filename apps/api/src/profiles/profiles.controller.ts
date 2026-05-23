import { Body, Controller, Patch, Put, UseGuards } from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ProfilesService } from './profiles.service.js';
import { UpsertProfileDto, UpdateProfileDto } from './dto/upsert-profile.dto.js';

@Controller('me/profile')
@UseGuards(JwtAuthGuard)
export class ProfilesController {
  constructor(private readonly profiles: ProfilesService) {}

  // Used for onboarding: create-or-replace the user's profile.
  @Put()
  async upsert(@CurrentUser() user: AuthUser, @Body() dto: UpsertProfileDto) {
    const profile = await this.profiles.upsert(user.userId, dto);
    return this.shape(profile);
  }

  // Partial update for nickname/bio/mood changes from the Profile screen.
  @Patch()
  async update(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    const profile = await this.profiles.update(user.userId, dto);
    return this.shape(profile);
  }

  private shape(p: Awaited<ReturnType<ProfilesService['upsert']>>) {
    return {
      ...p,
      lastSeenAt: p.lastSeenAt.toISOString(),
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    };
  }
}
