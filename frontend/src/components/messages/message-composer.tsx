"use client";

import { useRef, useState } from "react";

import { PRIMARY_BUTTON_CLASS } from "@/components/ui/styles";
import {
  MAX_UPLOAD_MB,
  MESSAGE_MAX_LENGTH,
  UPLOAD_ACCEPT,
} from "@/lib/api-limits";
import { uploadFile } from "@/lib/api/messages";
import { getApiErrorMessage } from "@/lib/api/error";
import { useSocket } from "@/lib/socket/socket-provider";
import { CLIENT_EVENTS, type SendMessageAck } from "@/lib/socket/socket-events";

/**
 * Message input. Enter sends; Shift+Enter newlines. The length cap comes from api-limits, which
 * mirrors the backend rule enforced on both the HTTP and WebSocket paths.
 */
export function MessageComposer({
  groupId,
  onType,
  onStopTyping,
}: {
  groupId: string;
  onType?: () => void;
  onStopTyping?: () => void;
}) {
  const { socket, connected } = useSocket();
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file later
    if (!file || uploading) return;
    setUploading(true);
    setError(null);
    try {
      await uploadFile(groupId, file, content.trim());
      setContent("");
      onStopTyping?.();
      // The message (with its attachment) arrives via the new_message broadcast.
    } catch (err) {
      setError(getApiErrorMessage(err, "Couldn't upload file"));
    } finally {
      setUploading(false);
    }
  }

  function submit() {
    const trimmed = content.trim();
    if (!trimmed || !socket || !connected || sending) return;
    setSending(true);
    setError(null);
    socket
      .timeout(5000)
      .emit(
        CLIENT_EVENTS.SEND_MESSAGE,
        { groupId, content: trimmed },
        (err: unknown, ack: SendMessageAck | undefined) => {
          setSending(false);
          if (err) return setError("Couldn't reach the server");
          if (!ack || !ack.ok) {
            return setError(ack?.error ?? "Couldn't send message");
          }
          setContent("");
          onStopTyping?.();
          // The message arrives via the new_message broadcast (to the sender too), so the
          // `message` on the ack is intentionally unused here rather than inserted twice.
        },
      );
  }

  return (
    <div className="border-t border-line py-3">
      {error && (
        <p role="alert" className="mb-2 text-sm text-brand-strong">
          {error}
        </p>
      )}
      <form
        className="flex items-end gap-2 rounded-2xl border border-line bg-surface p-1.5 shadow-sm transition focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/25"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept={UPLOAD_ACCEPT}
          onChange={onPickFile}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          title={`Attach a file (image or PDF, up to ${MAX_UPLOAD_MB} MB)`}
          aria-label="Attach a file"
          className="shrink-0 rounded-xl px-2.5 py-2 text-lg text-muted transition hover:bg-surface-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
        >
          {uploading ? "…" : "📎"}
        </button>
        <textarea
          aria-label="Message"
          placeholder="Write a message…"
          rows={1}
          maxLength={MESSAGE_MAX_LENGTH}
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            onType?.();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          className="max-h-32 flex-1 resize-none bg-transparent px-2.5 py-1.5 text-sm text-ink outline-none placeholder:text-muted/70"
        />
        <button
          type="submit"
          disabled={sending || !connected || !content.trim()}
          // py-2, not py-2.5: matches the attach button beside it in this items-end row.
          className={`${PRIMARY_BUTTON_CLASS} shrink-0 px-4 py-2`}
        >
          Send
        </button>
      </form>
    </div>
  );
}
