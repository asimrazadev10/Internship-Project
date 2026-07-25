"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { NoMatchesMark } from "@/components/ui/illustrations";
import { searchMessages } from "@/lib/api/messages";

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** A search box that shows matching messages in a dropdown once the query is at least 2 chars. */
export function MessageSearch({ groupId }: { groupId: string }) {
  const [q, setQ] = useState("");
  const debounced = useDebounced(q.trim(), 300);
  const active = debounced.length >= 2;

  const { data: results = [], isFetching } = useQuery({
    queryKey: ["messages", groupId, "search", debounced],
    queryFn: () => searchMessages(groupId, debounced),
    enabled: active,
  });

  return (
    <div className="relative">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search messages…"
        aria-label="Search messages"
        className="w-full rounded-full border border-line bg-surface px-4 py-1.5 text-sm text-ink outline-none placeholder:text-muted/70 focus:border-brand focus:ring-2 focus:ring-brand/25"
      />
      {active && (
        <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-lg">
          {isFetching && results.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted">Searching…</p>
          ) : results.length === 0 ? (
            <div className="flex items-center gap-2.5 px-3 py-2">
              <NoMatchesMark />
              <p className="text-sm text-muted">No matches for “{debounced}”.</p>
            </div>
          ) : (
            <ul className="flex flex-col">
              {results.map((m) => (
                <li key={m.id} className="rounded-lg px-3 py-2 hover:bg-surface-2">
                  <div className="flex items-baseline justify-between gap-2 font-mono text-[11px] text-muted">
                    <span className="uppercase tracking-wide">
                      {m.sender?.name ?? "Someone"}
                    </span>
                    <span>{formatWhen(m.createdAt)}</span>
                  </div>
                  <p className="truncate text-sm text-ink">{m.content}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
