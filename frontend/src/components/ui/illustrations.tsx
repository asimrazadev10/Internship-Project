import { AuroraRibbons } from "@/components/ui/aurora-ribbons";

/**
 * Empty-state artwork, all built on the AuroraRibbons primitive.
 *
 * Note the deliberate asymmetry: the group and message states get full 200x140 scenes, but the
 * search state gets a 40px mark. Its container is a row inside a max-h-72 dropdown constrained to
 * the input's width — a full scene there would push the results out of view. Scale is a design
 * constraint, not an afterthought.
 */

/** Bubble geometry shared by the two full scenes — a rounded rect with a tail. */
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
      />
      <path
        d={`M ${x + 12} ${y + h} l 0 7 l 9 -7 z`}
        fill="var(--card)"
        stroke="var(--border-strong)"
      />
    </g>
  );
}

/** No groups yet — a single bubble lifting out of the ribbon field. */
export function EmptyGroups() {
  return (
    <svg viewBox="0 0 200 140" className="h-32 w-auto" aria-hidden>
      <AuroraRibbons id="groups" bands={5} />
      <Bubble x={62} y={34} w={78} h={34} opacity={1} />
    </svg>
  );
}

/** No messages yet — two bubbles, the second faint: a conversation that hasn't started. */
export function EmptyMessages() {
  return (
    <svg viewBox="0 0 200 140" className="h-32 w-auto" aria-hidden>
      <AuroraRibbons id="messages" bands={4} />
      <Bubble x={40} y={26} w={70} h={30} opacity={1} />
      <Bubble x={96} y={68} w={62} h={28} opacity={0.45} />
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
