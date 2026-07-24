"use client";

import { useEffect, useRef, useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { markRead } from "@/lib/api/groups";
import { deleteMessage, editMessage, toggleReaction } from "@/lib/api/messages";
import { getApiErrorMessage } from "@/lib/api/error";
import type { GroupMemberView, Message, Reaction } from "@/lib/api/types";
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
  onEdit,
  onDelete,
  seenBy,
}: {
  message: Message;
  isOwn: boolean;
  currentUserId?: string;
  onReact: (messageId: string, emoji: string) => void;
  onEdit: (messageId: string, content: string) => void;
  onDelete: (messageId: string) => void;
  seenBy?: string[] | null;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);

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

  // Soft-deleted tombstone — the row stays so history has no gaps.
  if (message.deletedAt) {
    return (
      <li className={`flex items-end gap-2.5 ${isOwn ? "flex-row-reverse" : ""}`}>
        {!isOwn && <Avatar name={senderName} id={message.senderId} size={30} />}
        <div className="max-w-[78%] rounded-2xl border border-dashed border-line px-3.5 py-2 text-sm italic text-muted">
          This message was deleted
        </div>
      </li>
    );
  }

  function save() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== message.content) onEdit(message.id, trimmed);
    setEditing(false);
  }

  return (
    <li className={`group flex items-end gap-2.5 ${isOwn ? "flex-row-reverse" : ""}`}>
      {!isOwn && <Avatar name={senderName} id={message.senderId} size={30} />}
      <div className={`flex max-w-[78%] flex-col gap-0.5 ${isOwn ? "items-end" : "items-start"}`}>
        <div className="flex items-baseline gap-2 px-1 font-mono text-[11px] text-muted">
          {!isOwn && <span className="uppercase tracking-wide">{senderName}</span>}
          <span>{formatTime(message.createdAt)}</span>
          {message.editedAt && <span>· edited</span>}
          {isOwn && !editing && (
            <span className="flex gap-1.5 opacity-0 transition group-hover:opacity-100">
              <button
                onClick={() => {
                  setDraft(message.content);
                  setEditing(true);
                }}
                className="transition hover:text-ink"
              >
                edit
              </button>
              <button
                onClick={() => {
                  if (window.confirm("Delete this message?")) onDelete(message.id);
                }}
                className="transition hover:text-brand-strong"
              >
                delete
              </button>
            </span>
          )}
        </div>

        {editing ? (
          <div className={`flex flex-col gap-1 ${isOwn ? "items-end" : ""}`}>
            <textarea
              aria-label="Edit message"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  save();
                }
                if (e.key === "Escape") setEditing(false);
              }}
              rows={2}
              autoFocus
              className="w-64 resize-none rounded-2xl border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand"
            />
            <div className="flex gap-3 text-xs">
              <button onClick={save} className="font-semibold text-brand-strong">
                Save
              </button>
              <button
                onClick={() => {
                  setDraft(message.content);
                  setEditing(false);
                }}
                className="text-muted"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div
            className={`whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm shadow-sm ${
              isOwn ? "rounded-br-md bg-brand text-on-brand" : "rounded-bl-md bg-surface text-ink"
            }`}
          >
            {message.content}
          </div>
        )}

        <ReactionBar
          reactions={message.reactions}
          currentUserId={currentUserId}
          isOwn={isOwn}
          onReact={(emoji) => onReact(message.id, emoji)}
        />
        {seenBy && seenBy.length > 0 && (
          <p className="px-1 text-[10px] text-muted">
            Seen by {seenBy.length === 1 ? seenBy[0] : `${seenBy.length} people`}
          </p>
        )}
      </div>
    </li>
  );
}

export function MessageList({
  groupId,
  members,
}: {
  groupId: string;
  members: GroupMemberView[];
}) {
  const { user } = useAuth();
  const { messages, isLoading, isError, error, hasOlder, loadOlder, isLoadingOlder } =
    useGroupMessages(groupId);

  const bottomRef = useRef<HTMLDivElement>(null);

  // Mutations — the UI updates when the broadcast (reaction_updated / message_updated) lands.
  const react = (messageId: string, emoji: string) =>
    void toggleReaction(groupId, messageId, emoji).catch(() => {});
  const edit = (messageId: string, content: string) =>
    void editMessage(groupId, messageId, content).catch(() => {});
  const remove = (messageId: string) =>
    void deleteMessage(groupId, messageId).catch(() => {});

  const newestId = messages[messages.length - 1]?.id;
  useEffect(() => {
    bottomRef.current?.scrollIntoView();
    if (
      newestId &&
      typeof document !== "undefined" &&
      document.visibilityState === "visible"
    ) {
      void markRead(groupId).catch(() => {});
    }
  }, [newestId, groupId]);

  // "Seen by": other members whose lastReadAt has reached my most recent message.
  const lastOwn = [...messages].reverse().find((m) => m.senderId === user?.id);
  const seenNames = lastOwn
    ? members
        .filter(
          (m) =>
            m.user.id !== user?.id &&
            m.lastReadAt !== null &&
            m.lastReadAt >= lastOwn.createdAt,
        )
        .map((m) => m.user.name)
    : [];

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
                onEdit={edit}
                onDelete={remove}
                seenBy={message.id === lastOwn?.id ? seenNames : null}
              />
            ))}
          </ul>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
