"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";

import { AppHeader } from "@/components/app-header";
import { MessageComposer } from "@/components/messages/message-composer";
import { MessageList } from "@/components/messages/message-list";
import { Avatar } from "@/components/ui/avatar";
import { getApiErrorMessage } from "@/lib/api/error";
import { useRequireAuth } from "@/lib/auth/use-require-auth";
import { useGroup } from "@/lib/queries/groups";
import { useSocket } from "@/lib/socket/socket-provider";
import { useGroupRoom } from "@/lib/socket/use-group-room";
import { usePresence } from "@/lib/socket/use-presence";
import { useTyping } from "@/lib/socket/use-typing";

function typingLabel(names: string[]): string {
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  return "Several people are typing…";
}

/**
 * A group's chat view: a compact header (name, member count, a connection-aware Live pill, and a
 * copyable invite id), the scrollable history, and the composer. A non-member gets the backend's
 * 403 as a clear message — the membership guard, made visible.
 */
export default function GroupPage() {
  const status = useRequireAuth();
  const params = useParams<{ id: string }>();
  const groupId = params.id;
  const { data: group, isLoading, isError, error } = useGroup(groupId);
  const { connected } = useSocket();
  useGroupRoom(groupId);
  const { typingUserIds, notifyTyping, stopTyping } = useTyping(groupId);
  const onlineUserIds = usePresence(groupId);
  const [copied, setCopied] = useState(false);

  const typingNames = useMemo(() => {
    if (!group) return [];
    return typingUserIds
      .map((id) => group.members.find((m) => m.user.id === id)?.user.name)
      .filter((n): n is string => Boolean(n));
  }, [typingUserIds, group]);

  function copyId() {
    void navigator.clipboard.writeText(groupId).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  }

  if (status !== "authenticated") {
    return (
      <main className="flex min-h-full flex-1 items-center justify-center">
        <p className="text-sm text-muted">Loading…</p>
      </main>
    );
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <AppHeader />

      <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col px-4">
        <div className="flex flex-col gap-3 py-4">
          <Link
            href="/"
            className="w-fit font-mono text-xs uppercase tracking-wide text-muted transition hover:text-ink"
          >
            ← All groups
          </Link>

          {isError && (
            <p role="alert" className="text-sm text-brand-strong">
              {getApiErrorMessage(error, "Couldn't load this group")}
            </p>
          )}

          {group && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Avatar name={group.name} id={group.id} size={40} />
                <div>
                  <h1 className="font-display text-xl font-extrabold tracking-tight">
                    {group.name}
                  </h1>
                  <p className="flex items-center gap-2 text-sm text-muted">
                    <span>
                      {group.members.length} member
                      {group.members.length === 1 ? "" : "s"}
                    </span>
                    {onlineUserIds.length > 0 && (
                      <span className="inline-flex items-center gap-1 text-live">
                        <span className="h-1.5 w-1.5 rounded-full bg-live" />
                        {onlineUserIds.length} online
                      </span>
                    )}
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide ${
                        connected ? "bg-live/12 text-live" : "bg-muted/12 text-muted"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-live" : "bg-muted"}`}
                      />
                      {connected ? "Live" : "Connecting…"}
                    </span>
                  </p>
                </div>
              </div>
              <button
                onClick={copyId}
                title="Copy the invite id — share it so others can join"
                className="rounded-full border border-line px-3 py-1.5 font-mono text-xs uppercase tracking-wide text-muted transition hover:border-line-strong hover:text-ink"
              >
                {copied ? "Copied ✓" : "Copy invite id"}
              </button>
            </div>
          )}
        </div>

        {group && (
          <>
            <MessageList groupId={groupId} />
            {typingNames.length > 0 && (
              <p
                aria-live="polite"
                className="px-1 pb-1 text-xs text-muted animate-pulse"
              >
                {typingLabel(typingNames)}
              </p>
            )}
            <MessageComposer
              groupId={groupId}
              onType={notifyTyping}
              onStopTyping={stopTyping}
            />
          </>
        )}

        {isLoading && (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-muted">Loading group…</p>
          </div>
        )}
      </div>
    </div>
  );
}
