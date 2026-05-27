import {
  Equals,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Gender, MoodIntent } from '@prisma/client';

export class UpsertProfileDto {
  @IsString()
  @MinLength(3)
  @MaxLength(20)
  @Matches(/^[a-zA-Z0-9_]+$/, { message: 'Letters, numbers and underscores only' })
  nickname!: string;

  @IsEnum(Gender)
  gender!: Gender;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  bio?: string;

  @IsOptional()
  @IsEnum(MoodIntent)
  mood?: MoodIntent;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  activeStartHour?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24)
  activeEndHour?: number;

  // Required 18+ disclaimer. Sent from the OnboardingForm. The form already
  // gates this client-side; we re-validate so old clients (or direct API
  // callers) can't bypass the acknowledgement.
  @IsBoolean()
  @Equals(true, { message: 'You must confirm you are 18+' })
  ageConfirmed!: boolean;
}

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(20)
  @Matches(/^[a-zA-Z0-9_]+$/, { message: 'Letters, numbers and underscores only' })
  nickname?: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  bio?: string | null;

  @IsOptional()
  @IsEnum(MoodIntent)
  mood?: MoodIntent | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  activeStartHour?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24)
  activeEndHour?: number;
}
