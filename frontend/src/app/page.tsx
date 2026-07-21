"use client";

import { AppHeader } from "@/components/app-header";
import { CreateGroupForm } from "@/components/groups/create-group-form";
import { GroupList } from "@/components/groups/group-list";
import { JoinGroupForm } from "@/components/groups/join-group-form";
import { useAuth } from "@/lib/auth/auth-context";
import { useRequireAuth } from "@/lib/auth/use-require-auth";

/** Home: the user's groups, with ways to create or join one. Protected by useRequireAuth. */
export default function HomePage() {
  const status = useRequireAuth();
  const { user } = useAuth();

  if (status !== "authenticated") {
    return (
      <main className="flex min-h-full flex-1 items-center justify-center">
        <p className="text-sm text-muted">Loading…</p>
      </main>
    );
  }

  const firstName = user?.name.split(/\s+/)[0];

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <AppHeader />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 px-4 py-10">
        <div>
          <p className="font-mono text-xs uppercase tracking-wide text-muted">
            Your rooms
          </p>
          <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight">
            {firstName ? `Hey, ${firstName}` : "Your groups"}
          </h1>
        </div>

        <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface-2/60 p-5">
          <h2 className="font-mono text-xs uppercase tracking-wide text-muted">
            Start or join a group
          </h2>
          <CreateGroupForm />
          <JoinGroupForm />
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-mono text-xs uppercase tracking-wide text-muted">
            Your groups
          </h2>
          <GroupList />
        </section>
      </main>
    </div>
  );
}
