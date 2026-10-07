import { QueryClient } from '@tanstack/react-query';
import { ApiClientError } from '@/lib/api-client';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        // 4xx answers (403, 404, validation) won't change on retry; only retry transient failures.
        retry: (failureCount, error) =>
          !(error instanceof ApiClientError && error.status < 500) && failureCount < 2,
      },
    },
  });
}
