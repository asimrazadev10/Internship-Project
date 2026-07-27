import type { Reaction } from "@/lib/api/types";

/**
 * Collapse the raw per-user reaction rows into one chip per emoji, marking which ones are mine.
 *
 * The server stores reactions individually (emoji + userId) because that is what makes a toggle
 * idempotent; the UI wants counts. This is that translation, kept as a pure function so it is
 * testable without rendering.
 */
function aggregate(reactions: Reaction[], userId?: string) {
  const map = new Map<string, { emoji: string; count: number; mine: boolean }>();
  for (const r of reactions) {
    const cur = map.get(r.emoji) ?? { emoji: r.emoji, count: 0, mine: false };
    cur.count += 1;
    if (r.userId === userId) cur.mine = true;
    map.set(r.emoji, cur);
  }
  return [...map.values()];
}

/** Aggregated reaction chips shown under a bubble. Clicking a chip toggles your own reaction. */
export function ReactionChips({
  reactions,
  currentUserId,
  isOwn,
  onReact,
}: {
  reactions: Reaction[];
  currentUserId?: string;
  isOwn: boolean;
  onReact: (emoji: string) => void;
}) {
  const agg = aggregate(reactions, currentUserId);
  if (agg.length === 0) return null;
  return (
    <div
      className={`mt-1 flex flex-wrap items-center gap-1 ${isOwn ? "justify-end" : ""}`}
    >
      {agg.map((r) => (
        <button
          key={r.emoji}
          onClick={() => onReact(r.emoji)}
          title="Toggle your reaction"
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition ${
            r.mine
              ? "border-brand bg-brand-soft text-brand-strong"
              : "border-line bg-surface text-muted hover:border-line-strong"
          }`}
        >
          <span>{r.emoji}</span>
          <span className="tabular-nums">{r.count}</span>
        </button>
      ))}
    </div>
  );
}
