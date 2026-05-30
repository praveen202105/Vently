import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { AiMemoryService } from './ai-memory.service.js';
import { UpdateAiMemoryDto } from './dto/update-ai-memory.dto.js';

@Controller('me/ai-memory')
@UseGuards(JwtAuthGuard)
export class AiMemoryController {
  constructor(private readonly aiMemory: AiMemoryService) {}

  @Get()
  status(@CurrentUser() user: AuthUser) {
    return this.aiMemory.getStatus(user.userId);
  }

  @Patch()
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateAiMemoryDto) {
    return this.aiMemory.setEnabled(user.userId, dto.enabled);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async clear(@CurrentUser() user: AuthUser) {
    await this.aiMemory.clear(user.userId);
  }
}
