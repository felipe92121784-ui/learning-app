// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { profileQueryKey } from '@/features/auth/auth-api'
import { cacheLoggedInUser } from '@/features/auth/auth-cache'
import { AuthProvider } from '@/features/auth/auth-provider'
import type { StudentCourseDetail } from '@/features/student-catalog/student-catalog-types'
import { createAppRouter } from '@/router'

const student = {
  id: 7,
  fullName: 'Ada Student',
  email: 'ada@example.test',
  role: 'STUDENT' as const,
  status: 'ACTIVE' as const,
}

const availableCourse: StudentCourseDetail = {
  id: 14,
  title: 'Fundamentos seguros',
  description: 'Conteúdo permitido.',
  moduleCount: 1,
  modules: [{
    id: 21,
    title: 'Primeiro módulo',
    description: null,
    availability: 'AVAILABLE',
    materials: [{
      id: 42,
      title: 'Manual liberado',
      description: null,
      type: 'PDF',
      availability: 'AVAILABLE',
    }],
  }],
}

function renderStudentRoute(initialPath: string, course = availableCourse) {
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
  vi.stubEnv('VITE_API_URL', 'https://api.example.test/api/v1')
  const fetchMock = vi.fn().mockImplementation((input: string | URL) => {
    const url = String(input)
    if (url.endsWith('/student/courses')) {
      return Promise.resolve(Response.json({
        data: [{
          id: course.id,
          title: course.title,
          description: course.description,
          moduleCount: course.moduleCount,
        }],
      }))
    }
    if (url.endsWith('/student/courses/14')) {
      return Promise.resolve(Response.json({ data: course }))
    }
    if (url.endsWith('/materials/42/view')) {
      return Promise.resolve(Response.json({
        data: {
          id: 42,
          title: 'Manual liberado',
          type: 'ZIP',
          viewer: null,
          download: { allowed: false },
        },
      }))
    }
    throw new Error(`Unexpected request: ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  queryClient.setQueryData(profileQueryKey, student)
  const router = createAppRouter({
    history: createMemoryHistory({ initialEntries: [initialPath] }),
    isServer: false,
    origin: 'http://localhost',
    queryClient,
  })

  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  )

  return { fetchMock, queryClient, router }
}

function renderStudentHome(
  response: 'pending' | 'error' | 'empty',
) {
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
  vi.stubEnv('VITE_API_URL', 'https://api.example.test/api/v1')
  vi.stubGlobal('fetch', vi.fn().mockImplementation((input: string | URL) => {
    const url = String(input)
    if (!url.endsWith('/student/courses')) {
      throw new Error(`Unexpected request: ${url}`)
    }
    if (response === 'pending') return new Promise<Response>(() => undefined)
    if (response === 'error') {
      return Promise.resolve(Response.json({ message: 'private detail' }, { status: 500 }))
    }
    return Promise.resolve(Response.json({ data: [] }))
  }))
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  queryClient.setQueryData(profileQueryKey, student)
  const router = createAppRouter({
    history: createMemoryHistory({ initialEntries: ['/app'] }),
    isServer: false,
    origin: 'http://localhost',
    queryClient,
  })

  const result = render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  )
  return result
}

function renderPendingStudentRoute(initialPath: string) {
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
  vi.stubEnv('VITE_API_URL', 'https://api.example.test/api/v1')
  const fetchMock = vi.fn().mockImplementation((input: string | URL) => {
    const url = String(input)
    if (url.endsWith('/student/courses/14')) {
      return new Promise<Response>(() => undefined)
    }
    throw new Error(`Unexpected request: ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  queryClient.setQueryData(profileQueryKey, student)
  const router = createAppRouter({
    history: createMemoryHistory({ initialEntries: [initialPath] }),
    isServer: false,
    origin: 'http://localhost',
    queryClient,
  })

  const result = render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  )
  return { ...result, fetchMock }
}

describe('student course routes', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('renders home loading skeletons while the student catalog is pending', async () => {
    const { container } = renderStudentHome('pending')

    expect(await screen.findByRole('heading', { name: 'Seus cursos' })).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('Carregando cursos')
    expect(container.querySelector('[data-slot="skeleton"]')).toBeTruthy()
  })

  it('renders safe home error and empty states', async () => {
    const first = renderStudentHome('error')
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      expect.stringContaining('Não foi possível carregar seus cursos'),
    )

    first.unmount()
    renderStudentHome('empty')
    expect(await screen.findByText('Nenhum curso disponível')).toBeTruthy()
  })

  it('renders the student catalog at the valid /app/ trailing-slash URL', async () => {
    renderStudentRoute('/app/')

    expect(await screen.findByRole('heading', { name: 'Seus cursos' })).toBeTruthy()
    expect(await screen.findByRole('link', { name: 'Abrir curso' })).toBeTruthy()
  })

  it('renders course detail at a valid trailing-slash URL', async () => {
    renderStudentRoute('/app/courses/14/')

    expect(
      await screen.findByRole('heading', { name: 'Fundamentos seguros' }),
    ).toBeTruthy()
    expect(screen.getByText('Primeiro módulo')).toBeTruthy()
  })

  it.each([
    '/app/courses/14',
    '/app/courses/14/materials/42',
  ])('renders a route-level loading status during a cold load of %s', async (path) => {
    const { container, fetchMock } = renderPendingStudentRoute(path)

    expect(await screen.findByRole('status')).toHaveProperty(
      'textContent',
      expect.stringContaining('Carregando curso'),
    )
    expect(container.querySelector('[data-slot="skeleton"]')).toBeTruthy()
    expect(fetchMock).toHaveBeenCalled()
  })

  it('loads a positive course ID through the student detail query', async () => {
    const { fetchMock } = renderStudentRoute('/app/courses/14')

    expect(await screen.findByRole('heading', { name: 'Fundamentos seguros' })).toBeTruthy()
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(1)
    expect(fetchMock.mock.calls.every(([input]) =>
      String(input) === 'https://api.example.test/api/v1/student/courses/14',
    )).toBe(true)
  })

  it('rejects a non-positive or non-numeric course ID without requesting catalog data', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { fetchMock } = renderStudentRoute('/app/courses/not-a-number')

    expect(await screen.findByText(/não foi possível encontrar/i)).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(consoleError).not.toHaveBeenCalled()
  })

  it('does not render the viewer when materialId is absent from the selected course detail', async () => {
    const { fetchMock } = renderStudentRoute('/app/courses/14/materials/99')

    expect(await screen.findByText(/não foi possível encontrar/i)).toBeTruthy()
    expect(screen.queryByLabelText(/material protegido/i)).toBeNull()
    const requestedUrls = fetchMock.mock.calls.map(([input]) => String(input))
    expect(requestedUrls.length).toBeGreaterThanOrEqual(1)
    expect(requestedUrls.every((url) => url.endsWith('/student/courses/14'))).toBe(true)
  })

  it.each(['LOCKED', 'UNAVAILABLE'] as const)(
    'does not mount or query the viewer for a %s material',
    async (availability) => {
      const course: StudentCourseDetail = {
        ...availableCourse,
        modules: [{
          ...availableCourse.modules[0],
          materials: [{
            ...availableCourse.modules[0].materials[0],
            availability,
            ...(availability === 'UNAVAILABLE'
              ? { unavailableReason: 'PROCESSING' as const }
              : {}),
          }],
        }],
      }
      const { fetchMock } = renderStudentRoute(
        '/app/courses/14/materials/42',
        course,
      )

      expect(await screen.findByText(/não foi possível encontrar/i)).toBeTruthy()
      expect(screen.queryByLabelText(/material protegido/i)).toBeNull()
      const requestedUrls = fetchMock.mock.calls.map(([input]) => String(input))
      expect(requestedUrls.length).toBeGreaterThanOrEqual(1)
      expect(requestedUrls.every((url) => url.endsWith('/student/courses/14'))).toBe(true)
    },
  )

  it('mounts the protected viewer only after the course confirms an AVAILABLE material', async () => {
    const { fetchMock } = renderStudentRoute('/app/courses/14/materials/42')

    expect(
      await screen.findByLabelText('Material protegido: Manual liberado'),
    ).toBeTruthy()
    const breadcrumb = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(
      within(breadcrumb)
        .getByRole('link', { name: 'Fundamentos seguros' })
        .getAttribute('href'),
    ).toBe('/app/courses/14')
    await waitFor(() => {
      const requestedUrls = fetchMock.mock.calls.map(([input]) => String(input))
      expect(requestedUrls.filter((url) => url.endsWith('/materials/42/view'))).toHaveLength(1)
      expect(requestedUrls[0]).toBe(
        'https://api.example.test/api/v1/student/courses/14',
      )
      expect(requestedUrls.every((url) =>
        url.endsWith('/student/courses/14') || url.endsWith('/materials/42/view'),
      )).toBe(true)
    })
  })

  it('removes route-owned course and material data before a new identity can render', async () => {
    const { fetchMock, queryClient } = renderStudentRoute(
      '/app/courses/14/materials/42',
    )
    expect(
      await screen.findByLabelText('Material protegido: Manual liberado'),
    ).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Fundamentos seguros' })).toBeTruthy()

    const studentB = { ...student, id: 8, fullName: 'B Student' }
    const pendingCatalogB = new Promise<Response>(() => undefined)
    const pendingViewerB = new Promise<Response>(() => undefined)
    fetchMock.mockImplementation((input: string | URL) => {
      const url = String(input)
      if (url.endsWith('/account/profile')) {
        return Promise.resolve(Response.json({ data: { user: studentB } }))
      }
      if (url.endsWith('/student/courses/14')) return pendingCatalogB
      if (url.endsWith('/materials/42/view')) return pendingViewerB
      throw new Error(`Unexpected request: ${url}`)
    })

    await act(async () => {
      await cacheLoggedInUser(queryClient, studentB)
    })

    await waitFor(() => {
      expect(screen.queryByText('Fundamentos seguros')).toBeNull()
      expect(screen.queryByText('Manual liberado')).toBeNull()
      expect(screen.queryByLabelText(/material protegido/i)).toBeNull()
    })
  })

  it('rejects an invalid material ID before it can request the viewer', async () => {
    const { fetchMock } = renderStudentRoute('/app/courses/14/materials/invalid')

    expect(await screen.findByText(/não foi possível encontrar/i)).toBeTruthy()
    expect(screen.queryByLabelText(/material protegido/i)).toBeNull()
    const requestedUrls = fetchMock.mock.calls.map(([input]) => String(input))
    expect(requestedUrls.length).toBeGreaterThanOrEqual(1)
    expect(requestedUrls.every((url) => url.endsWith('/student/courses/14'))).toBe(true)
  })
})
