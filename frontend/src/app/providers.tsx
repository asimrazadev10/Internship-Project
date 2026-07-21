"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

import { AuthProvider } from "@/lib/auth/auth-context";

/**
 * App-wide client providers. Marked "use client" because TanStack Query keeps cache state in
 * React context, which only exists on the client.
 *
 * The QueryClient is created inside useState (not at module scope) so each browser session gets
 * its own instance. A module-level client would be shared across requests during SSR and could
 * leak one user's cached data into another's render.
 *
 * Defaults are set here rather than per-query: a 10s staleness window matches the Phase 2 polling
 * cadence, and one retry avoids hammering the API on a hard failure.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 10_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}
