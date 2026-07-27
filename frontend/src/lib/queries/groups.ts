"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as groupsApi from "@/lib/api/groups";

/**
 * TanStack Query hooks for groups — the server-state layer.
 *
 * Query keys are centralised so reads and the invalidations after a mutation always agree on the
 * same key. A typo'd key would silently fail to refetch, so this is the one source of truth.
 */
/**
 * Note the shape: `all` is a PREFIX of `detail(id)`. TanStack matches by prefix, so an
 * invalidation of `all` without `exact` also invalidates every cached group detail — which is why
 * both mutations below pass `exact: true`. They only need the list to refetch; sweeping the
 * details as well would discard state that is already correct, including the member list
 * SocketProvider patches in place on `member_joined` (it passes `exact: true` for that same
 * reason). Use `groupKeys.detail(id)` to target one group deliberately.
 */
export const groupKeys = {
  all: ["groups"] as const,
  detail: (id: string) => ["groups", id] as const,
};

/** The current user's groups. */
export function useGroups() {
  return useQuery({
    queryKey: groupKeys.all,
    queryFn: groupsApi.listMyGroups,
  });
}

/** One group's detail. Disabled until an id is present so it doesn't fire with an empty key. */
export function useGroup(id: string) {
  return useQuery({
    queryKey: groupKeys.detail(id),
    queryFn: () => groupsApi.getGroup(id),
    enabled: Boolean(id),
  });
}

/** Create a group, then refetch the list so the new group appears. */
export function useCreateGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => groupsApi.createGroup(name),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: groupKeys.all, exact: true }),
  });
}

/** Join a group by id, then refetch the list so the joined group appears. */
export function useJoinGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => groupsApi.joinGroup(id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: groupKeys.all, exact: true }),
  });
}
