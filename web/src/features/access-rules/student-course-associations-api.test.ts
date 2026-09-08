import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createStudentCourseAssociation,
  deleteStudentCourseAssociation,
  listStudentCourseAssociations,
  updateStudentCourseAssociation,
} from './student-course-associations-api'
import type { StudentCourseAssociation } from './student-course-associations-types'

const association = {
  id: 7,
  title: 'Metrologia',
  description: 'Fundamentos',
  status: 'ACTIVE',
  permission: 'READ',
  startsAt: '2026-09-08T03:00:00.000Z',
  expiresAt: '2027-09-09T02:59:59.999Z',
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

  it('puts the selected direct course permission and period and unwraps the association', async () => {
    const period = {
      startsAt: '2026-09-10T03:00:00.000Z',
      expiresAt: '2027-09-11T02:59:59.999Z',
    }
    const fetchMock = useApiResponse({
      data: { ...association, permission: 'FULL', ...period, status: 'SCHEDULED' },
    })

    await expect(
      updateStudentCourseAssociation(12, 7, 'FULL', period),
    ).resolves.toEqual({
      ...association,
      permission: 'FULL',
      ...period,
      status: 'SCHEDULED',
    })

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://api.example.test/api/v1/users/12/courses/7',
    )
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'PUT',
      body: JSON.stringify({ permission: 'FULL', ...period }),
    })
  })

  it('posts an explicit course association and unwraps it', async () => {
    const fetchMock = useApiResponse({ data: association })
    const period = {
      startsAt: '2026-09-08T03:00:00.000Z',
      expiresAt: '2027-09-09T02:59:59.999Z',
    }

    await expect(
      createStudentCourseAssociation(12, 7, 'READ', period),
    ).resolves.toEqual(association)

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://api.example.test/api/v1/users/12/courses/7',
    )
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ permission: 'READ', ...period }),
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
