"use client";

import { useMemo } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import type { Message } from "@/lib/api/types";
import * as messagesApi from "@/lib/api/messages";

export const messageKeys = {
  /** On-demand older history (an infinite query; NOT polled). */
  history: (groupId: string) => ["messages", groupId, "history"] as const,
  /** Socket-fed live buffer — populated by SocketProvider on new_message, never polled. */
  live: (groupId: string) => ["messages", groupId, "live"] as const,
};

const PAGE_SIZE = 20;

/**
 * Group messages: REST history (load-older) + a socket-fed live buffer, merged.
 * The `live` cache key is populated by SocketProvider on new_message — no polling.
 */
export function useGroupMessages(groupId: string) {
  const history = useInfiniteQuery({
    queryKey: messageKeys.history(groupId),
    queryFn: ({ pageParam }) =>
      messagesApi.getMessages(groupId, { limit: PAGE_SIZE, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.meta.nextCursor ?? undefined,
    enabled: Boolean(groupId),
  });

  // Passive cache: no network. SocketProvider writes new messages here via setQueryData.
  const live = useQuery({
    queryKey: messageKeys.live(groupId),
    queryFn: () => [] as Message[],
    enabled: Boolean(groupId),
    staleTime: Infinity,
    initialData: [] as Message[],
  });

  const messages = useMemo<Message[]>(() => {
    const byId = new Map<string, Message>();
    for (const page of history.data?.pages ?? []) {
      for (const m of page.data) byId.set(m.id, m);
    }
    for (const m of live.data ?? []) byId.set(m.id, m);
    return [...byId.values()].sort((a, b) => {
      const byTime = a.createdAt.localeCompare(b.createdAt);
      return byTime !== 0 ? byTime : a.id.localeCompare(b.id);
    });
  }, [history.data, live.data]);

  return {
    messages,
    isLoading: history.isLoading,
    isError: history.isError,
    error: history.error,
    hasOlder: history.hasNextPage,
    loadOlder: history.fetchNextPage,
    isLoadingOlder: history.isFetchingNextPage,
  };
}
