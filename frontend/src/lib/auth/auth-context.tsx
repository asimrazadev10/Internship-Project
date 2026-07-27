"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import * as authApi from "@/lib/api/auth";
import { tokenStore, userStore } from "@/lib/api/session";
import type { User } from "@/lib/api/types";
import { AUTH_LOGOUT_EVENT } from "@/lib/storage-keys";

/**
 * Holds the current session and exposes the auth actions.
 *
 * Why a Context and not TanStack Query: auth state is app-wide singleton state that many
 * unrelated components read (nav bar, guards, pages), not server data keyed by a query. Context
 * is the right tool; Query stays for server resources like groups and messages.
 *
 * The user object is persisted in localStorage alongside the tokens so a page reload can show
 * "who am I" without a round-trip. There is deliberately no GET /auth/me endpoint — adding one
 * would mean touching the backend, which Phase 2 avoids. The tradeoff is that the cached name
 * could go stale; acceptable for this app.
 */

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthContextValue {
  user: User | null;
  status: AuthStatus;
  login: (email: string, password: string) => Promise<void>;
  register: (input: {
    email: string;
    password: string;
    name: string;
  }) => Promise<void>;
  googleLogin: (idToken: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  // Starts "loading" so the server render and the first client render agree (no hydration
  // mismatch); the mount effect then resolves it from storage.
  const [status, setStatus] = useState<AuthStatus>("loading");

  useEffect(() => {
    // Initialise from localStorage AFTER mount, on purpose. A lazy useState initialiser would
    // run during SSR (no localStorage there) and reading it on the client's first render would
    // desync from the server's "loading" render — a hydration mismatch. Rendering "loading"
    // first, then resolving here, is the SSR-safe pattern and also lets the route guard wait
    // instead of bouncing a logged-in user to /login for a frame. Hence the rule is disabled:
    // this is exactly the case set-state-in-effect exists to make you think about.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (tokenStore.isAuthenticated) {
      setUser(userStore.get());
      setStatus("authenticated");
    } else {
      setStatus("unauthenticated");
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // The API client dispatches "auth:logout" when a refresh fails (token expired/revoked/reused).
  // Reflect that here so the whole app drops to the login screen.
  useEffect(() => {
    function onForcedLogout() {
      setUser(null);
      userStore.set(null);
      setStatus("unauthenticated");
      router.replace("/login");
    }
    window.addEventListener(AUTH_LOGOUT_EVENT, onForcedLogout);
    return () => window.removeEventListener(AUTH_LOGOUT_EVENT, onForcedLogout);
  }, [router]);

  const login = useCallback(async (email: string, password: string) => {
    const result = await authApi.login({ email, password });
    setUser(result.user);
    userStore.set(result.user);
    setStatus("authenticated");
  }, []);

  const register = useCallback(
    async (input: { email: string; password: string; name: string }) => {
      const result = await authApi.register(input);
      setUser(result.user);
      userStore.set(result.user);
      setStatus("authenticated");
    },
    [],
  );

  const googleLogin = useCallback(async (idToken: string) => {
    const result = await authApi.googleLogin(idToken);
    setUser(result.user);
    userStore.set(result.user);
    setStatus("authenticated");
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    setUser(null);
    userStore.set(null);
    setStatus("unauthenticated");
    router.replace("/login");
  }, [router]);

  return (
    <AuthContext.Provider
      value={{ user, status, login, register, googleLogin, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
