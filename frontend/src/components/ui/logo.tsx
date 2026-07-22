/**
 * Wordmark: an aurora-gradient chip (indigo → cyan) holding two overlapping speech dots (a
 * conversation), beside the name set in the display face. The mark is the one small flourish;
 * everything else stays quiet.
 */
export function Logo({ size = "md" }: { size?: "md" | "lg" }) {
  const chip = size === "lg" ? "h-9 w-9" : "h-7 w-7";
  const text = size === "lg" ? "text-2xl" : "text-lg";
  return (
    <span className="flex items-center gap-2.5">
      <span
        className={`grid ${chip} place-items-center rounded-[10px] text-on-brand shadow-sm bg-[image:linear-gradient(135deg,var(--primary),var(--aurora-cyan))]`}
      >
        <svg viewBox="0 0 24 24" className="h-1/2 w-1/2" fill="currentColor" aria-hidden>
          <circle cx="9" cy="10" r="4.5" opacity="0.55" />
          <circle cx="15" cy="14" r="4.5" />
        </svg>
      </span>
      <span className={`font-display font-extrabold tracking-tight ${text}`}>
        Convo
      </span>
    </span>
  );
}
