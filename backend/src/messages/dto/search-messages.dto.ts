import { IsString, Length } from 'class-validator';

export class SearchMessagesDto {
  // The query string. 1–100 chars — a substring match, case-insensitive.
  @IsString()
  @Length(1, 100)
  q: string;
}
