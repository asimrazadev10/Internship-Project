import { AURORA_VIEWBOX, AuroraRibbons } from "@/components/ui/aurora-ribbons";

/**
 * Empty-state artwork, all built on the AuroraRibbons primitive.
 *
 * Note the deliberate asymmetry: the group and message states get full 200x140 scenes, but the
 * search state gets a 40px mark. Its container is a row inside a max-h-72 dropdown constrained to
 * the input's width — a full scene there would push the results out of view. Scale is a design
 * constraint, not an afterthought.
 */

/**
 * Bubble geometry shared by the two full scenes — a rounded rect with a tail.
 *
 * The tail is drawn as one path continuous with the body and the body is filled *and* stroked, so
 * the seam between them stays invisible. A card-coloured bubble on a card-coloured surface needs
 * the stroke to carry the whole shape — hence strokeWidth 1.6 rather than the default hairline.
 */
function Bubble({
  x,
  y,
  w,
  h,
  opacity,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  opacity: number;
}) {
  return (
    <g opacity={opacity}>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={h / 2.4}
        fill="var(--card)"
        stroke="var(--border-strong)"
        strokeWidth="1.6"
      />
      <path
        d={`M ${x + 14} ${y + h - 2} l 0 9 l 11 -8 z`}
        fill="var(--card)"
        stroke="var(--border-strong)"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <rect
        x={x + 1}
        y={y + h - 4}
        width={w - 2}
        height={3}
        fill="var(--card)"
        stroke="none"
      />
    </g>
  );
}

/** No groups yet — a single bubble lifting clear of the ribbon field. */
export function EmptyGroups() {
  return (
    <svg viewBox={AURORA_VIEWBOX} className="h-32 w-auto" aria-hidden>
      <AuroraRibbons id="groups" bands={5} />
      <Bubble x={58} y={26} w={84} h={36} opacity={1} />
    </svg>
  );
}

/** No messages yet — two bubbles, the second faint: a conversation that hasn't started. */
export function EmptyMessages() {
  return (
    <svg viewBox={AURORA_VIEWBOX} className="h-32 w-auto" aria-hidden>
      <AuroraRibbons id="messages" bands={4} />
      <Bubble x={26} y={18} w={78} h={32} opacity={1} />
      <Bubble x={104} y={56} w={68} h={28} opacity={0.5} />
    </svg>
  );
}

/** No search matches — the ribbon passing through an aperture, nothing caught. Compact by design. */
export function NoMatchesMark() {
  return (
    <svg viewBox="0 0 40 40" className="h-9 w-9 shrink-0" aria-hidden>
      <defs>
        <linearGradient id="nomatch-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--aurora-violet)" />
          <stop offset="100%" stopColor="var(--aurora-cyan)" />
        </linearGradient>
      </defs>
      <path
        d="M 2 30 C 10 18, 22 30, 38 12"
        stroke="url(#nomatch-grad)"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
        opacity="0.55"
      />
      <circle cx="20" cy="20" r="9" stroke="var(--border-strong)" strokeWidth="2" fill="none" />
    </svg>
  );
}
