// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { UsersTable } from './users-table'
import type { ManagedUser, UserStatus } from './users-types'

const users: ManagedUser[] = [
  {
    id: 1,
    fullName: 'Ada Admin',
    email: 'admin@example.test',
    role: 'ADMIN',
    status: 'ACTIVE',
    initials: 'AA',
    createdAt: '2026-09-03T12:00:00.000Z',
    updatedAt: '2026-09-03T12:00:00.000Z',
  },
  {
    id: 7,
    fullName: 'Active Student',
    email: 'active@example.test',
    role: 'STUDENT',
    status: 'ACTIVE',
    initials: 'AS',
    createdAt: '2026-09-03T12:00:00.000Z',
    updatedAt: '2026-09-03T12:00:00.000Z',
  },
  {
    id: 8,
    fullName: 'Blocked Student',
    email: 'blocked@example.test',
    role: 'STUDENT',
    status: 'BLOCKED',
    initials: 'BS',
    createdAt: '2026-09-03T12:00:00.000Z',
    updatedAt: '2026-09-03T12:00:00.000Z',
  },
]

function renderUsersTable({
  pendingUserId = null,
  statusError = null,
  onStatusChange = vi.fn(),
}: {
  pendingUserId?: number | null
  statusError?: string | null
  onStatusChange?: (userId: number, status: UserStatus) => void
} = {}) {
  const rootRoute = createRootRoute({ component: Outlet })
  const pageRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => (
      <UsersTable
        pendingUserId={pendingUserId}
        statusError={statusError}
        users={users}
        onStatusChange={onStatusChange}
      />
    ),
  })
  const detailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/admin/users/$userId',
    component: () => null,
  })
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ['/'] }),
    routeTree: rootRoute.addChildren([pageRoute, detailRoute]),
  })

  return render(<RouterProvider router={router} />)
}

describe('UsersTable', () => {
  afterEach(cleanup)

  it('links each student to their dedicated details page while retaining status actions', async () => {
    renderUsersTable()

    expect(await screen.findAllByText('Ativo')).toHaveLength(2)
    expect(screen.getByText('Bloqueado')).toBeTruthy()

    const adminRow = screen.getByRole('row', { name: /Ada Admin/ })
    expect(within(adminRow).queryByRole('button')).toBeNull()

    const activeRow = screen.getByRole('row', { name: /Active Student/ })
    expect(
      within(activeRow).getByRole('button', { name: 'Bloquear' }),
    ).toBeTruthy()
    expect(
      within(activeRow).getByRole('link', { name: 'Ver detalhes' }).getAttribute('href'),
    ).toBe('/admin/users/7')
    expect(within(activeRow).queryByText('Cursos e permissões')).toBeNull()

    const blockedRow = screen.getByRole('row', { name: /Blocked Student/ })
    expect(
      within(blockedRow).getByRole('button', { name: 'Ativar' }),
    ).toBeTruthy()
  })

  it('asks for confirmation and emits the opposite status for a student', async () => {
    const onStatusChange = vi.fn()
    renderUsersTable({ onStatusChange })

    const activeRow = await screen.findByRole('row', { name: /Active Student/ })
    fireEvent.click(
      within(activeRow).getByRole('button', { name: 'Bloquear' }),
    )

    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirmar bloqueio' }),
    )

    expect(onStatusChange).toHaveBeenCalledWith(7, 'BLOCKED')
  })

  it('disables the pending student action and exposes a mutation error', async () => {
    renderUsersTable({
      pendingUserId: 8,
      statusError: 'Não foi possível alterar o status.',
    })

    const blockedRow = await screen.findByRole('row', { name: /Blocked Student/ })
    expect(
      within(blockedRow).getByRole('button', { name: 'Alterando…' }),
    ).toHaveProperty('disabled', true)
    expect(screen.getByRole('alert').textContent).toContain(
      'Não foi possível alterar o status.',
    )
  })
})
