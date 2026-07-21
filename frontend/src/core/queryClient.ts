import { MutationCache, QueryClient } from '@tanstack/react-query'
import type { QueryClientConfig } from '@tanstack/react-query'
import { toast } from './toast'

/**
 * The app's QueryClient. A cache-level mutation onError surfaces a toast whenever
 * ANY mutation fails — the per-mutation handlers still roll their optimistic
 * update back, this just makes sure a failed save never fails silently (so a
 * task the user "checked off" can't quietly revert with no explanation).
 */
export function createQueryClient(config: QueryClientConfig = {}): QueryClient {
  return new QueryClient({
    mutationCache: new MutationCache({
      onError: () => toast("couldn't save your change — please try again"),
    }),
    ...config,
  })
}
