import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  deleteStudentCourseAssociation,
  listStudentCourseAssociations,
  updateStudentCourseAssociation,
} from './student-course-associations-api'
import type { StudentCourseAssociation } from './student-course-associations-types'

const association = {
  id: 7,
  title: 'Metrologia',
  description: 'Fundamentos',
  status: 'DRAFT',
  permission: 'READ',
  createdAt: '2026-09-04T12:00:00.000Z',
  updatedAt: null,
} satisfies StudentCourseAssociation

function useApiResponse(body?: unknown, status = 200) {
  vi.stubEnv('VITE_API_URL', 'https://api.example.test/api/v1')
  const response = status === 204
    ? new Response(null, { status })
    : Response.json(body, { status })
  const fetchMock = vi.fn().mockResolvedValue(response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('student course associations API', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('unwraps the selected student\'s direct course associations', async () => {
    const fetchMock = useApiResponse({ data: [association] })

    await expect(listStudentCourseAssociations(12)).resolves.toEqual([association])
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://api.example.test/api/v1/users/12/courses',
    )
  })

  it('puts the selected direct course permission and unwraps the association', async () => {
    const fetchMock = useApiResponse({ data: { ...association, permission: 'FULL' } })

    await expect(
      updateStudentCourseAssociation(12, 7, 'FULL'),
    ).resolves.toEqual({ ...association, permission: 'FULL' })

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://api.example.test/api/v1/users/12/courses/7',
    )
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'PUT',
      body: JSON.stringify({ permission: 'FULL' }),
    })
  })

  it('deletes the selected student course association', async () => {
    const fetchMock = useApiResponse(undefined, 204)

    await expect(deleteStudentCourseAssociation(12, 7)).resolves.toBeUndefined()
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://api.example.test/api/v1/users/12/courses/7',
    )
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'DELETE' })
  })
})
