/**
 * The Convo mark: two overlapping speech dots — a conversation — now riding a ribbon arc so the
 * mark belongs to the same family as the illustrations.
 *
 * The geometry lives here as the single reviewed definition. `app/icon.svg`, the OG card and the
 * README banner cannot import a React component into their output formats, so they redraw these
 * exact coordinates instead. Change them here and update those three deliberately.
 *
 * Drawn on a `0 0 24 24` viewBox. Colour is inherited (`currentColor`) so the caller decides.
 */
export const MARK_ARC = "M 2.5 16.5 C 7 10.5, 13.5 18, 21.5 9.5";

export const MARK_DOTS = [
  { cx: 9, cy: 10, r: 4.5, opacity: 0.55 },
  { cx: 15, cy: 14, r: 4.5, opacity: 1 },
];

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden>
      <path
        d={MARK_ARC}
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        opacity="0.4"
      />
      {MARK_DOTS.map((d, i) => (
        <circle
          key={i}
          cx={d.cx}
          cy={d.cy}
          r={d.r}
          fill="currentColor"
          opacity={d.opacity}
        />
      ))}
    </svg>
  );
}
