/**
 * HOW THIS FILE WORKS
 *   1. Validate the `q` query parameter against the shared min/max bounds.
 */
import { IsString, Length } from 'class-validator';

import {
  SEARCH_QUERY_MAX_LENGTH,
  SEARCH_QUERY_MIN_LENGTH,
} from '../message.constants';

export class SearchMessagesDto {
  // The query string — a substring match, case-insensitive. Bounds are shared with the UI, which
  // mirrors them so an over-long query is prevented rather than 400'd after the round trip.
  @IsString()
  // @Length covers both ends in one decorator, so the two bounds cannot be applied unevenly.
  @Length(SEARCH_QUERY_MIN_LENGTH, SEARCH_QUERY_MAX_LENGTH)
  q: string;
}
