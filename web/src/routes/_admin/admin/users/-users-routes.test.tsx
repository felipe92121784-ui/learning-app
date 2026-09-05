import { QueryClient } from '@tanstack/react-query'
import { createMemoryHistory } from '@tanstack/react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { usersQueryKeys } from '@/features/users/users-queries'
import { createAppRouter } from '@/router'

const student = {
  id: 7,
  fullName: 'Ada Student',
  email: 'ada@example.test',
  role: 'STUDENT' as const,
  status: 'ACTIVE' as const,
}

const managedStudent = {
  ...student,
  initials: 'AS',
  createdAt: '2026-09-03T12:00:00.000Z',
  updatedAt: '2026-09-03T12:00:00.000Z',
}

describe('administrative user routes', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('inherits the existing ADMIN guard for the users area', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test/api/v1')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ data: { user: student } })),
    )
    const router = createAppRouter({
      history: createMemoryHistory({ initialEntries: ['/admin/users'] }),
      isServer: false,
      origin: 'http://localhost',
      queryClient: new QueryClient(),
    })

    await router.load()

    expect(router.state.location.pathname).toBe('/app')
  })

  it('preloads the user list for an active administrator', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test/api/v1')
    const fetchMock = vi.fn().mockImplementation((input: string | URL) => {
      const url = String(input)

      if (url.endsWith('/account/profile')) {
        return Promise.resolve(
          Response.json({ data: { user: { ...student, role: 'ADMIN' } } }),
        )
      }

      if (url.endsWith('/users')) {
        return Promise.resolve(Response.json({ data: [managedStudent] }))
      }

      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const queryClient = new QueryClient()
    const router = createAppRouter({
      history: createMemoryHistory({ initialEntries: ['/admin/users'] }),
      isServer: false,
      origin: 'http://localhost',
      queryClient,
    })

    await router.load()

    expect(router.state.location.pathname).toBe('/admin/users')
    expect(queryClient.getQueryData(usersQueryKeys.list())).toEqual([
      managedStudent,
    ])
  })

  it('preloads the selected user before rendering the edit route', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test/api/v1')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((input: string | URL) => {
        const url = String(input)

        if (url.endsWith('/account/profile')) {
          return Promise.resolve(
            Response.json({
              data: { user: { ...student, role: 'ADMIN' } },
            }),
          )
        }

        if (url.endsWith('/users/7')) {
          return Promise.resolve(Response.json({ data: managedStudent }))
        }

        throw new Error(`Unexpected request: ${url}`)
      }),
    )
    const queryClient = new QueryClient()
    const router = createAppRouter({
      history: createMemoryHistory({ initialEntries: ['/admin/users/7'] }),
      isServer: false,
      origin: 'http://localhost',
      queryClient,
    })

    await router.load()

    expect(router.state.location.pathname).toBe('/admin/users/7')
    expect(queryClient.getQueryData(usersQueryKeys.detail(7))).toEqual(
      managedStudent,
    )
  })
})
