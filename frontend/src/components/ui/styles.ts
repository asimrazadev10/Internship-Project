/**
 * Named Tailwind recipes for the roles that repeat across the UI.
 *
 * The bar for landing here is that a role is styled the same way in several places and would look
 * broken if one copy drifted — not merely that two elements share some utilities. Layout utilities
 * (`flex-1`, `shrink-0`, `mx-auto`, widths, margins) stay at the call site: they are per-context
 * decisions, and hoisting them would force every consumer into one layout.
 *
 * Deliberately NOT components. A shared <Bubble> or making the group forms adopt <Field> would drag
 * in props that exist only to be false (the hero vignette needs no hover toolbar, no editing, no
 * reactions; the single-line group forms have no label column). A class constant is the smaller,
 * more honest move for these.
 */

/**
 * Text input. Padding is included because all three inputs genuinely agree on it.
 *
 * Callers append their own layout and any variant: `text-ink` (auth fields), `flex-1` (group
 * forms), `font-mono placeholder:font-sans` (the invite-id field).
 */
export const INPUT_CLASS =
  "rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm outline-none transition placeholder:text-muted/70 focus:border-brand focus:ring-2 focus:ring-brand/25 disabled:opacity-60";

/**
 * Primary (brand-filled) button — colour, shape, weight, and the disabled/hover treatment.
 *
 * Padding is deliberately EXCLUDED. The three call sites do not agree on it and should not: the
 * form's submit button is a standalone action (`px-4 py-2.5`), while the composer's send button is
 * `py-2` to match the attach button beside it in an `items-end` row — making them equal would push
 * send proud of attach. Leaving padding out turns that difference into something each site states
 * explicitly, instead of a silent divergence between three near-identical strings.
 */
export const PRIMARY_BUTTON_CLASS =
  "rounded-xl bg-brand text-sm font-semibold text-on-brand transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60";

/**
 * Eyebrow: the small mono uppercase label used for section headings and field labels. A named
 * typographic role in the design, not incidental styling — seven sites.
 */
export const EYEBROW_CLASS =
  "font-mono text-xs uppercase tracking-wide text-muted";

/**
 * Metadata line: sender name, timestamp, "edited". One step smaller than the eyebrow.
 *
 * Kept separate rather than unified with EYEBROW_CLASS — the two sizes are a deliberate hierarchy
 * (11px sits under a message, 12px labels a section), not an inconsistency to be flattened.
 */
export const META_CLASS = "font-mono text-[11px] text-muted";

/**
 * Chat bubble. Shared by the real message list AND the sign-in hero vignette.
 *
 * That sharing is the point: auth-hero.tsx describes itself as "a still vignette (not the live
 * app)", so it must look like the real thing or the sign-in page misrepresents the product. That
 * was previously maintained by hand across two files — restyle a bubble and the hero silently kept
 * the old look.
 */
export const BUBBLE_CLASS = "rounded-2xl px-3.5 py-2 text-sm shadow-sm";
export const BUBBLE_OWN = "rounded-br-md bg-brand text-on-brand";
export const BUBBLE_OTHER = "rounded-bl-md bg-surface text-ink";

/** The row wrapping an avatar and a bubble; reversed for your own messages. */
export const BUBBLE_ROW_CLASS = "flex items-end gap-2.5";
