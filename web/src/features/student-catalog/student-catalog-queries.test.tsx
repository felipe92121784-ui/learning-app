// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  studentCatalogKeys,
  studentCourseQueryOptions,
  studentCoursesQueryOptions,
  useStudentCourseQuery,
  useStudentCoursesQuery,
} from './student-catalog-queries'

const summary = {
  id: 14,
  title: 'Fundamentos seguros',
  description: null,
  moduleCount: 0,
}

const detail = { ...summary, modules: [] }

function createHarness() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
  }

  return { queryClient, wrapper: Wrapper }
}

describe('student catalog queries', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('uses stable list and detail keys under one removable namespace', () => {
    expect(studentCatalogKeys.all).toEqual(['student-catalog'])
    expect(studentCatalogKeys.courses()).toEqual(['student-catalog', 'courses'])
    expect(studentCoursesQueryOptions().queryKey).toEqual([
      'student-catalog',
      'courses',
    ])
    expect(studentCourseQueryOptions(14).queryKey).toEqual([
      'student-catalog',
      'courses',
      14,
    ])
  })

  it('loads list and detail through the public query hooks', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test/api/v1')
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ data: [summary] }))
      .mockResolvedValueOnce(Response.json({ data: detail }))
    vi.stubGlobal('fetch', fetchMock)
    const listHarness = createHarness()
    const list = renderHook(() => useStudentCoursesQuery(), {
      wrapper: listHarness.wrapper,
    })

    await waitFor(() => expect(list.result.current.data).toEqual([summary]))

    const detailHarness = createHarness()
    const selected = renderHook(() => useStudentCourseQuery(14), {
      wrapper: detailHarness.wrapper,
    })

    await waitFor(() => expect(selected.result.current.data).toEqual(detail))
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([
      'https://api.example.test/api/v1/student/courses',
      'https://api.example.test/api/v1/student/courses/14',
    ])
  })
})
