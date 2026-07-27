import { IsString, Length, Matches } from 'class-validator';

/**
 * Exactly one emoji: a pictographic base, optionally followed by a skin-tone modifier, a
 * variation selector (U+FE0F), or ZWJ-joined further pictographs for sequences like 👨‍👩‍👧.
 *
 * Without this the field accepted any 1–16 character string, so "reactions" could be arbitrary
 * text — the chip UI renders whatever it is given, and the aggregate key is the raw value. Not an
 * injection risk (React escapes), but it is not what the feature means, and nothing else in the
 * system would ever reject it.
 */
const SINGLE_EMOJI =
  /^\p{Extended_Pictographic}(\p{Emoji_Modifier}|️|‍\p{Extended_Pictographic}(\p{Emoji_Modifier}|️)?)*$/u;

export class ToggleReactionDto {
  // Up to 16 chars to allow multi-codepoint sequences (e.g. 👍🏽, 👨‍👩‍👧); the pattern is what
  // actually decides validity, the length cap just bounds the input before matching.
  @IsString()
  @Length(1, 16)
  @Matches(SINGLE_EMOJI, { message: 'Reaction must be a single emoji' })
  emoji!: string;
}
