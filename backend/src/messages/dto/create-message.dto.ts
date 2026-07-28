/**
 * HOW THIS FILE WORKS
 *   1. Trim the content, then reject it if empty.
 *   2. Cap its length using the constant the socket path also enforces.
 */
import { IsString, MaxLength, MinLength } from 'class-validator';

import { Trim } from '../../common/decorators/trim.decorator';
import { MESSAGE_CONTENT_MAX_LENGTH } from '../message.constants';

export class CreateMessageDto {
  // Step 1. Trim first, so "   " fails the MinLength below rather than becoming a blank message.
  @Trim()
  @IsString()
  @MinLength(1, { message: 'Message content cannot be empty' })
  // Cap the payload. The DB column is unbounded text; this DTO limit is the primary control on
  // message size (a DB-level cap is deferred until AI summary sizes are known — see the schema
  // design doc). ChatGateway.sendMessage enforces the same cap by hand for the socket path,
  // which does not run through the ValidationPipe — hence the shared constant.
  @MaxLength(MESSAGE_CONTENT_MAX_LENGTH)
  content: string;
}
