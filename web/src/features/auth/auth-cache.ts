import type { QueryClient } from '@tanstack/react-query'
import { profileQueryKey } from './auth-api'
import type { AuthUser } from './auth-types'
import { clearProtectedMaterialViews } from '../protected-viewer/protected-viewer-cache'
import { clearStudentCatalog } from '../student-catalog/student-catalog-cache'

export async function cacheLoggedInUser(
  queryClient: QueryClient,
  user: AuthUser,
): Promise<void> {
  const cancelledProfile = queryClient.cancelQueries({ queryKey: profileQueryKey })
  clearProtectedMaterialViews(queryClient)
  clearStudentCatalog(queryClient)
  await cancelledProfile
  queryClient.setQueryData(profileQueryKey, user)
  await queryClient.invalidateQueries({ queryKey: profileQueryKey })
}

export async function clearAuthenticatedUser(
  queryClient: QueryClient,
): Promise<void> {
  const cancelledProfile = queryClient.cancelQueries({ queryKey: profileQueryKey })
  clearProtectedMaterialViews(queryClient)
  clearStudentCatalog(queryClient)
  await cancelledProfile
  queryClient.setQueryData(profileQueryKey, null)
  await queryClient.invalidateQueries({ queryKey: profileQueryKey })
}
