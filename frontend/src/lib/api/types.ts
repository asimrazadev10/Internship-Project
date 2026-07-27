/**
 * Types mirroring the backend's response contract and domain shapes.
 *
 * These are hand-maintained to match the NestJS API. They are the frontend's half of the
 * contract — if the backend response shape changes, these change with it.
 */

// ---------- Response envelope (matches the backend ResponseInterceptor / error filters) ----------

export interface PaginationMeta {
  limit: number;
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  message?: string;
  meta?: PaginationMeta | Record<string, unknown>;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown[];
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// ---------- Domain shapes ----------

export type AuthProvider = "LOCAL" | "GOOGLE";
export type MemberRole = "OWNER" | "ADMIN" | "MEMBER";
export type MessageType = "USER" | "SYSTEM" | "AI_SUMMARY";

export interface User {
  id: string;
  email: string;
  name: string;
  provider: AuthProvider;
  createdAt: string; // ISO 8601
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult extends AuthTokens {
  user: User;
}

export interface GroupSummary {
  id: string;
  name: string;
  createdBy: string;
  createdAt: string;
  _count?: { members: number; messages: number };
}

export interface GroupMemberView {
  role: MemberRole;
  joinedAt: string;
  lastReadAt: string | null;
  user: { id: string; name: string; email: string };
}

export interface GroupDetail extends GroupSummary {
  members: GroupMemberView[];
}

export interface Message {
  id: string;
  groupId: string;
  senderId: string | null; // null for SYSTEM / AI_SUMMARY
  content: string;
  type: MessageType;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  sender: { id: string; name: string } | null;
  reactions: Reaction[];
  attachmentUrl: string | null;
  attachmentName: string | null;
  attachmentMime: string | null;
}

export interface Reaction {
  emoji: string;
  userId: string;
}

/** A page of messages plus its pagination metadata, as returned by GET /groups/:id/messages. */
export interface MessagePage {
  data: Message[];
  meta: PaginationMeta;
}
