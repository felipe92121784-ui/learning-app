// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  courseQueryOptions,
  coursesQueryKeys,
  useCreateCourseMutation,
  useCreateModuleMutation,
  useDeleteModuleMutation,
  useReorderModulesMutation,
  useUpdateCourseMutation,
  useUpdateModuleMutation,
} from './courses-queries'

const firstModule = {
  id: 11,
  courseId: 7,
  title: 'Fundamentos',
  description: 'Introdução',
  position: 0,
  createdAt: '2026-09-04T12:00:00.000Z',
  updatedAt: '2026-09-04T12:00:00.000Z',
}

const course = {
  id: 7,
  title: 'Metrologia',
  description: 'Fundamentos',
  status: 'DRAFT' as const,
  createdAt: '2026-09-04T12:00:00.000Z',
  updatedAt: '2026-09-04T12:00:00.000Z',
  modules: [firstModule],
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
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
  }

  return { queryClient, wrapper: Wrapper }
}

function useApiResponse(body?: unknown, status = 200) {
  vi.stubEnv('VITE_API_URL', 'https://api.example.test/api/v1')
  const response = status === 204
    ? new Response(null, { status })
    : Response.json(body, { status })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
}

describe('courses query mutations', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('exposes stable course list and detail keys', () => {
    expect(coursesQueryKeys.all).toEqual(['courses'])
    expect(coursesQueryKeys.list()).toEqual(['courses', 'list'])
    expect(courseQueryOptions(7).queryKey).toEqual(['courses', 'detail', 7])
  })

  it('adds a created course before older list entries and stores its detail', async () => {
    const createdCourse = { ...course, id: 8, title: 'Novo curso' }
    useApiResponse({ data: createdCourse })
    const { queryClient, wrapper } = createHarness()
    queryClient.setQueryData(coursesQueryKeys.list(), [course])
    const { result } = renderHook(() => useCreateCourseMutation(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ title: 'Novo curso' })
    })

    expect(queryClient.getQueryData(coursesQueryKeys.list())).toEqual([
      createdCourse,
      course,
    ])
    expect(queryClient.getQueryData(coursesQueryKeys.detail(8))).toEqual(
      createdCourse,
    )
    expect(queryClient.getQueryState(coursesQueryKeys.list())?.isInvalidated).toBe(
      true,
    )
  })

  it('preserves cached detail modules when a course update returns summary fields only', async () => {
    const publishedCourse = {
      id: course.id,
      title: course.title,
      description: course.description,
      status: 'PUBLISHED',
      createdAt: course.createdAt,
      updatedAt: course.updatedAt,
    }
    useApiResponse({ data: publishedCourse })
    const { queryClient, wrapper } = createHarness()
    queryClient.setQueryData(coursesQueryKeys.list(), [course])
    queryClient.setQueryData(coursesQueryKeys.detail(7), course)
    const { result } = renderHook(() => useUpdateCourseMutation(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        courseId: 7,
        input: { title: 'Metrologia', status: 'PUBLISHED' },
      })
    })

    expect(queryClient.getQueryData(coursesQueryKeys.list())).toEqual([
      publishedCourse,
    ])
    expect(queryClient.getQueryData(coursesQueryKeys.detail(7))).toEqual({
      ...course,
      status: 'PUBLISHED',
    })
    expect(queryClient.getQueryState(coursesQueryKeys.list())?.isInvalidated).toBe(
      true,
    )
    expect(
      queryClient.getQueryState(coursesQueryKeys.detail(7))?.isInvalidated,
    ).toBe(true)
  })

  it('refreshes the course detail and list when module mutations succeed', async () => {
    useApiResponse({ data: { ...firstModule, title: 'Atualizado' } })
    const { queryClient, wrapper } = createHarness()
    queryClient.setQueryData(coursesQueryKeys.list(), [course])
    queryClient.setQueryData(coursesQueryKeys.detail(7), course)
    const { result } = renderHook(() => useUpdateModuleMutation(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        courseId: 7,
        moduleId: 11,
        input: { title: 'Atualizado' },
      })
    })

    expect(queryClient.getQueryState(coursesQueryKeys.list())?.isInvalidated).toBe(
      true,
    )
    expect(
      queryClient.getQueryState(coursesQueryKeys.detail(7))?.isInvalidated,
    ).toBe(true)
  })

  it('refreshes the affected course after module creation and deletion', async () => {
    useApiResponse({ data: { ...firstModule, id: 12 } })
    const createdHarness = createHarness()
    createdHarness.queryClient.setQueryData(coursesQueryKeys.list(), [course])
    createdHarness.queryClient.setQueryData(coursesQueryKeys.detail(7), course)
    const created = renderHook(() => useCreateModuleMutation(), {
      wrapper: createdHarness.wrapper,
    })

    await act(async () => {
      await created.result.current.mutateAsync({
        courseId: 7,
        input: { title: 'Segundo módulo' },
      })
    })
    expect(
      createdHarness.queryClient.getQueryState(coursesQueryKeys.detail(7))
        ?.isInvalidated,
    ).toBe(true)

    useApiResponse(undefined, 204)
    const deletedHarness = createHarness()
    deletedHarness.queryClient.setQueryData(coursesQueryKeys.list(), [course])
    deletedHarness.queryClient.setQueryData(coursesQueryKeys.detail(7), course)
    const deleted = renderHook(() => useDeleteModuleMutation(), {
      wrapper: deletedHarness.wrapper,
    })

    await act(async () => {
      await deleted.result.current.mutateAsync({ courseId: 7, moduleId: 12 })
    })
    expect(
      deletedHarness.queryClient.getQueryState(coursesQueryKeys.detail(7))
        ?.isInvalidated,
    ).toBe(true)
  })

  it('stores a reordered course detail before refreshing course queries', async () => {
    const reordered = {
      ...course,
      modules: [{ ...firstModule, position: 0 }],
    }
    useApiResponse({ data: reordered })
    const { queryClient, wrapper } = createHarness()
    queryClient.setQueryData(coursesQueryKeys.list(), [course])
    const { result } = renderHook(() => useReorderModulesMutation(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ courseId: 7, moduleIds: [11] })
    })

    expect(queryClient.getQueryData(coursesQueryKeys.detail(7))).toEqual(reordered)
    expect(queryClient.getQueryState(coursesQueryKeys.list())?.isInvalidated).toBe(
      true,
    )
  })
})
