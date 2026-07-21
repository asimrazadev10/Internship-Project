import { api } from "./client";
import { tokenStore } from "./tokens";
import type { ApiSuccess, AuthResult } from "./types";

/**
 * Auth endpoint calls. Each unwraps the { success, data } envelope and returns the inner data,
 * so callers deal in domain types, not the transport shape.
 *
 * login/register/googleLogin also persist the returned tokens — that is the moment a session
 * begins, so token storage belongs here rather than being every caller's responsibility.
 */

export async function register(input: {
  email: string;
  password: string;
  name: string;
}): Promise<AuthResult> {
  const { data } = await api.post<ApiSuccess<AuthResult>>(
    "/auth/register",
    input,
  );
  tokenStore.set(data.data);
  return data.data;
}

export async function login(input: {
  email: string;
  password: string;
}): Promise<AuthResult> {
  const { data } = await api.post<ApiSuccess<AuthResult>>("/auth/login", input);
  tokenStore.set(data.data);
  return data.data;
}

export async function googleLogin(idToken: string): Promise<AuthResult> {
  const { data } = await api.post<ApiSuccess<AuthResult>>("/auth/google", {
    idToken,
  });
  tokenStore.set(data.data);
  return data.data;
}

/**
 * Ends the session: tells the backend to revoke the refresh family, then clears local tokens
 * regardless of the network result — the user's intent to log out is honoured locally even if
 * the request fails.
 */
export async function logout(): Promise<void> {
  const refreshToken = tokenStore.refresh;
  try {
    if (refreshToken) {
      await api.post("/auth/logout", { refreshToken });
    }
  } finally {
    tokenStore.clear();
  }
}
