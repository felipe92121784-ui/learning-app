// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  RouterProvider,
} from '@tanstack/react-router'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { profileQueryKey } from '@/features/auth/auth-api'
import { AuthProvider } from '@/features/auth/auth-provider'
import type { AuthUser } from '@/features/auth/auth-types'
import { createAppRouter } from '@/router'

const student: AuthUser = {
  id: 7,
  fullName: 'Ada Student',
  email: 'ada.student@example.test',
  role: 'STUDENT',
  status: 'ACTIVE',
}

function stubViewport(isMobile: boolean) {
  vi.stubGlobal('innerWidth', isMobile ? 375 : 1024)
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: isMobile,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  )
}

function renderStudentLayout(initialPath = '/app', isMobile = false) {
  stubViewport(isMobile)
  const queryClient = new QueryClient()
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

  return { router }
}

describe('StudentLayout', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('shows only portal and account navigation to a STUDENT', async () => {
    renderStudentLayout()

    expect(
      (await screen.findByTestId('application-content')).className,
    ).toContain('max-w-[1200px]')

    const navigation = await screen.findByRole('navigation', {
      name: 'Navegação principal',
    })

    expect(
      within(navigation)
        .getByRole('link', { name: 'Portal' })
        .getAttribute('href'),
    ).toBe('/app')
    expect(
      within(navigation)
        .getByRole('link', { name: 'Conta' })
        .getAttribute('href'),
    ).toBe('/app/account')
    expect(
      within(navigation).queryByRole('link', { name: 'Administração' }),
    ).toBeNull()
    expect(
      within(navigation).queryByRole('link', { name: 'Usuários' }),
    ).toBeNull()
  })

  it('marks only account as current while visiting the account page', async () => {
    renderStudentLayout('/app/account')

    expect(
      (await screen.findByRole('link', { name: 'Conta' })).getAttribute(
        'aria-current',
      ),
    ).toBe('page')
    expect(
      screen.getByRole('link', { name: 'Portal' }).getAttribute(
        'aria-current',
      ),
    ).toBeNull()
  })

  it('opens only the student navigation from the mobile header', async () => {
    renderStudentLayout('/app', true)

    fireEvent.click(
      await screen.findByRole('button', { name: 'Abrir navegação' }),
    )

    const sheet = await screen.findByRole('dialog')
    const navigation = within(sheet).getByRole('navigation', {
      name: 'Navegação principal',
    })
    expect(
      within(navigation).getByRole('link', { name: 'Portal' }),
    ).toBeTruthy()
    expect(
      within(navigation).getByRole('link', { name: 'Conta' }),
    ).toBeTruthy()
    expect(
      within(navigation).queryByRole('link', { name: 'Administração' }),
    ).toBeNull()
  })

  it('keeps logout available from the student account menu', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test/api/v1')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((input: string | URL) => {
        const url = String(input)

        if (url.endsWith('/account/logout')) {
          return Promise.resolve(new Response(null, { status: 204 }))
        }

        if (url.endsWith('/account/profile')) {
          return Promise.resolve(new Response(null, { status: 401 }))
        }

        throw new Error(`Unexpected request: ${url}`)
      }),
    )
    const { router } = renderStudentLayout()

    fireEvent.pointerDown(
      await screen.findByRole('button', {
        name: 'Abrir menu da conta de Ada Student',
      }),
      { button: 0, ctrlKey: false },
    )
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Sair' }))

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/login'),
    )
  })
})
