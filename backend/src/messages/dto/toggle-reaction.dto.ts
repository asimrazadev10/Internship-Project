import { IsString, Length } from 'class-validator';

export class ToggleReactionDto {
  // A single emoji; up to 16 chars to allow multi-codepoint sequences (e.g. 👍🏽, 👨‍👩‍👧).
  @IsString()
  @Length(1, 16)
  emoji!: string;
}
