"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { getApiErrorMessage } from "@/lib/api/error";
import type { GroupMemberView } from "@/lib/api/types";
import { useLeaveGroup, useTransferOwnership } from "@/lib/queries/groups";

/**
 * HOW THIS FILE WORKS
 *   1. List every member with their role and an online dot.
 *   2. The owner gets "Make owner" on every row but their own.
 *   3. "Leave group" sits in the footer behind a confirm step.
 *   4. On a successful leave, route back to the group list.
 *
 * Role changes and departures arrive over the socket and are patched into the cached GroupDetail
 * by SocketProvider, so this renders whatever that cache currently says rather than holding a
 * copy of its own.
 */
export function MembersPanel({
  groupId,
  members,
  currentUserId,
  onlineUserIds,
  onClose,
}: {
  groupId: string;
  members: GroupMemberView[];
  currentUserId: string;
  onlineUserIds: string[];
  onClose: () => void;
}) {
  const router = useRouter();
  const leave = useLeaveGroup(groupId);
  const transfer = useTransferOwnership(groupId);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const iAmOwner =
    members.find((m) => m.user.id === currentUserId)?.role === "OWNER";
  // The only member: leaving deletes the group, so the confirm copy says so.
  const soleMember = members.length === 1;

  function onLeave() {
    setError(null);
    leave.mutate(undefined, {
      onSuccess: () => router.push("/"),
      onError: (e) => setError(getApiErrorMessage(e)),
    });
  }

  function onTransfer(userId: string) {
    setError(null);
    transfer.mutate(userId, {
      onError: (e) => setError(getApiErrorMessage(e)),
    });
  }

  return (
    <section className="mt-4 rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Members ({members.length})</h2>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-muted hover:text-ink"
        >
          Close
        </button>
      </div>

      <ul className="mt-3 flex flex-col gap-1">
        {members.map((m) => (
          <li key={m.user.id} className="flex items-center gap-3 py-1.5">
            <Avatar name={m.user.name} id={m.user.id} size={28} />
            <span className="flex-1 text-sm">
              {m.user.name}
              {m.user.id === currentUserId ? " (you)" : ""}
            </span>
            {onlineUserIds.includes(m.user.id) && (
              <span
                aria-label="online"
                className="h-1.5 w-1.5 rounded-full bg-live"
              />
            )}
            <span className="text-[11px] uppercase tracking-wide text-muted">
              {m.role}
            </span>
            {iAmOwner && m.user.id !== currentUserId && (
              <button
                type="button"
                onClick={() => onTransfer(m.user.id)}
                disabled={transfer.isPending}
                className="rounded-full border border-line px-2 py-0.5 text-[11px] hover:bg-surface-2 disabled:opacity-50"
              >
                Make owner
              </button>
            )}
          </li>
        ))}
      </ul>

      {error && <p className="mt-3 text-xs text-destructive">{error}</p>}

      <div className="mt-4 border-t border-line pt-3">
        {confirming ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex-1 text-xs text-muted">
              {soleMember
                ? "You are the only member — the group and its messages will be deleted."
                : "Leave this group?"}
            </span>
            <button
              type="button"
              onClick={onLeave}
              disabled={leave.isPending}
              className="rounded-full bg-destructive px-3 py-1 text-xs text-destructive-foreground disabled:opacity-50"
            >
              {leave.isPending ? "Leaving…" : "Confirm"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="text-xs text-muted hover:text-ink"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="text-xs text-destructive hover:underline"
          >
            Leave group
          </button>
        )}
      </div>
    </section>
  );
}
