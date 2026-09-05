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

const admin: AuthUser = {
  id: 1,
  fullName: 'Ada Admin',
  email: 'ada.admin@example.test',
  role: 'ADMIN',
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

function renderAdminLayout(initialPath = '/admin', isMobile = false) {
  stubViewport(isMobile)
  const queryClient = new QueryClient()
  queryClient.setQueryData(profileQueryKey, admin)
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

describe('AdminLayout', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('shows only the administrative navigation available to an ADMIN', async () => {
    renderAdminLayout()

    expect(
      (await screen.findByTestId('application-content')).className,
    ).toContain('max-w-[1200px]')

    const navigation = await screen.findByRole('navigation', {
      name: 'Navegação principal',
    })

    expect(
      within(navigation).getByRole('link', { name: 'Visão geral' }),
    ).toBeTruthy()
    expect(
      within(navigation).getByRole('link', { name: 'Usuários' }),
    ).toBeTruthy()
    expect(
      within(navigation).queryByRole('link', { name: 'Portal' }),
    ).toBeNull()
    expect(
      within(navigation).queryByRole('link', { name: 'Conta' }),
    ).toBeNull()
  })

  it('exposes the authenticated administrator account from the header', async () => {
    renderAdminLayout()

    fireEvent.pointerDown(
      await screen.findByRole('button', {
        name: 'Abrir menu da conta de Ada Admin',
      }),
      { button: 0, ctrlKey: false },
    )

    const menu = await screen.findByRole('menu')
    expect(within(menu).getByText('ada.admin@example.test')).toBeTruthy()
    expect(within(menu).getByRole('menuitem', { name: 'Sair' })).toBeTruthy()
  })

  it('opens and closes the administrator account menu with the keyboard', async () => {
    renderAdminLayout()

    const accountMenu = await screen.findByRole('button', {
      name: 'Abrir menu da conta de Ada Admin',
    })
    fireEvent.keyDown(accountMenu, { key: 'Enter' })

    expect(await screen.findByRole('menu')).toBeTruthy()

    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    expect(document.activeElement).toBe(accountMenu)
  })

  it('opens the administrative navigation from the mobile header', async () => {
    renderAdminLayout('/admin', true)

    fireEvent.click(
      await screen.findByRole('button', { name: 'Abrir navegação' }),
    )

    const sheet = await screen.findByRole('dialog')
    const navigation = within(sheet).getByRole('navigation', {
      name: 'Navegação principal',
    })
    expect(
      within(navigation).getByRole('link', { name: 'Visão geral' }),
    ).toBeTruthy()
    expect(
      within(navigation).getByRole('link', { name: 'Usuários' }),
    ).toBeTruthy()
    expect(
      within(navigation).queryByRole('link', { name: 'Portal' }),
    ).toBeNull()
  })

  it('ends the session and returns to login from the account menu', async () => {
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
    const { router } = renderAdminLayout()

    fireEvent.pointerDown(
      await screen.findByRole('button', {
        name: 'Abrir menu da conta de Ada Admin',
      }),
      { button: 0, ctrlKey: false },
    )
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Sair' }))

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/login'),
    )
  })

  it('announces a logout failure without leaving the admin area', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test/api/v1')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 500 })),
    )
    const { router } = renderAdminLayout()

    fireEvent.pointerDown(
      await screen.findByRole('button', {
        name: 'Abrir menu da conta de Ada Admin',
      }),
      { button: 0, ctrlKey: false },
    )
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Sair' }))

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Não foi possível sair. Tente novamente.',
    )
    expect(router.state.location.pathname).toBe('/admin')
  })
})
