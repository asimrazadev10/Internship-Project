import { api } from "./client";
import type { ApiSuccess, Message, MessagePage, PaginationMeta } from "./types";

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
