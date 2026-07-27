/**
 * Brand values shared by the generated image routes — and a sync checklist for the ones that
 * cannot import.
 *
 * Be honest about the ceiling here, because it is the interesting part: only `opengraph-image.tsx`
 * and `apple-icon.tsx` can import this file. Three other places encode the same brand and are
 * structurally unable to:
 *
 *   globals.css        — the Tailwind v4 @theme entry sheet, and the source of truth for in-app
 *                        colour. CSS cannot import TypeScript, and generating it from TS would be
 *                        exactly the kind of exotic build step CLAUDE.md rules out.
 *   app/icon.svg       — fetched by the browser as an external resource; the app's custom
 *                        properties never reach it.
 *   assets/banner.svg  — rendered by GitHub's markdown pipeline, same story.
 *
 * So for those three, this file's job is not code reuse — it is to be the one named checklist a
 * reviewer syncs against, instead of "whichever file you happened to open".
 */

// ---- Palette ----

/** `--primary`. Identical in light and dark. */
export const BRAND_INDIGO = "#6366F1";

/**
 * `--aurora-cyan` in DARK mode. Light mode uses #06B6D4 (globals.css).
 *
 * Every static asset hard-codes this dark-mode value, so the favicon genuinely does not match the
 * light-theme chip rendered by logo.tsx. That is a known, accepted mismatch — a favicon has no way
 * to know the page's colour scheme — not a bug to be "fixed" by changing one of them.
 */
export const BRAND_CYAN = "#22D3EE";

/** `--aurora-violet`. Identical in light and dark, so no mode caveat. */
export const BRAND_VIOLET = "#7C3AED";

/** The off-app canvas and its text colours: what the OG card and README banner paint themselves. */
export const AURORA_CANVAS_DARK = "#0F1226";
export const AURORA_TEXT_ON_DARK = "#E7E9F5";
export const AURORA_MUTED_ON_DARK = "#98A0C8";

/**
 * The chip gradient, in CSS form.
 *
 * The single entry that de-duplicates with no caveat — byte-identical in the two importable files.
 * Three further encodings of the same gradient exist and must be changed with it:
 *   logo.tsx      — the same stops via CSS custom properties
 *   icon.svg      — an SVG <linearGradient> with x1=0 y1=0 x2=1 y2=1 (the SVG spelling of 135deg)
 *   banner.svg    — likewise
 */
export const BRAND_CHIP_GRADIENT = `linear-gradient(135deg, ${BRAND_INDIGO}, ${BRAND_CYAN})`;

// ---- Mark geometry, 32-unit grid ----

/**
 * The Convo mark drawn on a 0 0 32 32 viewBox.
 *
 * brand-mark.tsx holds the canonical 24-grid version (MARK_ARC / MARK_DOTS) for in-app rendering.
 * These are that geometry scaled by 32/24 — every coordinate is exactly ×4/3 (2.5→3.3, 16.5→22,
 * 9→12, 15→20, 4.5→6). The relationship is arithmetic but nothing in the code enforces it, so if
 * you change one grid, recompute the other rather than eyeballing it.
 */
export const MARK_ARC_32 = "M 3.3 22 C 9.3 14, 18 24, 28.7 12.7";
export const MARK_STROKE_WIDTH_32 = 2.2;
export const MARK_DOTS_32 = [
  { cx: 12, cy: 13.3, r: 6, opacity: 0.55 },
  { cx: 20, cy: 18.7, r: 6, opacity: 1 },
];

// ---- Copy ----

/**
 * The product's one-line promise.
 *
 * Two sites, both importable, and semantically coupled: it is the headline of a shared link's
 * preview card, and the first thing the same person reads on the sign-in page one click later.
 * If those diverge, the link promises something the landing page does not say.
 */
export const SITE_TAGLINE = "Where your group actually talks.";
