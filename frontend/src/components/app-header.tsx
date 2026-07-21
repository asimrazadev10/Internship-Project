"use client";

import Link from "next/link";

import { useAuth } from "@/lib/auth/auth-context";

/**
 * Shared header for the authenticated area: app name (links home), who is signed in, and logout.
 * Extracted so the home and group pages stay consistent and don't each re-implement it.
 */
export function AppHeader() {
  const { user, logout } = useAuth();

  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          Group Chat
        </Link>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-zinc-500 sm:inline">
            {user?.name}
          </span>
          <button
            onClick={() => void logout()}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Log out
          </button>
        </div>
      </div>
    </header>
  );
}
