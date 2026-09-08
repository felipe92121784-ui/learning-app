// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { profileQueryKey } from '@/features/auth/auth-api'
import { AuthProvider } from '@/features/auth/auth-provider'
import { studentCourseAssociationsQueryKeys } from '@/features/access-rules/student-course-associations-queries'
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

const association = {
  id: 9,
  title: 'Fundamentos de redes',
  description: 'Introdução',
  permission: 'READ' as const,
  startsAt: '2026-09-08T03:00:00.000Z',
  expiresAt: '2027-09-09T02:59:59.999Z',
  status: 'ACTIVE' as const,
  createdAt: '2026-09-08T12:00:00.000Z',
  updatedAt: null,
}

describe('administrative user routes', () => {
  afterEach(() => {
    cleanup()
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

  it('renders the selected student profile, courses and add-course dialog', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test/api/v1')
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    )
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

        if (url.endsWith('/users/7/courses')) {
          return Promise.resolve(Response.json({ data: [association] }))
        }

        if (url.endsWith('/courses')) {
          return Promise.resolve(Response.json({ data: [] }))
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
    queryClient.setQueryData(profileQueryKey, { ...student, role: 'ADMIN' })

    await router.load()

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </QueryClientProvider>,
    )

    expect(router.state.location.pathname).toBe('/admin/users/7')
    expect(queryClient.getQueryData(usersQueryKeys.detail(7))).toEqual(
      managedStudent,
    )
    expect(
      queryClient.getQueryData(studentCourseAssociationsQueryKeys.list(7)),
    ).toEqual([association])
    expect(await screen.findByRole('heading', { name: 'Ada Student' })).toBeTruthy()
    expect(screen.getByText('Fundamentos de redes')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar curso' }))
    expect(await screen.findByRole('dialog', { name: 'Adicionar curso' })).toBeTruthy()
  })
})
