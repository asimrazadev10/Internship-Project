"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { AppHeader } from "@/components/app-header";
import { MessageComposer } from "@/components/messages/message-composer";
import { MessageList } from "@/components/messages/message-list";
import { getApiErrorMessage } from "@/lib/api/error";
import { useRequireAuth } from "@/lib/auth/use-require-auth";
import { useGroup } from "@/lib/queries/groups";

/**
 * A group's chat view: a compact header (name, member count, copyable group id for inviting via
 * the open-join model), the scrollable message history, and the composer.
 *
 * A non-member gets the backend's 403, surfaced as a clear message — the membership guard, made
 * visible, rather than a blank screen.
 */
export default function GroupPage() {
  const status = useRequireAuth();
  const params = useParams<{ id: string }>();
  const groupId = params.id;
  const { data: group, isLoading, isError, error } = useGroup(groupId);
  const [copied, setCopied] = useState(false);

  function copyId() {
    void navigator.clipboard.writeText(groupId).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  }

  if (status !== "authenticated") {
    return (
      <main className="flex min-h-full flex-1 items-center justify-center">
        <p className="text-sm text-zinc-500">Loading…</p>
      </main>
    );
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <AppHeader />

      <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col px-4">
        <div className="flex flex-col gap-2 py-4">
          <Link
            href="/"
            className="text-sm text-zinc-500 transition hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            ← All groups
          </Link>

          {isError && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {getApiErrorMessage(error, "Couldn't load this group")}
            </p>
          )}

          {group && (
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h1 className="text-xl font-semibold tracking-tight">
                  {group.name}
                </h1>
                <p className="flex items-center gap-2 text-sm text-zinc-500">
                  <span>
                    {group.members.length} member
                    {group.members.length === 1 ? "" : "s"}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Live · updates every 10s
                  </span>
                </p>
              </div>
              <button
                onClick={copyId}
                title="Copy group id — share it so others can join"
                className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-500 transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                {copied ? "Copied!" : "Copy group id"}
              </button>
            </div>
          )}
        </div>

        {/* The message area and composer only make sense once the group (hence membership) loads. */}
        {group && (
          <>
            <MessageList groupId={groupId} />
            <MessageComposer groupId={groupId} />
          </>
        )}

        {isLoading && (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-zinc-500">Loading group…</p>
          </div>
        )}
      </div>
    </div>
  );
}
