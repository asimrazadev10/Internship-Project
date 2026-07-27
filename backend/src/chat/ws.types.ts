import type { Socket } from 'socket.io';

export interface AuthData {
  userId: string;
  email: string;
}

export type AuthedSocket = Socket & { data: AuthData };
