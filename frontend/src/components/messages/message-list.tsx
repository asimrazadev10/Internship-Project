"use client";

import { useEffect, useRef } from "react";

import { MessageRow } from "@/components/messages/message-row";
import { EmptyState } from "@/components/ui/empty-state";
import { EmptyMessages } from "@/components/ui/illustrations";
import { EYEBROW_CLASS } from "@/components/ui/styles";
import { markRead } from "@/lib/api/groups";
import { deleteMessage, editMessage, toggleReaction } from "@/lib/api/messages";
import { getApiErrorMessage } from "@/lib/api/error";
import type { GroupMemberView } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/auth-context";
import { useGroupMessages } from "@/lib/queries/messages";

/**
 * The scroll container: loading/error/empty branches, the load-older control, the mutations, and
 * the "seen by" computation. Rendering a single message is MessageRow's job.
 *
 * The mutations are deliberately fire-and-forget — the UI updates when the resulting broadcast
 * (reaction_updated / message_updated / new_message) lands, so a message never appears twice via
 * an optimistic write plus its own echo.
 */
export function MessageList({
  groupId,
  members,
}: {
  groupId: string;
  members: GroupMemberView[];
}) {
  const { user } = useAuth();
  const {
    messages,
    isLoading,
    isError,
    error,
    hasOlder,
    loadOlder,
    isLoadingOlder,
  } = useGroupMessages(groupId);

  const bottomRef = useRef<HTMLDivElement>(null);

  const react = (messageId: string, emoji: string) =>
    void toggleReaction(groupId, messageId, emoji).catch(() => {});
  const edit = (messageId: string, content: string) =>
    void editMessage(groupId, messageId, content).catch(() => {});
  const remove = (messageId: string) =>
    void deleteMessage(groupId, messageId).catch(() => {});

  const newestId = messages[messages.length - 1]?.id;
  useEffect(() => {
    bottomRef.current?.scrollIntoView();
    // Only mark read when the tab is actually visible — otherwise a background tab would report
    // the user as having seen messages they have not looked at. The rejection is swallowed
    // deliberately: a failed read receipt is cosmetic and must not surface as an error.
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
            className={`${EYEBROW_CLASS} mx-auto rounded-full border border-line px-3 py-1 transition hover:border-line-strong hover:text-ink disabled:opacity-60`}
          >
            {isLoadingOlder ? "Loading…" : "Load older"}
          </button>
        )}

        {messages.length === 0 ? (
          <EmptyState
            illustration={<EmptyMessages />}
            title="No messages yet"
            hint="Say hello."
          />
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
