"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as groupsApi from "@/lib/api/groups";

/**
 * TanStack Query hooks for groups — the server-state layer.
 *
 * Query keys are centralised so reads and the invalidations after a mutation always agree on the
 * same key. A typo'd key would silently fail to refetch, so this is the one source of truth.
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: groupKeys.all }),
  });
}

/** Join a group by id, then refetch the list so the joined group appears. */
export function useJoinGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => groupsApi.joinGroup(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: groupKeys.all }),
  });
}
