import { IsString, Length } from 'class-validator';

import {
  SEARCH_QUERY_MAX_LENGTH,
  SEARCH_QUERY_MIN_LENGTH,
} from '../message.constants';

export class SearchMessagesDto {
  // The query string — a substring match, case-insensitive. Bounds are shared with the UI, which
  // mirrors them so an over-long query is prevented rather than 400'd after the round trip.
  @IsString()
  @Length(SEARCH_QUERY_MIN_LENGTH, SEARCH_QUERY_MAX_LENGTH)
  q: string;
}
