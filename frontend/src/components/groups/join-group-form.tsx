"use client";

import { useState } from "react";

import { INPUT_CLASS } from "@/components/ui/styles";
import { getApiErrorMessage } from "@/lib/api/error";
import { useJoinGroup } from "@/lib/queries/groups";

/**
 * Join a group by pasting its id. Open-join: anyone with a group's (unguessable) id can join, so
 * the id is effectively the invite. 409 if already a member, 404 if it doesn't exist.
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
          placeholder="Paste an invite id to join…"
          value={groupId}
          onChange={(e) => setGroupId(e.target.value)}
          disabled={joinGroup.isPending}
          className={`${INPUT_CLASS} flex-1 font-mono placeholder:font-sans`}
        />
        <button
          type="submit"
          disabled={joinGroup.isPending || !groupId.trim()}
          className="shrink-0 rounded-xl border border-line-strong px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {joinGroup.isPending ? "Joining…" : "Join"}
        </button>
      </div>
      {joinGroup.isError && (
        <p role="alert" className="text-sm text-brand-strong">
          {getApiErrorMessage(joinGroup.error)}
        </p>
      )}
    </form>
  );
}
