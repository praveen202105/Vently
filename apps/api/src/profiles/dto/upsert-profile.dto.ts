import {
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
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
}
