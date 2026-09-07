import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api-client'
import { getStudentCourse, listStudentCourses } from './student-catalog-api'
import type { StudentCourseDetail, StudentCourseSummary } from './student-catalog-types'

const summary = {
  id: 14,
  title: 'Fundamentos seguros',
  description: 'Conteúdo permitido para a aluna.',
  moduleCount: 1,
} satisfies StudentCourseSummary

const detail = {
  ...summary,
  modules: [
    {
      id: 21,
      title: 'Primeiro módulo',
      description: null,
      availability: 'AVAILABLE',
      materials: [
        {
          id: 42,
          title: 'Manual liberado',
          description: null,
          type: 'PDF',
          availability: 'AVAILABLE',
        },
        {
          id: 43,
          title: 'Exercício em processamento',
          description: null,
          type: 'IMAGE',
          availability: 'UNAVAILABLE',
          unavailableReason: 'PROCESSING',
        },
      ],
    },
  ],
} satisfies StudentCourseDetail

function useApiResponse(body?: unknown, status = 200) {
  vi.stubEnv('VITE_API_URL', 'https://api.example.test/api/v1')
  const response = status === 204
    ? new Response(null, { status })
    : Response.json(body, { status })
  const fetchMock = vi.fn().mockResolvedValue(response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('student catalog API', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('unwraps only the student course list endpoint', async () => {
    const fetchMock = useApiResponse({ data: [summary] })

    await expect(listStudentCourses()).resolves.toEqual([summary])
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://api.example.test/api/v1/student/courses',
    )
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBeUndefined()
  })

  it('gets a course hierarchy from its student detail endpoint', async () => {
    const fetchMock = useApiResponse({ data: detail })

    await expect(getStudentCourse(14)).resolves.toEqual(detail)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://api.example.test/api/v1/student/courses/14',
    )
  })

  it('rejects a successful response that has no catalog envelope data', async () => {
    useApiResponse(undefined, 204)

    await expect(listStudentCourses()).rejects.toThrow(
      'Student catalog API returned no data',
    )
  })

  it('preserves an opaque API error without turning it into an access decision', async () => {
    useApiResponse({ message: 'Course not found' }, 404)

    const request = getStudentCourse(14)

    await expect(request).rejects.toBeInstanceOf(ApiError)
    await expect(request).rejects.toMatchObject({ status: 404 })
  })

  it('keeps delivery and storage capabilities outside the catalog contract', () => {
    const serialized = JSON.stringify(detail)

    expect(serialized).not.toMatch(/storage|download|contentUrl|derivative/i)
  })
})
