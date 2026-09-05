import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { profileQueryKey } from './auth-api'
import { cacheLoggedInUser, clearAuthenticatedUser } from './auth-cache'
import type { AuthUser } from './auth-types'

const student: AuthUser = {
  id: 7,
  fullName: 'Ada Student',
  email: 'ada@example.test',
  role: 'STUDENT',
  status: 'ACTIVE',
}

describe('authentication cache updates', () => {
  it('stores the login response and invalidates the profile query', async () => {
    const queryClient = new QueryClient()

    await cacheLoggedInUser(queryClient, student)

    expect(queryClient.getQueryData(profileQueryKey)).toEqual(student)
    expect(queryClient.getQueryState(profileQueryKey)?.isInvalidated).toBe(true)
  })

  it('clears the user and invalidates the profile query after logout', async () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(profileQueryKey, student)

    await clearAuthenticatedUser(queryClient)

    expect(queryClient.getQueryData(profileQueryKey)).toBeNull()
    expect(queryClient.getQueryState(profileQueryKey)?.isInvalidated).toBe(true)
  })
})
