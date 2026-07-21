"use client";

import { useAuth } from "@/lib/auth/auth-context";
import { useRequireAuth } from "@/lib/auth/use-require-auth";

/**
 * The app home. Protected: unauthenticated visitors are redirected to /login by useRequireAuth.
 *
 * For now this is a placeholder that proves the auth loop works end to end (sign in → land here →
 * sign out). The groups list and chat UI replace this content in the next pieces.
 */
export default function HomePage() {
  const status = useRequireAuth();
  const { user, logout } = useAuth();

  if (status !== "authenticated") {
    return (
      <main className="flex min-h-full flex-1 items-center justify-center">
        <p className="text-sm text-zinc-500">Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-12">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Group Chat</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Signed in as {user?.name}{" "}
            <span className="text-zinc-400">({user?.email})</span>
          </p>
        </div>
        <button
          onClick={() => void logout()}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          Log out
        </button>
      </header>

      <div className="rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
        Your groups will appear here. (Coming next.)
      </div>
    </main>
  );
}
