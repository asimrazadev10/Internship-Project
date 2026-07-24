"use client";

import { useEffect, useRef } from "react";

import { Avatar } from "@/components/ui/avatar";
import { toggleReaction } from "@/lib/api/messages";
import { getApiErrorMessage } from "@/lib/api/error";
import type { Message, Reaction } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/auth-context";
import { useGroupMessages } from "@/lib/queries/messages";

const QUICK_EMOJIS = ["👍", "❤️", "😂", "🎉", "😮", "😢"];

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function aggregate(reactions: Reaction[], userId?: string) {
  const map = new Map<string, { emoji: string; count: number; mine: boolean }>();
  for (const r of reactions) {
    const cur = map.get(r.emoji) ?? { emoji: r.emoji, count: 0, mine: false };
    cur.count += 1;
    if (r.userId === userId) cur.mine = true;
    map.set(r.emoji, cur);
  }
  return [...map.values()];
}

function ReactionBar({
  reactions,
  currentUserId,
  isOwn,
  onReact,
}: {
  reactions: Reaction[];
  currentUserId?: string;
  isOwn: boolean;
  onReact: (emoji: string) => void;
}) {
  const agg = aggregate(reactions, currentUserId);
  return (
    <div className={`mt-1 flex flex-wrap items-center gap-1 ${isOwn ? "justify-end" : ""}`}>
      {agg.map((r) => (
        <button
          key={r.emoji}
          onClick={() => onReact(r.emoji)}
          className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs transition ${
            r.mine
              ? "border-brand bg-brand-soft text-brand-strong"
              : "border-line bg-surface text-muted hover:border-line-strong"
          }`}
        >
          <span>{r.emoji}</span>
          <span className="tabular-nums">{r.count}</span>
        </button>
      ))}
      <div className="flex items-center gap-0.5 rounded-full border border-line bg-surface px-1 py-0.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
        {QUICK_EMOJIS.map((e) => (
          <button
            key={e}
            onClick={() => onReact(e)}
            title={`React ${e}`}
            className="rounded-full px-1 text-xs transition hover:bg-surface-2"
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageRow({
  message,
  isOwn,
  currentUserId,
  onReact,
}: {
  message: Message;
  isOwn: boolean;
  currentUserId?: string;
  onReact: (messageId: string, emoji: string) => void;
}) {
  if (message.type === "AI_SUMMARY") {
    return (
      <li className="mx-auto w-full max-w-[92%] rounded-2xl border border-brand/40 bg-brand-soft/60 p-4 shadow-sm">
        <div className="mb-1.5 flex items-center gap-2 font-mono text-[11px] uppercase tracking-wide text-brand-strong">
          <span aria-hidden>✨</span>
          <span>Daily Summary</span>
          <span className="ml-auto text-muted">{formatTime(message.createdAt)}</span>
        </div>
        <p className="whitespace-pre-wrap break-words text-sm text-ink">{message.content}</p>
      </li>
    );
  }

  // System messages have no human sender — centred and quiet.
  if (message.senderId === null) {
    return (
      <li className="mx-auto max-w-[80%] rounded-full bg-surface-2 px-3.5 py-1.5 text-center text-xs text-muted">
        {message.content}
      </li>
    );
  }

  const senderName = message.sender?.name ?? "Someone";

  return (
    <li className={`group flex items-end gap-2.5 ${isOwn ? "flex-row-reverse" : ""}`}>
      {!isOwn && <Avatar name={senderName} id={message.senderId} size={30} />}
      <div className={`flex max-w-[78%] flex-col gap-0.5 ${isOwn ? "items-end" : "items-start"}`}>
        <div className="flex items-baseline gap-2 px-1 font-mono text-[11px] text-muted">
          {!isOwn && <span className="uppercase tracking-wide">{senderName}</span>}
          <span>{formatTime(message.createdAt)}</span>
        </div>
        <div
          className={`whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm shadow-sm ${
            isOwn ? "rounded-br-md bg-brand text-on-brand" : "rounded-bl-md bg-surface text-ink"
          }`}
        >
          {message.content}
        </div>
        <ReactionBar
          reactions={message.reactions}
          currentUserId={currentUserId}
          isOwn={isOwn}
          onReact={(emoji) => onReact(message.id, emoji)}
        />
      </div>
    </li>
  );
}

export function MessageList({ groupId }: { groupId: string }) {
  const { user } = useAuth();
  const { messages, isLoading, isError, error, hasOlder, loadOlder, isLoadingOlder } =
    useGroupMessages(groupId);

  const bottomRef = useRef<HTMLDivElement>(null);

  // Toggle a reaction; the UI updates when the reaction_updated broadcast lands (sender included).
  function react(messageId: string, emoji: string) {
    void toggleReaction(groupId, messageId, emoji).catch(() => {});
  }

  // Scroll to the bottom when the NEWEST message changes — keyed on the last id, so loading OLDER
  // history doesn't yank the view.
  const newestId = messages[messages.length - 1]?.id;
  useEffect(() => {
    bottomRef.current?.scrollIntoView();
  }, [newestId]);

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted">Loading messages…</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p role="alert" className="text-sm text-brand-strong">
          {getApiErrorMessage(error, "Couldn't load messages")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="flex flex-col gap-3.5 px-1 py-4">
        {hasOlder && (
          <button
            onClick={() => void loadOlder()}
            disabled={isLoadingOlder}
            className="mx-auto rounded-full border border-line px-3 py-1 font-mono text-xs uppercase tracking-wide text-muted transition hover:border-line-strong hover:text-ink disabled:opacity-60"
          >
            {isLoadingOlder ? "Loading…" : "Load older"}
          </button>
        )}

        {messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">No messages yet. Say hello.</p>
        ) : (
          <ul className="flex flex-col gap-3.5">
            {messages.map((message) => (
              <MessageRow
                key={message.id}
                message={message}
                isOwn={message.senderId === user?.id}
                currentUserId={user?.id}
                onReact={react}
              />
            ))}
          </ul>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
