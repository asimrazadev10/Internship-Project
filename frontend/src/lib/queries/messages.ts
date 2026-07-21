"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import * as messagesApi from "@/lib/api/messages";
import { groupKeys } from "./groups";

export const messageKeys = {
  list: (groupId: string) => ["messages", groupId] as const,
};

const PAGE_SIZE = 20;

/**
 * Message history as an infinite query — the natural fit for cursor pagination.
 *
 * The API returns newest-first pages; each page's meta.nextCursor points at OLDER messages, so
 * fetchNextPage walks backward into history. getNextPageParam returns that cursor (or undefined
 * at the end, which sets hasNextPage to false).
 *
 * The component flattens data.pages and reverses to chronological order for top-to-bottom
 * display. Keeping the store newest-first (as the API sends it) is what lets a future 10s poll
 * cheaply refetch just the first page.
 */
export function useMessages(groupId: string) {
  return useInfiniteQuery({
    queryKey: messageKeys.list(groupId),
    queryFn: ({ pageParam }) =>
      messagesApi.getMessages(groupId, {
        limit: PAGE_SIZE,
        cursor: pageParam,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.meta.nextCursor ?? undefined,
    enabled: Boolean(groupId),
  });
}

/**
 * Send a message. On success, invalidate this group's message list so the sent message appears,
 * and the groups list so its message count updates.
 *
 * Invalidate-and-refetch is the simple, correct choice for now. When polling arrives the update
 * strategy is revisited (optimistic append) so a sent message shows instantly rather than after a
 * round-trip.
 */
export function useSendMessage(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (content: string) => messagesApi.sendMessage(groupId, content),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: messageKeys.list(groupId) });
      void queryClient.invalidateQueries({ queryKey: groupKeys.all });
    },
  });
}
