"use client";

import { useState } from "react";

import { getApiErrorMessage } from "@/lib/api/error";
import { useSendMessage } from "@/lib/queries/messages";

/**
 * Message input. Enter sends; Shift+Enter inserts a newline. The textarea is capped at the same
 * 4000 chars as the backend CreateMessageDto so the client can't compose something the API will
 * reject.
 */
export function MessageComposer({ groupId }: { groupId: string }) {
  const [content, setContent] = useState("");
  const sendMessage = useSendMessage(groupId);

  function submit() {
    const trimmed = content.trim();
    if (!trimmed || sendMessage.isPending) return;
    sendMessage.mutate(trimmed, { onSuccess: () => setContent("") });
  }

  return (
    <div className="border-t border-zinc-200 py-3 dark:border-zinc-800">
      {sendMessage.isError && (
        <p role="alert" className="mb-2 text-sm text-red-600 dark:text-red-400">
          {getApiErrorMessage(sendMessage.error, "Couldn't send message")}
        </p>
      )}
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <textarea
          aria-label="Message"
          placeholder="Type a message…"
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
          className="max-h-32 flex-1 resize-none rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:ring-zinc-800"
        />
        <button
          type="submit"
          disabled={sendMessage.isPending || !content.trim()}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Send
        </button>
      </form>
    </div>
  );
}
