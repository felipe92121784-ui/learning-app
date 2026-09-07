import { queryOptions } from '@tanstack/react-query'
import { ApiError, apiClient } from '@/lib/api-client'
import type { AuthUser, LoginCredentials } from './auth-types'
import { clearProtectedMaterialViews } from '../protected-viewer/protected-viewer-cache'
import { clearStudentCatalog } from '../student-catalog/student-catalog-cache'

interface ApiEnvelope<T> {
  data: T
}

interface UserPayload {
  user: AuthUser
}

export const profileQueryKey = ['auth', 'profile'] as const

export async function getProfile(): Promise<AuthUser | null> {
  try {
    const response = await apiClient<ApiEnvelope<UserPayload>>(
      '/account/profile',
    )
    return response?.data.user ?? null
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return null
    }

    throw error
  }
}

export async function login(credentials: LoginCredentials): Promise<AuthUser> {
  const response = await apiClient<ApiEnvelope<UserPayload>>('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  })

  if (!response) {
    throw new Error('Login returned no user')
  }

  return response.data.user
}

export async function logout(): Promise<void> {
  await apiClient('/account/logout', { method: 'POST' })
}

export function profileQueryOptions() {
  return queryOptions({
    queryKey: profileQueryKey,
    queryFn: async ({ client }) => {
      const user = await getProfile()
      const previous = client.getQueryData<AuthUser | null>(profileQueryKey)
      // Profile refresh also detects expiration or a session changed in another tab.
      // Clear protected data before publishing the new identity to AuthProvider.
      if (
        !user ||
        previous?.id !== user.id ||
        previous.status !== user.status ||
        user.status !== 'ACTIVE'
      ) {
        clearProtectedMaterialViews(client)
        clearStudentCatalog(client)
      }
      return user
    },
    retry: false,
    staleTime: 30_000,
  })
}
