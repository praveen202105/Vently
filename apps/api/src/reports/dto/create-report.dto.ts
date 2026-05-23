import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export enum ReportReason {
  HARASSMENT = 'HARASSMENT',
  INAPPROPRIATE_CONTENT = 'INAPPROPRIATE_CONTENT',
  SPAM = 'SPAM',
  IMPERSONATION = 'IMPERSONATION',
  UNDERAGE = 'UNDERAGE',
  OTHER = 'OTHER',
}

export class CreateReportDto {
  @IsString()
  reportedId!: string;

  @IsOptional()
  @IsString()
  conversationId?: string;

  @IsEnum(ReportReason)
  reason!: ReportReason;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  details?: string;
}
