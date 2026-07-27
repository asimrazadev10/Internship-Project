"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useAuth } from "./auth-context";

/**
 * Client-side route guard: redirects to /login once we know the visitor is unauthenticated.
 *
 * This is a UX guard, not a security boundary — the real protection is the backend, which
 * rejects every unauthenticated API call with a 401. This just spares the user a screen full of
 * failed requests and sends them to sign in. Returns the auth status so a page can render a
 * loading state until it resolves.
 */
export function useRequireAuth() {
  const router = useRouter();
  const { status } = useAuth();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  return status;
}
