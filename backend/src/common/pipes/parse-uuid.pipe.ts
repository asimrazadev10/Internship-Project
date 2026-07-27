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
      throw new BadRequestException('Invalid id: expected a UUID');
    }
    return value;
  }
}
