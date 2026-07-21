import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateMessageDto {
  @IsString()
  @MinLength(1, { message: 'Message content cannot be empty' })
  // Cap the payload. The DB column is unbounded text; this DTO limit is the primary control on
  // message size (a DB-level cap is deferred until AI summary sizes are known — see the schema
  // design doc).
  @MaxLength(4000)
  content: string;
}
