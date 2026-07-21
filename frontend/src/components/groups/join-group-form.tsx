"use client";

import { useState } from "react";

import { getApiErrorMessage } from "@/lib/api/error";
import { useJoinGroup } from "@/lib/queries/groups";

/**
 * Join a group by pasting its id. Open-join model: any authenticated user holding a group's
 * (unguessable) id may join, so the id is effectively the invite. Backend returns 409 if already
 * a member and 404 if the id doesn't exist — both surfaced here.
 */
export function JoinGroupForm() {
  const [groupId, setGroupId] = useState("");
  const joinGroup = useJoinGroup();

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = groupId.trim();
        if (!trimmed) return;
        joinGroup.mutate(trimmed, { onSuccess: () => setGroupId("") });
      }}
    >
      <div className="flex gap-2">
        <input
          aria-label="Group id to join"
          placeholder="Paste a group id to join"
          value={groupId}
          onChange={(e) => setGroupId(e.target.value)}
          disabled={joinGroup.isPending}
          className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:ring-zinc-800"
        />
        <button
          type="submit"
          disabled={joinGroup.isPending || !groupId.trim()}
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          {joinGroup.isPending ? "Joining…" : "Join"}
        </button>
      </div>
      {joinGroup.isError && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {getApiErrorMessage(joinGroup.error)}
        </p>
      )}
    </form>
  );
}
