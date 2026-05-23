import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class ReportsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(args: {
    reporterId: string;
    reportedId: string;
    conversationId?: string;
    reason: string;
    details?: string;
  }) {
    return this.prisma.report.create({ data: args });
  }
}
