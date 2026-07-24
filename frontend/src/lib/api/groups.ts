import { api } from "./client";
import type { ApiSuccess, GroupDetail, GroupSummary } from "./types";

/** Groups the current user belongs to. */
export async function listMyGroups(): Promise<GroupSummary[]> {
  const { data } = await api.get<ApiSuccess<GroupSummary[]>>("/groups");
  return data.data;
}

/** Create a group; the caller becomes its OWNER. */
export async function createGroup(name: string): Promise<GroupSummary> {
  const { data } = await api.post<ApiSuccess<GroupSummary>>("/groups", { name });
  return data.data;
}

/** One group's detail with members. Requires membership (backend enforces via guard). */
export async function getGroup(groupId: string): Promise<GroupDetail> {
  const { data } = await api.get<ApiSuccess<GroupDetail>>(`/groups/${groupId}`);
  return data.data;
}

/** Join a group by id. */
export async function joinGroup(groupId: string): Promise<GroupSummary> {
  const { data } = await api.post<ApiSuccess<GroupSummary>>(
    `/groups/${groupId}/join`,
  );
  return data.data;
}

/** Mark the group read up to now (for read receipts). Returns the new lastReadAt. */
export async function markRead(
  groupId: string,
): Promise<{ lastReadAt: string }> {
  const { data } = await api.post<ApiSuccess<{ lastReadAt: string }>>(
    `/groups/${groupId}/read`,
  );
  return data.data;
}
