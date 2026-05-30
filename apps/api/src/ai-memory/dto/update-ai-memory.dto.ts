import { IsBoolean } from 'class-validator';

export class UpdateAiMemoryDto {
  @IsBoolean()
  enabled!: boolean;
}
