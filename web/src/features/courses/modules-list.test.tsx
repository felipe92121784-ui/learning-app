// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ModulesList } from './modules-list'
import type { CourseModule } from './courses-types'

const first: CourseModule = {
  id: 11,
  courseId: 7,
  title: 'Primeiro módulo',
  description: 'Começo',
  position: 0,
  createdAt: '2026-09-04T12:00:00.000Z',
  updatedAt: '2026-09-04T12:00:00.000Z',
}

const second: CourseModule = {
  ...first,
  id: 12,
  title: 'Segundo módulo',
  position: 1,
}

describe('modules list', () => {
  afterEach(cleanup)

  it('provides accessible edit, delete, and bounded move controls', () => {
    const onMove = vi.fn()
    const onEdit = vi.fn()
    const onDelete = vi.fn()
    render(
      <ModulesList
        modules={[first, second]}
        onDelete={onDelete}
        onEdit={onEdit}
        onMove={onMove}
      />,
    )

    expect(
      screen.getByRole('button', { name: 'Mover Primeiro módulo para cima' }),
    ).toHaveProperty('disabled', true)
    expect(
      screen.getByRole('button', { name: 'Mover Segundo módulo para baixo' }),
    ).toHaveProperty('disabled', true)
    expect(
      screen.getByRole('button', { name: 'Mover Segundo módulo para cima' }),
    ).toHaveProperty('disabled', false)
    expect(
      screen.getByRole('button', { name: 'Mover Primeiro módulo para baixo' }),
    ).toHaveProperty('disabled', false)

    fireEvent.click(
      screen.getByRole('button', { name: 'Mover Segundo módulo para cima' }),
    )
    expect(onMove).toHaveBeenCalledWith([12, 11])

    fireEvent.click(screen.getByRole('button', { name: 'Editar Primeiro módulo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Excluir Primeiro módulo' }))
    expect(onEdit).toHaveBeenCalledWith(first)
    expect(onDelete).toHaveBeenCalledWith(first)
  })

  it('renders caller-friendly loading and mutation errors', () => {
    const { rerender } = render(
      <ModulesList
        isLoading
        modules={[]}
        onDelete={vi.fn()}
        onEdit={vi.fn()}
        onMove={vi.fn()}
      />,
    )

    expect(screen.getByText('Carregando módulos…')).toBeDefined()
    rerender(
      <ModulesList
        error="Não foi possível reordenar os módulos."
        modules={[first]}
        onDelete={vi.fn()}
        onEdit={vi.fn()}
        onMove={vi.fn()}
      />,
    )
    expect(screen.getByRole('alert').textContent).toContain(
      'Não foi possível reordenar os módulos.',
    )
  })
})
