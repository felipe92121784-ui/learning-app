import type { QueryClient } from '@tanstack/react-query'
import { studentCatalogKeys } from './student-catalog-queries'

export function clearStudentCatalog(queryClient: QueryClient): void {
  const filters = { queryKey: studentCatalogKeys.all }

  for (const query of queryClient.getQueryCache().findAll(filters)) {
    // Reset first so mounted observers synchronously lose the previous identity's
    // data. Removing alone can leave their last successful result renderable.
    query.reset()
  }
  queryClient.removeQueries(filters)
}
