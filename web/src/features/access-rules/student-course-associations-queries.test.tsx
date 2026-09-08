// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { accessRulesQueryKeys } from './access-rules-queries'
import {
  studentCourseAssociationsQueryKeys,
  studentCourseAssociationsQueryOptions,
  useCreateStudentCourseAssociationMutation,
  useDeleteStudentCourseAssociationMutation,
  useUpdateStudentCourseAssociationMutation,
} from './student-course-associations-queries'
import { studentCatalogKeys } from '../student-catalog/student-catalog-queries'

const association = {
  id: 7,
  title: 'Metrologia',
  description: 'Fundamentos',
  status: 'DRAFT' as const,
  permission: 'READ' as const,
  createdAt: '2026-09-04T12:00:00.000Z',
  updatedAt: null,
}

function createHarness() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }

  return { queryClient, wrapper: Wrapper }
}

function primeAssociatedCaches(queryClient: QueryClient, userId: number, courseId: number) {
  const target = { userId, resource: { type: 'COURSE' as const, id: courseId } }
  queryClient.setQueryData(studentCourseAssociationsQueryKeys.list(userId), [association])
  queryClient.setQueryData(accessRulesQueryKeys.direct(target), [])
  queryClient.setQueryData(accessRulesQueryKeys.effective(target), {})
  queryClient.setQueryData(studentCatalogKeys.courses(), [])
  queryClient.setQueryData(studentCatalogKeys.detail(courseId), {})
}

describe('student course association queries', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('uses a stable, student-scoped association list key', () => {
    expect(studentCourseAssociationsQueryKeys.all).toEqual([
      'student-course-associations',
    ])
    expect(studentCourseAssociationsQueryOptions(12).queryKey).toEqual([
      'student-course-associations',
      'list',
      12,
    ])
  })

  it('invalidates association, direct access, and catalog data after setting permission', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test/api/v1')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ data: association })))
    const { queryClient, wrapper } = createHarness()
    primeAssociatedCaches(queryClient, 12, 7)
    const { result } = renderHook(() => useUpdateStudentCourseAssociationMutation(), {
      wrapper,
    })

    await act(async () => {
      await result.current.mutateAsync({
        userId: 12, courseId: 7, permission: 'READ',
        period: { startsAt: '2026-09-08T03:00:00.000Z', expiresAt: '2027-09-09T02:59:59.999Z' },
      })
    })

    expect(
      queryClient.getQueryState(studentCourseAssociationsQueryKeys.list(12))?.isInvalidated,
    ).toBe(true)
    expect(
      queryClient.getQueryState(
        accessRulesQueryKeys.direct({ userId: 12, resource: { type: 'COURSE', id: 7 } }),
      )?.isInvalidated,
    ).toBe(true)
    expect(
      queryClient.getQueryState(studentCatalogKeys.courses())?.isInvalidated,
    ).toBe(true)
  })

  it('invalidates the associated data after explicitly creating an association', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test/api/v1')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ data: association })))
    const { queryClient, wrapper } = createHarness()
    primeAssociatedCaches(queryClient, 12, 7)
    const { result } = renderHook(() => useCreateStudentCourseAssociationMutation(), {
      wrapper,
    })

    await act(async () => {
      await result.current.mutateAsync({
        userId: 12, courseId: 7, permission: 'READ',
        period: { startsAt: '2026-09-08T03:00:00.000Z', expiresAt: '2027-09-09T02:59:59.999Z' },
      })
    })

    expect(
      queryClient.getQueryState(studentCourseAssociationsQueryKeys.list(12))?.isInvalidated,
    ).toBe(true)
    expect(
      queryClient.getQueryState(studentCatalogKeys.courses())?.isInvalidated,
    ).toBe(true)
  })

  it('invalidates the same associated data after removal', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test/api/v1')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })))
    const { queryClient, wrapper } = createHarness()
    primeAssociatedCaches(queryClient, 12, 7)
    const { result } = renderHook(() => useDeleteStudentCourseAssociationMutation(), {
      wrapper,
    })

    await act(async () => {
      await result.current.mutateAsync({ userId: 12, courseId: 7 })
    })

    expect(
      queryClient.getQueryState(studentCourseAssociationsQueryKeys.list(12))?.isInvalidated,
    ).toBe(true)
    expect(
      queryClient.getQueryState(
        accessRulesQueryKeys.effective({ userId: 12, resource: { type: 'COURSE', id: 7 } }),
      )?.isInvalidated,
    ).toBe(true)
    expect(
      queryClient.getQueryState(studentCatalogKeys.detail(7))?.isInvalidated,
    ).toBe(true)
  })
})
