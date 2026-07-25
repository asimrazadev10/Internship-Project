import { BrandMark } from "@/components/ui/brand-mark";

/**
 * Wordmark: an aurora-gradient chip (indigo → cyan) holding the Convo mark — two overlapping
 * speech dots riding a ribbon arc — beside the name set in the display face. The mark is the one
 * small flourish; everything else stays quiet.
 *
 * The mark's geometry lives in brand-mark.tsx so the favicon, OG card and README banner all draw
 * the same shape.
 */
export function Logo({ size = "md" }: { size?: "md" | "lg" }) {
  const chip = size === "lg" ? "h-9 w-9" : "h-7 w-7";
  const text = size === "lg" ? "text-2xl" : "text-lg";
  return (
    <span className="flex items-center gap-2.5">
      <span
        className={`grid ${chip} place-items-center rounded-[10px] text-on-brand shadow-sm bg-[image:linear-gradient(135deg,var(--primary),var(--aurora-cyan))]`}
      >
        <BrandMark className="h-3/5 w-3/5" />
      </span>
      <span className={`font-display font-extrabold tracking-tight ${text}`}>
        Convo
      </span>
    </span>
  );
}
