/**
 * HOW THIS FILE WORKS
 *   1. SINGLE_EMOJI — a Unicode-property regex matching exactly one emoji, sequences included.
 *   2. Bound the input length first, then match it against that pattern.
 */
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
// The `u` flag is required for \p{...} property escapes to be recognised at all.
const SINGLE_EMOJI =
  /^\p{Extended_Pictographic}(\p{Emoji_Modifier}|️|‍\p{Extended_Pictographic}(\p{Emoji_Modifier}|️)?)*$/u;

export class ToggleReactionDto {
  // Up to 16 chars to allow multi-codepoint sequences (e.g. 👍🏽, 👨‍👩‍👧); the pattern is what
  // actually decides validity, the length cap just bounds the input before matching.
  @IsString()
  @Length(1, 16)
  // Step 2. Runs after the length check, so the regex never sees an unbounded string.
  @Matches(SINGLE_EMOJI, { message: 'Reaction must be a single emoji' })
  emoji!: string;
}
