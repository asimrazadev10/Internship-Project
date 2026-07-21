"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { getApiErrorMessage } from "@/lib/api/error";
import { useRequireAuth } from "@/lib/auth/use-require-auth";
import { useGroup } from "@/lib/queries/groups";

/**
 * A single group: its name and members. The message list and composer (where Phase 2 polling
 * attaches) are added in the next piece.
 *
 * A non-member hitting this URL gets the backend's 403, surfaced as a clear message rather than a
 * blank screen — the membership guard doing its job, visible to the user.
 */
export default function GroupPage() {
  const status = useRequireAuth();
  const params = useParams<{ id: string }>();
  const { data: group, isLoading, isError, error } = useGroup(params.id);

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
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8">
        <Link
          href="/"
          className="text-sm text-zinc-500 transition hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          ← All groups
        </Link>

        {isLoading && <p className="text-sm text-zinc-500">Loading group…</p>}

        {isError && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {getApiErrorMessage(error, "Couldn't load this group")}
          </p>
        )}

        {group && (
          <>
            <header>
              <h1 className="text-2xl font-semibold tracking-tight">
                {group.name}
              </h1>
              <p className="mt-1 text-sm text-zinc-500">
                {group.members.length} member
                {group.members.length === 1 ? "" : "s"}
              </p>
            </header>

            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                Members
              </h2>
              <ul className="flex flex-col gap-1">
                {group.members.map((member) => (
                  <li
                    key={member.user.id}
                    className="flex items-center justify-between rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800"
                  >
                    <span>{member.user.name}</span>
                    <span className="text-xs uppercase tracking-wide text-zinc-400">
                      {member.role}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <div className="rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
              Messages will appear here. (Coming next.)
            </div>
          </>
        )}
      </main>
    </div>
  );
}
