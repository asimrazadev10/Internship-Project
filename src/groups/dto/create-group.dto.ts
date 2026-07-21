import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateGroupDto {
  @IsString()
  @MinLength(1, { message: 'Group name cannot be empty' })
  @MaxLength(80)
  name: string;
}
