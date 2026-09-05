import type { QueryClient } from '@tanstack/react-query'
import { profileQueryKey } from './auth-api'
import type { AuthUser } from './auth-types'

export async function cacheLoggedInUser(
  queryClient: QueryClient,
  user: AuthUser,
): Promise<void> {
  queryClient.setQueryData(profileQueryKey, user)
  await queryClient.invalidateQueries({ queryKey: profileQueryKey })
}

export async function clearAuthenticatedUser(
  queryClient: QueryClient,
): Promise<void> {
  queryClient.setQueryData(profileQueryKey, null)
  await queryClient.invalidateQueries({ queryKey: profileQueryKey })
}
