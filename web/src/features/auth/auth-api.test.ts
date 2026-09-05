import { afterEach, describe, expect, it, vi } from 'vitest'
import { getProfile, login, logout } from './auth-api'

const student = {
  id: 7,
  fullName: 'Ada Student',
  email: 'ada@example.test',
  role: 'STUDENT' as const,
  status: 'ACTIVE' as const,
}

describe('auth API', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('posts login credentials as JSON and returns only the public user', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test/api/v1')
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({ data: { user: student } }),
    )
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('login must not read browser storage')
      },
      setItem: () => {
        throw new Error('login must not persist credentials or tokens')
      },
    })

    await expect(
      login({ email: 'ada@example.test', password: 'correct-password' }),
    ).resolves.toEqual(student)

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://api.example.test/api/v1/auth/login',
    )
    const request = fetchMock.mock.calls[0]?.[1]
    expect(request?.method).toBe('POST')
    expect(new Headers(request?.headers).get('Content-Type')).toBe(
      'application/json',
    )
    expect(request?.body).toBe(
      JSON.stringify({
        email: 'ada@example.test',
        password: 'correct-password',
      }),
    )
  })

  it('restores the public user from the profile endpoint', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test/api/v1')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ data: { user: student } })),
    )

    await expect(getProfile()).resolves.toEqual(student)
  })

  it('represents a missing session as no current user', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test/api/v1')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
    )

    await expect(getProfile()).resolves.toBeNull()
  })

  it('posts logout to the authenticated account endpoint', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test/api/v1')
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({ message: 'Logged out successfully' }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(logout()).resolves.toBeUndefined()
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://api.example.test/api/v1/account/logout',
    )
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('POST')
  })
})
