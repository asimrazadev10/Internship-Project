"use client";

import { useState } from "react";

import { INPUT_CLASS, PRIMARY_BUTTON_CLASS } from "@/components/ui/styles";
import { GROUP_NAME_MAX_LENGTH } from "@/lib/api-limits";
import { getApiErrorMessage } from "@/lib/api/error";
import { useCreateGroup, useJoinGroup } from "@/lib/queries/groups";

/**
 * The two ways into a group: start one, or join one with its id.
 *
 * One file, two components. They are structurally the same — a single string of state, a mutation
 * hook, an identical empty-submit guard and an identical error tail — and they are only ever
 * rendered as an adjacent pair inside the same bordered section on the home page.
 *
 * They are deliberately NOT parameterised into one component. The differences are not props: the
 * join input is monospace (it holds a UUID) with a sans-serif placeholder, the join button is
 * outlined rather than brand-filled because joining is the secondary action, and their labels,
 * pending text and error semantics all differ. A single component would carry a `variant` prop
 * that exists only to switch every one of those — more indirection than the duplication it
 * removes. Sharing a file gets the win that was actually available: one import header instead of
 * two nearly identical ones.
 */

export function CreateGroupForm() {
  const [name, setName] = useState("");
  const createGroup = useCreateGroup();

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = name.trim();
        if (!trimmed) return;
        createGroup.mutate(trimmed, { onSuccess: () => setName("") });
      }}
    >
      <div className="flex gap-2">
        <input
          aria-label="New group name"
          placeholder="Name a new group…"
          maxLength={GROUP_NAME_MAX_LENGTH}
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={createGroup.isPending}
          className={`${INPUT_CLASS} flex-1`}
        />
        <button
          type="submit"
          disabled={createGroup.isPending || !name.trim()}
          className={`${PRIMARY_BUTTON_CLASS} shrink-0 px-4 py-2.5`}
        >
          {createGroup.isPending ? "Creating…" : "Create"}
        </button>
      </div>
      {createGroup.isError && (
        <p role="alert" className="text-sm text-brand-strong">
          {getApiErrorMessage(createGroup.error)}
        </p>
      )}
    </form>
  );
}

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
