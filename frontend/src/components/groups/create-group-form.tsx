"use client";

import { useState } from "react";

import { getApiErrorMessage } from "@/lib/api/error";
import { useCreateGroup } from "@/lib/queries/groups";

/**
 * Inline "create a group" form. On success the create hook invalidates the groups list, so the
 * new group appears without any manual list update here.
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
          placeholder="New group name"
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={createGroup.isPending}
          className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:ring-zinc-800"
        />
        <button
          type="submit"
          disabled={createGroup.isPending || !name.trim()}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {createGroup.isPending ? "Creating…" : "Create"}
        </button>
      </div>
      {createGroup.isError && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {getApiErrorMessage(createGroup.error)}
        </p>
      )}
    </form>
  );
}
