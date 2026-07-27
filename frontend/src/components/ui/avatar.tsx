/**
 * A person, as a small warm token. Colour is derived deterministically from a stable key (the
 * user's id, falling back to name), so the same person is always the same hue — the "people" of
 * the chat are what carry colour through the interface.
 */

const PALETTE = [
  { bg: "#F4C7B8", fg: "#8A3B29" }, // coral
  { bg: "#F5D9A8", fg: "#87560F" }, // amber
  { bg: "#CBE3C4", fg: "#356B3E" }, // sage
  { bg: "#BFDCE8", fg: "#2F5E70" }, // sky
  { bg: "#DACBEC", fg: "#5B4088" }, // lilac
  { bg: "#F3C6D2", fg: "#8A3350" }, // rose
  { bg: "#CFDCC0", fg: "#4F6134" }, // olive
];

function pick(key: string) {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

export function Avatar({
  name,
  id,
  size = 36,
}: {
  name: string;
  id?: string;
  size?: number;
}) {
  const { bg, fg } = pick(id ?? name);
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        background: bg,
        color: fg,
        fontSize: Math.round(size * 0.4),
      }}
      className="inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold leading-none"
    >
      {initials(name)}
    </span>
  );
}
