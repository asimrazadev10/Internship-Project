"use client";

import { useMemo } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import type { Message } from "@/lib/api/types";
import * as messagesApi from "@/lib/api/messages";
import { groupKeys } from "./groups";

export const messageKeys = {
  /** On-demand older history (an infinite query; NOT polled). */
  history: (groupId: string) => ["messages", groupId, "history"] as const,
  /** The newest page, polled every 10s — the live tail. */
  live: (groupId: string) => ["messages", groupId, "live"] as const,
};

const PAGE_SIZE = 20;
const POLL_INTERVAL_MS = 10_000;

/**
 * Group messages: on-demand history + a polled live tail, merged.
 *
 * WHY TWO QUERIES. The backend endpoint only paginates backward (older-than-cursor); it has no
 * "newer-than" param, and Phase 2 forbids touching the backend. So to "fetch only new messages to
 * cut load" (CLAUDE.md's preference) without a backend change, the design splits:
 *
 *   history  — useInfiniteQuery, NOT polled. Loads the newest page, then older pages when the
 *              user clicks "load older". This is where deep history accumulates.
 *   live     — useQuery for just the newest page, refetchInterval 10s. Each poll is ONE request
 *              for the newest PAGE_SIZE messages, regardless of how much history is loaded.
 *
 * The two are merged deduped by id and sorted chronologically. Consequences:
 *   - Polling cost is bounded to one page per interval — it never re-pulls history.
 *   - New messages arrive within 10s via the live query.
 *   - Old messages never vanish: history is not refetched, so it retains messages that scroll out
 *     of the sliding newest-page window.
 *
 * The irreducible waste — re-pulling the newest page even when nothing changed — is the honest
 * cost of polling with no "since" param, and is exactly why Phase 3 replaces this with WebSocket
 * push. (Caveat: a burst of >PAGE_SIZE messages within one interval could leave a gap between the
 * live window and history; acceptable at this scale, and another reason sockets come next.)
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

  const live = useQuery({
    queryKey: messageKeys.live(groupId),
    queryFn: () => messagesApi.getMessages(groupId, { limit: PAGE_SIZE }),
    enabled: Boolean(groupId),
    refetchInterval: POLL_INTERVAL_MS,
    // Default is false, set explicitly: polling pauses while the tab is hidden — no point
    // fetching for a user who isn't looking. Returning to the tab refetches immediately.
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  const messages = useMemo<Message[]>(() => {
    const byId = new Map<string, Message>();
    for (const page of history.data?.pages ?? []) {
      for (const message of page.data) byId.set(message.id, message);
    }
    for (const message of live.data?.data ?? []) byId.set(message.id, message);

    // ISO-8601 createdAt (UTC) sorts chronologically as a string; id (UUIDv7) is the tiebreaker.
    return [...byId.values()].sort((a, b) => {
      const byTime = a.createdAt.localeCompare(b.createdAt);
      return byTime !== 0 ? byTime : a.id.localeCompare(b.id);
    });
  }, [history.data, live.data]);

  return {
    messages,
    // Initial load: nothing to show until the first of either query resolves.
    isLoading: history.isLoading && live.isLoading,
    isError: history.isError || live.isError,
    error: history.error ?? live.error,
    hasOlder: history.hasNextPage,
    loadOlder: history.fetchNextPage,
    isLoadingOlder: history.isFetchingNextPage,
    // True during a background poll — drives the subtle "live" indicator.
    isPolling: live.isFetching,
  };
}

/**
 * Send a message. Invalidate the live tail so the sender sees their own message immediately
 * rather than waiting up to 10s for the next poll, and the groups list so its count updates.
 */
export function useSendMessage(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (content: string) => messagesApi.sendMessage(groupId, content),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: messageKeys.live(groupId) });
      void queryClient.invalidateQueries({ queryKey: groupKeys.all });
    },
  });
}
