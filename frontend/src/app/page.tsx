"use client";

import { AppHeader } from "@/components/app-header";
import { CreateGroupForm } from "@/components/groups/create-group-form";
import { GroupList } from "@/components/groups/group-list";
import { JoinGroupForm } from "@/components/groups/join-group-form";
import { useRequireAuth } from "@/lib/auth/use-require-auth";

/**
 * Home: the user's groups, with ways to create or join one. Protected by useRequireAuth (a UX
 * redirect; the backend is the real gate).
 */
export default function HomePage() {
  const status = useRequireAuth();

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
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-8">
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Start or join a group
          </h2>
          <CreateGroupForm />
          <JoinGroupForm />
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Your groups
          </h2>
          <GroupList />
        </section>
      </main>
    </div>
  );
}
