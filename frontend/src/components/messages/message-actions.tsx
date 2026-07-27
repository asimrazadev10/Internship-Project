const QUICK_EMOJIS = ["👍", "❤️", "😂", "🎉", "😮", "😢"];

/**
 * Which transient overlay a row is showing, if any.
 *
 * ONE value rather than two booleans, and that is the point of this file. Previously `showPalette`
 * and `confirming` were separate flags whose three-way coupling had to be maintained by hand:
 * opening the palette closed the confirm, opening the confirm closed the palette, and mouse-leave
 * reset both. Every one of those was a line that could be forgotten, and the interaction was only
 * discoverable by reading the whole 240-line row.
 *
 * Modelled as a single nullable union, mutual exclusion is structural — there is no state in which
 * both are open, so there is nothing to keep in step.
 */
export type MessageOverlay = null | "palette" | "confirm";

/**
 * The hover toolbar and the two overlays it opens: the emoji palette and the inline delete
 * confirm.
 *
 * All three are positioned off the same `relative` bubble wrapper and share the
 * `isOwn ? right : left` mirroring, so they belong in one file rather than three.
 *
 * `overlay` is owned by the row rather than here, because the row owns the `onMouseLeave` that
 * dismisses it — the handler sits on the whole <li>, outside this component's markup.
 */
export function MessageActions({
  messageId,
  isOwn,
  overlay,
  setOverlay,
  onStartEdit,
  onReact,
  onDelete,
}: {
  messageId: string;
  isOwn: boolean;
  overlay: MessageOverlay;
  setOverlay: (next: MessageOverlay) => void;
  onStartEdit: () => void;
  onReact: (messageId: string, emoji: string) => void;
  onDelete: (messageId: string) => void;
}) {
  const side = isOwn ? "right-0" : "left-0";

  return (
    <>
      {/* Hover action bar — floats on the OUTER side of the bubble, clear of text and meta. */}
      <div
        className={`absolute top-1/2 flex -translate-y-1/2 items-center gap-0.5 rounded-full border border-line bg-surface p-1 opacity-0 shadow-md transition group-hover:opacity-100 focus-within:opacity-100 ${
          isOwn ? "right-full mr-2" : "left-full ml-2"
        }`}
      >
        <button
          onClick={() => setOverlay(overlay === "palette" ? null : "palette")}
          title="Add reaction"
          aria-label="Add reaction"
          className="rounded-full px-1.5 py-1 text-sm leading-none transition hover:bg-surface-2"
        >
          😊
        </button>
        {isOwn && (
          <>
            <button
              onClick={() => {
                setOverlay(null);
                onStartEdit();
              }}
              title="Edit"
              aria-label="Edit message"
              className="rounded-full px-1.5 py-1 text-sm leading-none transition hover:bg-surface-2"
            >
              ✏️
            </button>
            <button
              onClick={() => setOverlay("confirm")}
              title="Delete"
              aria-label="Delete message"
              className="rounded-full px-1.5 py-1 text-sm leading-none transition hover:bg-surface-2"
            >
              🗑️
            </button>
          </>
        )}
      </div>

      {/* Emoji palette — opened by the react button, closes on pick or mouse-leave. */}
      {overlay === "palette" && (
        <div
          className={`absolute bottom-full z-20 mb-1 flex items-center gap-0.5 rounded-full border border-line bg-surface px-1.5 py-1 shadow-lg ${side}`}
        >
          {QUICK_EMOJIS.map((e) => (
            <button
              key={e}
              onClick={() => {
                onReact(messageId, e);
                setOverlay(null);
              }}
              title={`React ${e}`}
              className="rounded-full px-1.5 py-0.5 text-base leading-none transition hover:bg-surface-2"
            >
              {e}
            </button>
          ))}
        </div>
      )}

      {/* Inline delete confirm — no blocking native dialog. */}
      {overlay === "confirm" && (
        <div
          className={`absolute bottom-full z-20 mb-1 flex items-center gap-3 whitespace-nowrap rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-lg ${side}`}
        >
          <span className="text-muted">Delete this message?</span>
          <button
            onClick={() => {
              onDelete(messageId);
              setOverlay(null);
            }}
            className="font-semibold text-brand-strong"
          >
            Delete
          </button>
          <button onClick={() => setOverlay(null)} className="text-muted">
            Cancel
          </button>
        </div>
      )}
    </>
  );
}
