import axios from "axios";

import type { ApiError } from "./types";

/**
 * Pulls the backend's error envelope out of an axios error so UI code can show a real message
 * instead of axios's generic "Request failed with status code 401".
 */
export function getApiErrorMessage(
  error: unknown,
  fallback = "Something went wrong",
): string {
  if (axios.isAxiosError(error)) {
    const body = error.response?.data as ApiError | undefined;
    if (body && body.success === false) {
      return body.error.message;
    }
    if (error.message) return error.message;
  }
  return fallback;
}

/** The stable, machine-readable error code from the backend envelope, if present. */
export function getApiErrorCode(error: unknown): string | null {
  if (axios.isAxiosError(error)) {
    const body = error.response?.data as ApiError | undefined;
    if (body && body.success === false) return body.error.code;
  }
  return null;
}
