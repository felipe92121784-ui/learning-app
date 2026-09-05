import { QueryClient } from '@tanstack/react-query'
import { createMemoryHistory } from '@tanstack/react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppRouter } from './router'

const student = {
  id: 7,
  fullName: 'Ada Student',
  email: 'ada@example.test',
  role: 'STUDENT',
  status: 'ACTIVE',
}

describe('protected routes', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('waits for session restoration and directs an anonymous /app visit to login', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test/api/v1')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
    )
    const router = createAppRouter({
      history: createMemoryHistory({ initialEntries: ['/app'] }),
      isServer: false,
      origin: 'http://localhost',
      queryClient: new QueryClient(),
    })

    await router.load()

    expect(router.state.location.pathname).toBe('/login')
    expect(router.state.location.search).toEqual({ redirect: '/app' })
  })

  it('directs a student away from /admin after restoring the session', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test/api/v1')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ data: { user: student } })),
    )
    const router = createAppRouter({
      history: createMemoryHistory({ initialEntries: ['/admin'] }),
      isServer: false,
      origin: 'http://localhost',
      queryClient: new QueryClient(),
    })

    await router.load()

    expect(router.state.location.pathname).toBe('/app')
  })

  it('allows an administrator to load /admin', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test/api/v1')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({ data: { user: { ...student, role: 'ADMIN' } } }),
      ),
    )
    const router = createAppRouter({
      history: createMemoryHistory({ initialEntries: ['/admin'] }),
      isServer: false,
      origin: 'http://localhost',
      queryClient: new QueryClient(),
    })

    await router.load()

    expect(router.state.location.pathname).toBe('/admin')
  })

  it('directs an authenticated student /login visit to the student portal', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test/api/v1')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ data: { user: student } })),
    )
    const router = createAppRouter({
      history: createMemoryHistory({ initialEntries: ['/login'] }),
      isServer: false,
      origin: 'http://localhost',
      queryClient: new QueryClient(),
    })

    await router.load()

    expect(router.state.location.pathname).toBe('/app')
  })

  it('directs an authenticated administrator /login visit to administration', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test/api/v1')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({ data: { user: { ...student, role: 'ADMIN' } } }),
      ),
    )
    const router = createAppRouter({
      history: createMemoryHistory({ initialEntries: ['/login'] }),
      isServer: false,
      origin: 'http://localhost',
      queryClient: new QueryClient(),
    })

    await router.load()

    expect(router.state.location.pathname).toBe('/admin')
  })

  it('protects the account page with the authenticated app guard', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test/api/v1')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
    )
    const router = createAppRouter({
      history: createMemoryHistory({ initialEntries: ['/app/account'] }),
      isServer: false,
      origin: 'http://localhost',
      queryClient: new QueryClient(),
    })

    await router.load()

    expect(router.state.location.pathname).toBe('/login')
    expect(router.state.location.search).toEqual({
      redirect: '/app/account',
    })
  })

  it('loads the account page for an active authenticated user', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test/api/v1')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ data: { user: student } })),
    )
    const router = createAppRouter({
      history: createMemoryHistory({ initialEntries: ['/app/account'] }),
      isServer: false,
      origin: 'http://localhost',
      queryClient: new QueryClient(),
    })

    await router.load()

    expect(router.state.location.pathname).toBe('/app/account')
    expect(router.state.matches.at(-1)?.routeId).toBe(
      '/_app/app_/account',
    )
  })
})
