import axios, {
  AxiosError,
  AxiosHeaders,
  type InternalAxiosRequestConfig,
} from "axios";

import { AUTH_LOGOUT_EVENT } from "@/lib/storage-keys";
import { tokenStore } from "./tokens";
import type { ApiSuccess, AuthTokens } from "./types";

/**
 * The single axios instance every request goes through.
 *
 * baseURL is "/api" — a relative path. The browser therefore calls the Next origin, which
 * proxies to the backend (next.config.ts), so requests are same-origin and need no CORS.
 *
 * Two interceptors do the auth work so no caller has to:
 *   request  → attach the access token as a Bearer header.
 *   response → on a 401, transparently refresh the token once and retry the request.
 */
/**
 * Both axios instances must agree on this, or the refresh call below bypasses the Next rewrite and
 * 404s — and the very reason two instances exist (avoiding refresh recursion) is what makes it easy
 * to edit one and forget the other. Module-local rather than a shared constants file: the two uses
 * are seven lines apart, and next.config.ts declares the matching "/api/:path*" rewrite but cannot
 * import from src/, so a third "unified" home would be a fiction.
 */
const API_BASE_URL = "/api";

export const api = axios.create({ baseURL: API_BASE_URL });

/**
 * A separate, interceptor-free instance used ONLY to call the refresh endpoint. Using `api` for
 * that would recurse: a failed refresh returns 401, which would trigger the response interceptor,
 * which would try to refresh again, forever.
 */
const refreshClient = axios.create({ baseURL: API_BASE_URL });

// Allow marking a request as already-retried so a second 401 doesn't loop.
interface RetryableConfig extends InternalAxiosRequestConfig {
  _retried?: boolean;
}

// ---------- Request: attach the access token ----------

api.interceptors.request.use((config) => {
  const token = tokenStore.access;
  if (token) {
    const headers = AxiosHeaders.from(config.headers);
    headers.set("Authorization", `Bearer ${token}`);
    config.headers = headers;
  }
  return config;
});

// ---------- Refresh, single-flight ----------

/**
 * When several requests 401 at once, they must NOT each fire their own refresh — that would race,
 * and rotation would flag the second one as reuse and revoke the family. So all concurrent
 * callers share ONE in-flight refresh promise; it clears itself when settled.
 */
let refreshInFlight: Promise<string | null> | null = null;

function refreshAccessToken(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = doRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

async function doRefresh(): Promise<string | null> {
  const refreshToken = tokenStore.refresh;
  if (!refreshToken) return null;

  try {
    const { data } = await refreshClient.post<ApiSuccess<AuthTokens>>(
      "/auth/refresh",
      { refreshToken },
    );
    tokenStore.set(data.data);
    return data.data.accessToken;
  } catch {
    // Refresh itself failed (expired, revoked, or reuse-detected) — the session is over.
    tokenStore.clear();
    return null;
  }
}

// ---------- Response: refresh-on-401 then retry ----------

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as RetryableConfig | undefined;

    const isAuthError = error.response?.status === 401;
    const canRetry = original && !original._retried && tokenStore.refresh;

    if (isAuthError && canRetry) {
      original._retried = true;

      const newAccessToken = await refreshAccessToken();
      if (newAccessToken) {
        const headers = AxiosHeaders.from(original.headers);
        headers.set("Authorization", `Bearer ${newAccessToken}`);
        original.headers = headers;
        return api(original);
      }

      // Refresh failed → session is dead. Notify the app so it can route to /login.
      // A DOM event keeps this module free of any React/router dependency.
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event(AUTH_LOGOUT_EVENT));
      }
    }

    return Promise.reject(error);
  },
);
