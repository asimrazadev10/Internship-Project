import type { ReactNode } from "react";

/**
 * The shell for a full-size empty state: illustration, title, optional hint. Keeps the dashed-card
 * treatment the group list already used, so this promotes an existing pattern rather than adding a
 * new one.
 *
 * The search dropdown deliberately does NOT use this — its popover is too small for a scene, so it
 * composes NoMatchesMark inline instead.
 */
export function EmptyState({
  illustration,
  title,
  hint,
}: {
  illustration: ReactNode;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line-strong bg-surface/50 px-6 py-10 text-center">
      {illustration}
      <p className="text-sm font-medium text-ink">{title}</p>
      {hint && <p className="max-w-xs text-sm text-muted">{hint}</p>}
    </div>
  );
}
