/**
 * The Aurora ribbon field — the one primitive every illustration in the app is built from.
 *
 * A band is a cubic bezier S-curve. Several copies are stacked at a fixed vertical offset with
 * decaying stroke width and opacity, over a blurred radial glow. Re-parameterising `bands` turns
 * the same geometry into a tight arc, a wide field (empty states) or a slow sweep (auth hero) —
 * so the artwork across the app is one idea stated several times, not several drawings.
 *
 * Colours come from CSS custom properties, so this re-themes itself when the OS flips to dark.
 * That only works for SVG inline in the document; assets fetched as external resources
 * (app/icon.svg, the OG card, the README banner) hard-code their hex for that reason.
 *
 * `id` is required: gradient and filter ids are document-global, so two instances sharing an id
 * would silently cross-wire each other's fills.
 *
 * Drawn against a `0 0 200 140` viewBox, supplied by the parent <svg>.
 */
export function AuroraRibbons({
  id,
  bands = 5,
  className,
}: {
  id: string;
  bands?: number;
  className?: string;
}) {
  const gradientId = `aurora-grad-${id}`;
  const glowId = `aurora-glow-${id}`;

  return (
    <g className={className} aria-hidden>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--aurora-violet)" />
          <stop offset="50%" stopColor="var(--primary)" />
          <stop offset="100%" stopColor="var(--aurora-cyan)" />
        </linearGradient>
        <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="16" />
        </filter>
      </defs>

      <ellipse
        cx="100"
        cy="104"
        rx="72"
        ry="22"
        fill={`url(#${gradientId})`}
        opacity="0.26"
        filter={`url(#${glowId})`}
      />

      {/*
        A flat wave held to the lower band (y ~72-140). Deliberately not a dramatic diagonal: the
        upper half has to stay clear so the bubbles the scenes place there read against the surface
        instead of competing with strokes.
      */}
      {Array.from({ length: bands }, (_, i) => {
        const dy = i * 8;
        return (
          <path
            key={i}
            d={`M -10 ${100 + dy} C 45 ${80 + dy}, 75 ${120 + dy}, 115 ${98 + dy} S 175 ${72 + dy}, 210 ${86 + dy}`}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth={2.8 - i * 0.4}
            strokeLinecap="round"
            opacity={0.9 - i * 0.15}
          />
        );
      })}
    </g>
  );
}
