import type { QueryClient } from '@tanstack/react-query'

export const protectedMaterialViewQueryKey = ['protected-material-view'] as const

export function clearProtectedMaterialViews(queryClient: QueryClient): void {
  const filters = { queryKey: protectedMaterialViewQueryKey }
  for (const query of queryClient.getQueryCache().findAll(filters)) {
    // Reset cancels the old request and clears live observers synchronously. Removal
    // alone would leave their last successful manifest renderable after logout.
    query.reset()
  }
  queryClient.removeQueries(filters)
}
