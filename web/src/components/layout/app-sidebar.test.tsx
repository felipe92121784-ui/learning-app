// @vitest-environment jsdom

import { useState, type PropsWithChildren } from 'react'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { LayoutDashboard, Users } from 'lucide-react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AppSidebar,
  AppSidebarTrigger,
  type AppSidebarNavItem,
} from './app-sidebar'
import { useSessionSidebarCollapsed } from './sidebar-session'

const navigationItems = [
  {
    label: 'Visão geral',
    to: '/admin',
    icon: LayoutDashboard,
    exact: true,
  },
  {
    label: 'Usuários',
    to: '/admin/users',
    icon: Users,
  },
] satisfies readonly AppSidebarNavItem[]

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

function SidebarFixture({ children }: PropsWithChildren) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <AppSidebar
      brand="Ideal Learning"
      collapsed={collapsed}
      currentPath="/admin/users/7"
      items={navigationItems}
      onCollapsedChange={setCollapsed}
    >
      <header>
        <AppSidebarTrigger />
      </header>
      {children}
    </AppSidebar>
  )
}

function PersistedSidebarFixture({ children }: PropsWithChildren) {
  const [collapsed, setCollapsed] = useSessionSidebarCollapsed(
    'ideal-learning:sidebar:test',
  )

  return (
    <AppSidebar
      brand="Ideal Learning"
      collapsed={collapsed}
      currentPath="/admin/users/7"
      items={navigationItems}
      onCollapsedChange={setCollapsed}
    >
      <header>
        <AppSidebarTrigger />
      </header>
      {children}
    </AppSidebar>
  )
}

function renderSidebar(isMobile: boolean, persistsCollapsedState = false) {
  stubViewport(isMobile)

  const rootRoute = createRootRoute({
    component: () =>
      persistsCollapsedState ? (
        <PersistedSidebarFixture>
          <Outlet />
        </PersistedSidebarFixture>
      ) : (
        <SidebarFixture>
          <Outlet />
        </SidebarFixture>
      ),
  })
  const userRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/admin/users/$userId',
    component: () => <main>Detalhes do usuário</main>,
  })
  const adminRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/admin',
    component: () => <main>Visão geral</main>,
  })
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ['/admin/users/7'] }),
    routeTree: rootRoute.addChildren([adminRoute, userRoute]),
  })

  return { ...render(<RouterProvider router={router} />), router }
}

describe('AppSidebar', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('controls the desktop collapsed state through the shared trigger', async () => {
    renderSidebar(false)

    fireEvent.click(
      await screen.findByRole('button', { name: 'Recolher navegação' }),
    )

    expect(
      screen.getByRole('button', { name: 'Expandir navegação' }),
    ).toBeTruthy()
  })

  it('persists the desktop collapsed state for the current session', async () => {
    sessionStorage.clear()
    stubViewport(false)

    const { unmount } = renderSidebar(false, true)
    fireEvent.click(
      await screen.findByRole('button', { name: 'Recolher navegação' }),
    )

    expect(sessionStorage.getItem('ideal-learning:sidebar:test')).toBe('true')

    unmount()
    renderSidebar(false, true)

    expect(
      await screen.findByRole('button', { name: 'Expandir navegação' }),
    ).toBeTruthy()
  })

  it('opens the navigation in a Sheet from the mobile menu trigger', async () => {
    renderSidebar(true)

    fireEvent.click(
      await screen.findByRole('button', { name: 'Abrir navegação' }),
    )

    const dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).getByRole('navigation', {
        name: 'Navegação principal',
      }),
    ).toBeTruthy()
  })

  it('closes the mobile Sheet after activating a destination link', async () => {
    const { router } = renderSidebar(true)

    fireEvent.click(
      await screen.findByRole('button', { name: 'Abrir navegação' }),
    )
    const destination = within(await screen.findByRole('dialog')).getByRole(
      'link',
      { name: 'Visão geral' },
    )
    destination.focus()
    fireEvent.click(destination)

    await waitFor(() => expect(router.state.location.pathname).toBe('/admin'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Abrir navegação' }),
    ).toBeTruthy()
  })

  it('marks the best matching navigation item as the current page', async () => {
    renderSidebar(false)

    await waitFor(() =>
      expect(
        screen.getByRole('link', { name: 'Usuários' }).getAttribute('aria-current'),
      ).toBe('page'),
    )
    expect(
      screen.getByRole('link', { name: 'Visão geral' }).getAttribute('aria-current'),
    ).toBeNull()
  })
})
