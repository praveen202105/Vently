import { BadRequestException, Injectable } from '@nestjs/common';
import { ReportsRepository } from './reports.repository.js';
import type { CreateReportDto } from './dto/create-report.dto.js';

@Injectable()
export class ReportsService {
  constructor(private readonly repo: ReportsRepository) {}

  async create(reporterId: string, dto: CreateReportDto) {
    if (dto.reportedId === reporterId) {
      throw new BadRequestException("You can't report yourself");
    }
    const conversationId = dto.conversationId?.startsWith('ai_conv_')
      ? undefined
      : dto.conversationId;

    return this.repo.create({
      reporterId,
      reportedId: dto.reportedId,
      conversationId,
      reason: dto.reason,
      details: dto.details,
    });
  }
}
