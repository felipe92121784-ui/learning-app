import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createUser,
  getUser,
  listUsers,
  updateUser,
  updateUserStatus,
} from './users-api'

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

function useApiResponse(body: unknown) {
  vi.stubEnv('VITE_API_URL', 'https://api.example.test/api/v1')
  const fetchMock = vi.fn().mockResolvedValue(Response.json(body))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('users API', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('lists the public users returned by the administrative endpoint', async () => {
    const fetchMock = useApiResponse({ data: [student] })

    await expect(listUsers()).resolves.toEqual([student])
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://api.example.test/api/v1/users',
    )
  })

  it('loads one user from its administrative endpoint', async () => {
    const fetchMock = useApiResponse({ data: student })

    await expect(getUser(7)).resolves.toEqual(student)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://api.example.test/api/v1/users/7',
    )
  })

  it('creates a student with the initial password and no client-selected role or status', async () => {
    const fetchMock = useApiResponse({ data: student })

    await expect(
      createUser({
        fullName: 'Ada Student',
        email: 'ada@example.test',
        password: 'initial-password-123',
      }),
    ).resolves.toEqual(student)

    const request = fetchMock.mock.calls[0]?.[1]
    expect(request?.method).toBe('POST')
    expect(request?.body).toBe(
      JSON.stringify({
        fullName: 'Ada Student',
        email: 'ada@example.test',
        password: 'initial-password-123',
      }),
    )
  })

  it('updates only the editable identity fields', async () => {
    const fetchMock = useApiResponse({
      data: { ...student, fullName: 'Ada Lovelace' },
    })

    await updateUser(7, {
      fullName: 'Ada Lovelace',
      email: 'ada@example.test',
    })

    const request = fetchMock.mock.calls[0]?.[1]
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://api.example.test/api/v1/users/7',
    )
    expect(request?.method).toBe('PATCH')
    expect(request?.body).toBe(
      JSON.stringify({
        fullName: 'Ada Lovelace',
        email: 'ada@example.test',
      }),
    )
  })

  it('sends activation and blocking through the dedicated status endpoint', async () => {
    const fetchMock = useApiResponse({
      data: { ...student, status: 'BLOCKED' },
    })

    await expect(updateUserStatus(7, 'BLOCKED')).resolves.toEqual({
      ...student,
      status: 'BLOCKED',
    })

    const request = fetchMock.mock.calls[0]?.[1]
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://api.example.test/api/v1/users/7/status',
    )
    expect(request?.method).toBe('PATCH')
    expect(request?.body).toBe(JSON.stringify({ status: 'BLOCKED' }))
  })
})
