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
    return this.repo.create({
      reporterId,
      reportedId: dto.reportedId,
      conversationId: dto.conversationId,
      reason: dto.reason,
      details: dto.details,
    });
  }
}
