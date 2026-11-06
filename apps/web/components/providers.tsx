"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useState } from "react";
import type { ReactNode } from "react";

import { SentryUser } from "~/components/sentry-user";

const STALE_TIME_MS = 60_000;

export const Providers = ({ children }: { children: ReactNode }) => {
  const [queryClient, setQueryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: STALE_TIME_MS } },
      })
  );

  void setQueryClient;

  return (
    <QueryClientProvider client={queryClient}>
      <SentryUser />
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
};
