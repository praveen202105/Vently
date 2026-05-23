import { IsBoolean, IsString } from 'class-validator';

export class CreateFriendRequestDto {
  @IsString()
  toUserId!: string;
}

export class RespondFriendRequestDto {
  @IsBoolean()
  accept!: boolean;
}
