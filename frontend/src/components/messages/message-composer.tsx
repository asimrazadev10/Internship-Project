"use client";

import { useState } from "react";

import { getApiErrorMessage } from "@/lib/api/error";
import { useSendMessage } from "@/lib/queries/messages";

/** Message input. Enter sends; Shift+Enter newlines. Capped at 4000 like the backend DTO. */
export function MessageComposer({ groupId }: { groupId: string }) {
  const [content, setContent] = useState("");
  const sendMessage = useSendMessage(groupId);

  function submit() {
    const trimmed = content.trim();
    if (!trimmed || sendMessage.isPending) return;
    sendMessage.mutate(trimmed, { onSuccess: () => setContent("") });
  }

  return (
    <div className="border-t border-line py-3">
      {sendMessage.isError && (
        <p role="alert" className="mb-2 text-sm text-brand-strong">
          {getApiErrorMessage(sendMessage.error, "Couldn't send message")}
        </p>
      )}
      <form
        className="flex items-end gap-2 rounded-2xl border border-line bg-surface p-1.5 shadow-sm transition focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/25"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <textarea
          aria-label="Message"
          placeholder="Write a message…"
          rows={1}
          maxLength={4000}
          value={content}
          onChange={(e) => setContent(e.target.value)}
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
          disabled={sendMessage.isPending || !content.trim()}
          className="shrink-0 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-on-brand transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60"
        >
          Send
        </button>
      </form>
    </div>
  );
}
