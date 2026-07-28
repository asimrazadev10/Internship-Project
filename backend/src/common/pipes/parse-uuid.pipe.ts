/**
 * HOW THIS FILE WORKS
 *   1. Run isUuid() on the incoming param.
 *   2. Throw 400 if it fails; return it unchanged if it passes.
 *
 * Stops a malformed id reaching a Postgres `uuid` column, where it would surface as a low-level
 * driver error rather than a clean 400.
 */
import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

import { isUuid } from '../utils/uuid';

/**
 * Validates that a route/query param is a UUID (any version).
 *
 * Deliberately NOT Nest's ParseUUIDPipe: that one rejects UUIDv7 because its default version set
 * is 3/4/5, and every id in this app is v7. See common/utils/uuid.ts.
 */
@Injectable()
export class ParseUuidPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!isUuid(value)) {
      // Note GroupsService.assertMember deliberately does NOT use this pipe — a bad group id
      // there must 403 like a non-membership, not 400, so it cannot be used to probe ids.
      throw new BadRequestException('Invalid id: expected a UUID');
    }
    // Returned untouched — this pipe validates, it does not transform.
    return value;
  }
}
