// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  useCreateUserMutation,
  useUpdateUserStatusMutation,
  useUsersQuery,
  usersQueryKeys,
} from './users-queries'

const student = {
  id: 7,
  fullName: 'Ada Student',
  email: 'ada@example.test',
  role: 'STUDENT' as const,
  status: 'ACTIVE' as const,
  initials: 'AS',
  createdAt: '2026-09-03T12:00:00.000Z',
  updatedAt: '2026-09-03T12:00:00.000Z',
}

function createHarness() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    )
  }

  return { queryClient, wrapper: Wrapper }
}

describe('users query hooks', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('loads the administrative user list into the shared query cache', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test/api/v1')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ data: [student] })),
    )
    const { queryClient, wrapper } = createHarness()

    const { result } = renderHook(() => useUsersQuery(), { wrapper })

    await waitFor(() => expect(result.current.data).toEqual([student]))
    expect(queryClient.getQueryData(usersQueryKeys.list())).toEqual([student])
  })

  it('adds a newly created student to cache before invalidating the list', async () => {
    const createdStudent = {
      ...student,
      id: 8,
      fullName: 'New Student',
      email: 'new.student@example.test',
    }
    vi.stubEnv('VITE_API_URL', 'https://api.example.test/api/v1')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ data: createdStudent })),
    )
    const { queryClient, wrapper } = createHarness()
    queryClient.setQueryData(usersQueryKeys.list(), [student])
    const { result } = renderHook(() => useCreateUserMutation(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        fullName: 'New Student',
        email: 'new.student@example.test',
        password: 'initial-password-123',
      })
    })

    expect(queryClient.getQueryData(usersQueryKeys.list())).toEqual([
      student,
      createdStudent,
    ])
    expect(queryClient.getQueryData(usersQueryKeys.detail(8))).toEqual(
      createdStudent,
    )
    expect(queryClient.getQueryState(usersQueryKeys.list())?.isInvalidated).toBe(
      true,
    )
  })

  it('reflects a status action in cached list and detail, then invalidates both', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test/api/v1')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({ data: { ...student, status: 'BLOCKED' } }),
      ),
    )
    const { queryClient, wrapper } = createHarness()
    queryClient.setQueryData(usersQueryKeys.list(), [student])
    queryClient.setQueryData(usersQueryKeys.detail(student.id), student)
    const { result } = renderHook(() => useUpdateUserStatusMutation(), {
      wrapper,
    })

    await act(async () => {
      await result.current.mutateAsync({
        userId: student.id,
        status: 'BLOCKED',
      })
    })

    expect(queryClient.getQueryData(usersQueryKeys.list())).toEqual([
      { ...student, status: 'BLOCKED' },
    ])
    expect(queryClient.getQueryData(usersQueryKeys.detail(student.id))).toEqual(
      { ...student, status: 'BLOCKED' },
    )
    expect(queryClient.getQueryState(usersQueryKeys.list())?.isInvalidated).toBe(
      true,
    )
    expect(
      queryClient.getQueryState(usersQueryKeys.detail(student.id))
        ?.isInvalidated,
    ).toBe(true)
  })
})
