import {
  ACCESS_TOKEN_KEY,
  REFRESH_TOKEN_KEY,
  USER_KEY,
} from "@/lib/storage-keys";
import type { AuthTokens, User } from "./types";

/**
 * Everything the session keeps in localStorage: the two tokens, and the cached user.
 *
 * The user accessors used to live 60 lines into AuthProvider, touching window.localStorage with
 * NO SSR guard — surviving only because they happened to be called from effects and callbacks.
 * Meanwhile this module already existed for exactly that problem. Session teardown was spread
 * across three modules as a result; it now has one home.
 *
 * Tokens live in localStorage — consistent with the Phase 1 decision to return them in the login
 * response body. The tradeoff is documented: localStorage is readable by any script, so an XSS
 * bug could exfiltrate a token. The mitigation for a stolen refresh token is the backend's
 * rotation + reuse detection, not the storage location. (An httpOnly cookie would remove the XSS
 * read at the cost of CORS/CSRF handling — deliberately out of scope for this phase.)
 *
 * Every access is guarded for SSR: this module can be imported into components that render on the
 * server, where `window`/`localStorage` do not exist. On the server it behaves as "no session".
 */

function canUseStorage(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

export const tokenStore = {
  get access(): string | null {
    return canUseStorage()
      ? window.localStorage.getItem(ACCESS_TOKEN_KEY)
      : null;
  },

  get refresh(): string | null {
    return canUseStorage()
      ? window.localStorage.getItem(REFRESH_TOKEN_KEY)
      : null;
  },

  set(tokens: AuthTokens): void {
    if (!canUseStorage()) return;
    window.localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
    window.localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
  },

  clear(): void {
    if (!canUseStorage()) return;
    window.localStorage.removeItem(ACCESS_TOKEN_KEY);
    window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  },

  get isAuthenticated(): boolean {
    return this.access !== null;
  },
};

export const userStore = {
  /**
   * The try/catch is load-bearing and must stay: a corrupted `chat.user` value degrades to a null
   * user instead of throwing during AuthProvider's mount effect, which would take the whole app
   * down at startup.
   */
  get(): User | null {
    if (!canUseStorage()) return null;
    try {
      const raw = window.localStorage.getItem(USER_KEY);
      return raw ? (JSON.parse(raw) as User) : null;
    } catch {
      return null;
    }
  },

  set(user: User | null): void {
    if (!canUseStorage()) return;
    if (user) {
      window.localStorage.setItem(USER_KEY, JSON.stringify(user));
    } else {
      window.localStorage.removeItem(USER_KEY);
    }
  },
};
