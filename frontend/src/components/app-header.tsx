"use client";

import Link from "next/link";

import { Avatar } from "@/components/ui/avatar";
import { Logo } from "@/components/ui/logo";
import { useAuth } from "@/lib/auth/auth-context";

/** Shared header for the signed-in area: wordmark (links home), the user, and sign out. */
export function AppHeader() {
  const { user, logout } = useAuth();

  return (
    <header className="sticky top-0 z-10 border-b border-line bg-canvas/85 backdrop-blur">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-3">
        <Link href="/" aria-label="Home">
          <Logo />
        </Link>
        <div className="flex items-center gap-3">
          {user && (
            <div className="flex items-center gap-2">
              <Avatar name={user.name} id={user.id} size={28} />
              <span className="hidden text-sm font-medium sm:inline">
                {user.name}
              </span>
            </div>
          )}
          <button
            onClick={() => void logout()}
            className="rounded-full border border-line px-3 py-1.5 text-sm font-medium text-muted transition hover:border-line-strong hover:text-ink"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
