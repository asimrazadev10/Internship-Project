"use client";

import { useState } from "react";

import { INPUT_CLASS, PRIMARY_BUTTON_CLASS } from "@/components/ui/styles";
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
