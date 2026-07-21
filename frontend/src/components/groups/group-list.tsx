"use client";

import Link from "next/link";

import { getApiErrorMessage } from "@/lib/api/error";
import { useGroups } from "@/lib/queries/groups";

/**
 * The current user's groups. Each card links to the group's page. Renders the three states a
 * query has — loading, error, and data (including the empty case) — explicitly, so the UI never
 * shows a blank or a crash while data is in flight.
 */
export function GroupList() {
  const { data: groups, isLoading, isError, error } = useGroups();

  if (isLoading) {
    return <p className="text-sm text-zinc-500">Loading your groups…</p>;
  }

  if (isError) {
    return (
      <p role="alert" className="text-sm text-red-600 dark:text-red-400">
        {getApiErrorMessage(error, "Couldn't load your groups")}
      </p>
    );
  }

  if (!groups || groups.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
        You&rsquo;re not in any groups yet. Create one above, or join with a group id.
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {groups.map((group) => (
        <li key={group.id}>
          <Link
            href={`/groups/${group.id}`}
            className="flex items-center justify-between rounded-lg border border-zinc-200 px-4 py-3 transition hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:border-zinc-700 dark:hover:bg-zinc-900"
          >
            <span className="font-medium">{group.name}</span>
            {group._count && (
              <span className="text-xs text-zinc-500">
                {group._count.members} member
                {group._count.members === 1 ? "" : "s"} ·{" "}
                {group._count.messages} message
                {group._count.messages === 1 ? "" : "s"}
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
