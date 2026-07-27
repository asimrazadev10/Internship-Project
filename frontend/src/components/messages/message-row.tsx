"use client";

import { useState } from "react";

import { Attachment } from "@/components/messages/attachment";
import {
  MessageActions,
  type MessageOverlay,
} from "@/components/messages/message-actions";
import { ReactionChips } from "@/components/messages/reaction-chips";
import { Avatar } from "@/components/ui/avatar";
import {
  BUBBLE_CLASS,
  BUBBLE_OTHER,
  BUBBLE_OWN,
  BUBBLE_ROW_CLASS,
  META_CLASS,
} from "@/components/ui/styles";
import type { Message } from "@/lib/api/types";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * One message. Four render modes, dispatched in order: AI summary card, system notice, deleted
 * tombstone, and the normal bubble.
 *
 * Inline editing stays HERE rather than becoming a sixth file. The seam is not clean: the toolbar's
 * edit button has to set both `editing` and `draft`, so splitting it out would mean threading an
 * onStartEdit callback plus draft state across another boundary — added indirection for one small
 * block.
 *
 * The hooks are declared before the early returns on purpose; React requires an unconditional hook
 * order, so the AI/system/tombstone branches cannot come first.
 */
export function MessageRow({
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
  const [overlay, setOverlay] = useState<MessageOverlay>(null);

  if (message.type === "AI_SUMMARY") {
    return (
      <li className="mx-auto w-full max-w-[92%] rounded-2xl border border-brand/40 bg-brand-soft/60 p-4 shadow-sm">
        <div className="mb-1.5 flex items-center gap-2 font-mono text-[11px] uppercase tracking-wide text-brand-strong">
          <span aria-hidden>✨</span>
          <span>Daily Summary</span>
          <span className="ml-auto text-muted">
            {formatTime(message.createdAt)}
          </span>
        </div>
        <p className="whitespace-pre-wrap break-words text-sm text-ink">
          {message.content}
        </p>
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
      <li className={`${BUBBLE_ROW_CLASS} ${isOwn ? "flex-row-reverse" : ""}`}>
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
    <li
      className={`group ${BUBBLE_ROW_CLASS} ${isOwn ? "flex-row-reverse" : ""}`}
      // Dismisses whichever overlay is open. One call because the two are one state.
      onMouseLeave={() => setOverlay(null)}
    >
      {!isOwn && <Avatar name={senderName} id={message.senderId} size={30} />}
      <div
        className={`flex max-w-[78%] flex-col gap-0.5 ${isOwn ? "items-end" : "items-start"}`}
      >
        <div className={`${META_CLASS} flex items-baseline gap-2 px-1`}>
          {!isOwn && <span className="uppercase tracking-wide">{senderName}</span>}
          <span>{formatTime(message.createdAt)}</span>
          {message.editedAt && <span>· edited</span>}
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
          <div className="relative">
            <div
              className={`${BUBBLE_CLASS} flex flex-col gap-2 ${
                isOwn ? BUBBLE_OWN : BUBBLE_OTHER
              }`}
            >
              {message.attachmentUrl && (
                <Attachment
                  url={message.attachmentUrl}
                  name={message.attachmentName}
                  mime={message.attachmentMime}
                />
              )}
              {message.content && (
                <p className="whitespace-pre-wrap break-words">
                  {message.content}
                </p>
              )}
            </div>

            <MessageActions
              messageId={message.id}
              isOwn={isOwn}
              overlay={overlay}
              setOverlay={setOverlay}
              onStartEdit={() => {
                setDraft(message.content);
                setEditing(true);
              }}
              onReact={onReact}
              onDelete={onDelete}
            />
          </div>
        )}

        <ReactionChips
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
