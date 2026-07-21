import type { AuthTokens } from "./types";

/**
 * Token storage.
 *
 * Tokens live in localStorage — consistent with the Phase 1 decision to return them in the login
 * response body. The tradeoff is documented: localStorage is readable by any script, so an XSS
 * bug could exfiltrate a token. The mitigation for a stolen refresh token is the backend's
 * rotation + reuse detection, not the storage location. (An httpOnly cookie would remove the XSS
 * read at the cost of CORS/CSRF handling — deliberately out of scope for this phase.)
 *
 * Every access is guarded for SSR: this module can be imported into components that render on the
 * server, where `window`/`localStorage` do not exist. On the server it behaves as "no tokens".
 */

const ACCESS_KEY = "chat.accessToken";
const REFRESH_KEY = "chat.refreshToken";

function canUseStorage(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

export const tokenStore = {
  get access(): string | null {
    return canUseStorage() ? window.localStorage.getItem(ACCESS_KEY) : null;
  },

  get refresh(): string | null {
    return canUseStorage() ? window.localStorage.getItem(REFRESH_KEY) : null;
  },

  set(tokens: AuthTokens): void {
    if (!canUseStorage()) return;
    window.localStorage.setItem(ACCESS_KEY, tokens.accessToken);
    window.localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
  },

  clear(): void {
    if (!canUseStorage()) return;
    window.localStorage.removeItem(ACCESS_KEY);
    window.localStorage.removeItem(REFRESH_KEY);
  },

  get isAuthenticated(): boolean {
    return this.access !== null;
  },
};
