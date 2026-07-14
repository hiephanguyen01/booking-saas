import { isServer, QueryClient } from '@tanstack/react-query';

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: isServer ? 0 : 1,
        refetchOnWindowFocus: false,
      },
      mutations: { retry: 0 },
      dehydrate: {
        shouldDehydrateQuery: (query) =>
          query.state.status === 'success' && query.meta?.dehydrate !== false,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

export function getQueryClient(): QueryClient {
  if (isServer) return makeQueryClient();
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}
