"use client";

import { useEffect, useRef } from "react";

import { getApiErrorMessage } from "@/lib/api/error";
import type { Message } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/auth-context";
import { useMessages } from "@/lib/queries/messages";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function MessageBubble({ message, isOwn }: { message: Message; isOwn: boolean }) {
  // System / AI messages have no human sender — render them centred and muted.
  if (message.senderId === null) {
    return (
      <li className="mx-auto max-w-[80%] rounded-md bg-zinc-100 px-3 py-2 text-center text-xs text-zinc-500 dark:bg-zinc-800/60">
        {message.content}
      </li>
    );
  }

  return (
    <li className={`flex flex-col gap-0.5 ${isOwn ? "items-end" : "items-start"}`}>
      <div className="flex items-baseline gap-2 text-xs text-zinc-500">
        {!isOwn && <span className="font-medium">{message.sender?.name}</span>}
        <span>{formatTime(message.createdAt)}</span>
      </div>
      <div
        className={`max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${
          isOwn
            ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
            : "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
        }`}
      >
        {message.content}
      </div>
    </li>
  );
}

export function MessageList({ groupId }: { groupId: string }) {
  const { user } = useAuth();
  const {
    data,
    isLoading,
    isError,
    error,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useMessages(groupId);

  const bottomRef = useRef<HTMLDivElement>(null);

  // API pages are newest-first; flatten and reverse for chronological (oldest at top) display.
  const messages: Message[] = data
    ? data.pages.flatMap((page) => page.data).reverse()
    : [];

  // Scroll to the bottom when the NEWEST message changes — i.e. on first load and when a message
  // is sent. Keyed on the last message's id (not the count) so loading OLDER history, which
  // prepends at the top, does NOT yank the view back down.
  const newestId = messages[messages.length - 1]?.id;
  useEffect(() => {
    bottomRef.current?.scrollIntoView();
  }, [newestId]);

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-zinc-500">Loading messages…</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {getApiErrorMessage(error, "Couldn't load messages")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="flex flex-col gap-3 px-1 py-4">
        {hasNextPage && (
          <button
            onClick={() => void fetchNextPage()}
            disabled={isFetchingNextPage}
            className="mx-auto rounded-full border border-zinc-300 px-3 py-1 text-xs text-zinc-500 transition hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            {isFetchingNextPage ? "Loading…" : "Load older messages"}
          </button>
        )}

        {messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500">
            No messages yet. Say hello.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                isOwn={message.senderId === user?.id}
              />
            ))}
          </ul>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
