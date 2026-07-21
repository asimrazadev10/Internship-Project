"use client";

import Link from "next/link";

import { Avatar } from "@/components/ui/avatar";
import { getApiErrorMessage } from "@/lib/api/error";
import { useGroups } from "@/lib/queries/groups";

/** The current user's groups. Renders loading, error, and data (incl. empty) explicitly. */
export function GroupList() {
  const { data: groups, isLoading, isError, error } = useGroups();

  if (isLoading) {
    return <p className="text-sm text-muted">Loading your groups…</p>;
  }

  if (isError) {
    return (
      <p role="alert" className="text-sm text-brand-strong">
        {getApiErrorMessage(error, "Couldn't load your groups")}
      </p>
    );
  }

  if (!groups || groups.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line-strong bg-surface/50 p-10 text-center text-sm text-muted">
        No groups yet. Create one above, or paste an invite id to join.
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2.5">
      {groups.map((group) => (
        <li key={group.id}>
          <Link
            href={`/groups/${group.id}`}
            className="group flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5 shadow-sm transition hover:border-line-strong hover:shadow-md"
          >
            <Avatar name={group.name} id={group.id} size={40} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-ink">{group.name}</p>
              {group._count && (
                <p className="font-mono text-xs text-muted">
                  {group._count.members} member
                  {group._count.members === 1 ? "" : "s"} ·{" "}
                  {group._count.messages} message
                  {group._count.messages === 1 ? "" : "s"}
                </p>
              )}
            </div>
            <span className="text-muted transition group-hover:translate-x-0.5 group-hover:text-ink">
              →
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
