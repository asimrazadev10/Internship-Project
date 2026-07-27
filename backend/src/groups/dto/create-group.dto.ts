import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

import { GROUP_NAME_MAX_LENGTH } from '../group.constants';

export class CreateGroupDto {
  // Trim BEFORE validating, so "   " is rejected as empty rather than passing @MinLength(1) as
  // three spaces — and so " Team" cannot be stored as a value distinct from "Team", which would
  // slip straight past the @@unique([createdBy, name]) constraint.
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1, { message: 'Group name cannot be empty' })
  @MaxLength(GROUP_NAME_MAX_LENGTH)
  name: string;
}
