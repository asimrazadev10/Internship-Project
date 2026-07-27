/**
 * A message's uploaded file. Images render inline; anything else becomes a download chip.
 *
 * Pure and stateless — it takes the three attachment fields off a message and nothing else, which
 * is why it separates cleanly from the row.
 */
export function Attachment({
  url,
  name,
  mime,
}: {
  url: string;
  name: string | null;
  mime: string | null;
}) {
  if (mime?.startsWith("image/")) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="block">
        {/* eslint-disable-next-line @next/next/no-img-element -- external Supabase URL; next/image would need per-host config */}
        <img
          src={url}
          alt={name ?? "attachment"}
          className="max-h-64 max-w-full rounded-xl object-cover"
        />
      </a>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink transition hover:border-line-strong"
    >
      <span aria-hidden>📄</span>
      <span className="max-w-[16rem] truncate">{name ?? "Download file"}</span>
    </a>
  );
}
