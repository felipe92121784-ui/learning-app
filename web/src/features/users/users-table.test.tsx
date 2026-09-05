// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { UsersTable } from './users-table'
import type { ManagedUser } from './users-types'

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

describe('UsersTable', () => {
  afterEach(cleanup)

  it('renders translated status badges and actions only for students', () => {
    render(
      <UsersTable
        pendingUserId={null}
        statusError={null}
        users={users}
        onStatusChange={vi.fn()}
      />,
    )

    expect(screen.getAllByText('Ativo')).toHaveLength(2)
    expect(screen.getByText('Bloqueado')).toBeTruthy()

    const adminRow = screen.getByRole('row', { name: /Ada Admin/ })
    expect(within(adminRow).queryByRole('button')).toBeNull()

    const activeRow = screen.getByRole('row', { name: /Active Student/ })
    expect(
      within(activeRow).getByRole('button', { name: 'Bloquear' }),
    ).toBeTruthy()

    const blockedRow = screen.getByRole('row', { name: /Blocked Student/ })
    expect(
      within(blockedRow).getByRole('button', { name: 'Ativar' }),
    ).toBeTruthy()
  })

  it('asks for confirmation and emits the opposite status for a student', () => {
    const onStatusChange = vi.fn()
    render(
      <UsersTable
        pendingUserId={null}
        statusError={null}
        users={users}
        onStatusChange={onStatusChange}
      />,
    )

    const activeRow = screen.getByRole('row', { name: /Active Student/ })
    fireEvent.click(
      within(activeRow).getByRole('button', { name: 'Bloquear' }),
    )

    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirmar bloqueio' }),
    )

    expect(onStatusChange).toHaveBeenCalledWith(7, 'BLOCKED')
  })

  it('disables the pending student action and exposes a mutation error', () => {
    render(
      <UsersTable
        pendingUserId={8}
        statusError="Não foi possível alterar o status."
        users={users}
        onStatusChange={vi.fn()}
      />,
    )

    const blockedRow = screen.getByRole('row', { name: /Blocked Student/ })
    expect(
      within(blockedRow).getByRole('button', { name: 'Alterando…' }),
    ).toHaveProperty('disabled', true)
    expect(screen.getByRole('alert').textContent).toContain(
      'Não foi possível alterar o status.',
    )
  })
})
