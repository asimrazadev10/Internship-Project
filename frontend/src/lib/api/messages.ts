import { api } from "./client";
import type {
  ApiSuccess,
  Message,
  MessagePage,
  PaginationMeta,
  Reaction,
} from "./types";

/**
 * A page of a group's message history, newest first. `cursor` is the opaque token from a
 * previous page's meta.nextCursor; omit it for the first page.
 *
 * The backend returns meta at the envelope's top level (not inside data), so both are read off
 * the response and repackaged into a MessagePage for callers.
 */
export async function getMessages(
  groupId: string,
  params: { limit?: number; cursor?: string } = {},
): Promise<MessagePage> {
  const { data } = await api.get<ApiSuccess<Message[]>>(
    `/groups/${groupId}/messages`,
    { params },
  );
  return { data: data.data, meta: data.meta as PaginationMeta };
}

/** Search a group's messages by content (case-insensitive), newest first. */
export async function searchMessages(
  groupId: string,
  q: string,
): Promise<Message[]> {
  const { data } = await api.get<ApiSuccess<Message[]>>(
    `/groups/${groupId}/messages/search`,
    { params: { q } },
  );
  return data.data;
}

/** Post a message to a group. */
export async function sendMessage(
  groupId: string,
  content: string,
): Promise<Message> {
  const { data } = await api.post<ApiSuccess<Message>>(
    `/groups/${groupId}/messages`,
    { content },
  );
  return data.data;
}

/** Edit your own message. The updated message is also broadcast live via message_updated. */
export async function editMessage(
  groupId: string,
  messageId: string,
  content: string,
): Promise<Message> {
  const { data } = await api.patch<ApiSuccess<Message>>(
    `/groups/${groupId}/messages/${messageId}`,
    { content },
  );
  return data.data;
}

/** Soft-delete your own message. */
export async function deleteMessage(
  groupId: string,
  messageId: string,
): Promise<Message> {
  const { data } = await api.delete<ApiSuccess<Message>>(
    `/groups/${groupId}/messages/${messageId}`,
  );
  return data.data;
}

/** Toggle the current user's emoji on a message. Returns its new reaction set (also broadcast live). */
export async function toggleReaction(
  groupId: string,
  messageId: string,
  emoji: string,
): Promise<Reaction[]> {
  const { data } = await api.post<ApiSuccess<Reaction[]>>(
    `/groups/${groupId}/messages/${messageId}/reactions`,
    { emoji },
  );
  return data.data;
}
