/**
 * HOW THIS FILE WORKS
 *   1. Run isValidDbId() on the incoming param.
 *   2. Throw 400 if it fails; return it unchanged if it passes.
 *
 * Stops a malformed id reaching a Mongo query, where it would surface as a low-level
 * CastError rather than a clean 400.
 */
import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

import { isValidDbId } from '../utils/uuid';

/**
 * Validates that a route/query param is a well-formed id (MongoDB ObjectId or a legacy UUID).
 *
 * Deliberately NOT Nest's ParseUUIDPipe: that one rejects UUIDv7 and, after the migration,
 * every id is a 24-hex ObjectId. See common/utils/uuid.ts.
 */
@Injectable()
export class ParseUuidPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!isValidDbId(value)) {
      // Note GroupsService.assertMember deliberately does NOT use this pipe — a bad group id
      // there must 403 like a non-membership, not 400, so it cannot be used to probe ids.
      throw new BadRequestException('Invalid id');
    }
    // Returned untouched — this pipe validates, it does not transform.
    return value;
  }
}
