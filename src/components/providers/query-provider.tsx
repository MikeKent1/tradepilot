'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { isRetryableError } from '@/lib/errors';

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 min
            gcTime: 5 * 60 * 1000, // 5 min (formerly cacheTime)
            refetchOnWindowFocus: false,
            retry: (failureCount, error) => {
              // Retry up to 2 times for retryable errors (network, server, rate-limit)
              if (failureCount >= 2) return false;
              return isRetryableError(error);
            },
          },
          mutations: {
            retry: false, // Don't auto-retry mutations
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}