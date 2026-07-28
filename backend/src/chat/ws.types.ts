/**
 * HOW THIS FILE WORKS
 *   1. AuthData — what the auth middleware attaches to socket.data after verifying the token.
 *   2. AuthedSocket — a Socket narrowed so handlers can read socket.data without casting.
 */
import type { Socket } from 'socket.io';

// Step 1. Mirrors the JWT payload's useful claims; set once, in ws-auth.middleware.
export interface AuthData {
  userId: string;
  email: string;
}

// Step 2. Socket.data is `any` by default — this intersection is what makes handlers type-safe.
export type AuthedSocket = Socket & { data: AuthData };
