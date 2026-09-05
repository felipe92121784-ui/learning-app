// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CreateUserForm, EditUserForm } from './user-form'
import type { ManagedUser } from './users-types'

const student: ManagedUser = {
  id: 7,
  fullName: 'Ada Student',
  email: 'ada@example.test',
  role: 'STUDENT',
  status: 'ACTIVE',
  initials: 'AS',
  createdAt: '2026-09-03T12:00:00.000Z',
  updatedAt: '2026-09-03T12:00:00.000Z',
}

describe('administrative user forms', () => {
  afterEach(cleanup)

  it('submits the student identity and initial password on creation', async () => {
    const onSubmit = vi.fn()
    render(
      <CreateUserForm
        error={null}
        isPending={false}
        onSubmit={onSubmit}
      />,
    )

    fireEvent.change(screen.getByLabelText('Nome completo'), {
      target: { value: 'New Student' },
    })
    fireEvent.change(screen.getByLabelText('E-mail'), {
      target: { value: 'new.student@example.test' },
    })
    fireEvent.change(screen.getByLabelText('Senha inicial'), {
      target: { value: 'initial-password-123' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Criar aluno' }))

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        fullName: 'New Student',
        email: 'new.student@example.test',
        password: 'initial-password-123',
      }),
    )
  })

  it('edits identity without offering a password or role field', async () => {
    const onSubmit = vi.fn()
    render(
      <EditUserForm
        error="Não foi possível salvar o aluno."
        isPending={false}
        user={student}
        onSubmit={onSubmit}
      />,
    )

    expect(screen.queryByLabelText('Senha inicial')).toBeNull()
    expect(screen.queryByLabelText('Perfil')).toBeNull()
    expect(screen.getByRole('alert').textContent).toContain(
      'Não foi possível salvar o aluno.',
    )

    fireEvent.change(screen.getByLabelText('Nome completo'), {
      target: { value: 'Ada Lovelace' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        fullName: 'Ada Lovelace',
        email: 'ada@example.test',
      }),
    )
  })

  it('keeps the submit action disabled while a mutation is pending', () => {
    render(
      <CreateUserForm
        error={null}
        isPending
        onSubmit={vi.fn()}
      />,
    )

    expect(
      screen.getByRole('button', { name: 'Criando…' }),
    ).toHaveProperty('disabled', true)
  })
})
