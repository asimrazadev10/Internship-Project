"use client";

import { useState } from "react";

import { getApiErrorMessage } from "@/lib/api/error";
import { useCreateGroup } from "@/lib/queries/groups";

/** Inline "create a group" form. On success the hook refetches the list, so the group appears. */
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
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={createGroup.isPending}
          className="flex-1 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm outline-none transition placeholder:text-muted/70 focus:border-brand focus:ring-2 focus:ring-brand/25 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={createGroup.isPending || !name.trim()}
          className="shrink-0 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-on-brand transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60"
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
