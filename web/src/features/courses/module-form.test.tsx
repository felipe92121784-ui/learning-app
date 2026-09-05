// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ModuleForm } from './module-form'
import type { CourseModule } from './courses-types'

const courseModule: CourseModule = {
  id: 11,
  courseId: 7,
  title: 'Fundamentos',
  description: 'Introdução',
  position: 0,
  createdAt: '2026-09-04T12:00:00.000Z',
  updatedAt: '2026-09-04T12:00:00.000Z',
}

describe('module form', () => {
  afterEach(cleanup)

  it('submits module title and optional description', async () => {
    const onSubmit = vi.fn()
    render(<ModuleForm error={null} isPending={false} onSubmit={onSubmit} />)

    fireEvent.change(screen.getByLabelText('Título'), {
      target: { value: 'Fundamentos' },
    })
    fireEvent.change(screen.getByLabelText('Descrição'), {
      target: { value: 'Introdução' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar módulo' }))

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        title: 'Fundamentos',
        description: 'Introdução',
      }),
    )
  })

  it('uses a module initial values and exposes mutation errors when editing', async () => {
    render(
      <ModuleForm
        error="Não foi possível salvar o módulo."
        isPending={false}
        module={courseModule}
        onSubmit={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('Título')).toHaveProperty(
      'value',
      'Fundamentos',
    )
    expect(screen.getByLabelText('Descrição')).toHaveProperty(
      'value',
      'Introdução',
    )
    expect(screen.getByRole('alert').textContent).toContain(
      'Não foi possível salvar o módulo.',
    )
    expect(screen.getByRole('button', { name: 'Salvar módulo' })).toBeDefined()
  })

  it('sends null when an existing module description is cleared', async () => {
    const onSubmit = vi.fn()
    render(
      <ModuleForm
        error={null}
        isPending={false}
        module={courseModule}
        onSubmit={onSubmit}
      />,
    )

    fireEvent.change(screen.getByLabelText('Descrição'), {
      target: { value: '' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar módulo' }))

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        title: 'Fundamentos',
        description: null,
      }),
    )
  })

  it('resets its rendered values when the edited module changes', () => {
    const nextModule: CourseModule = {
      ...courseModule,
      id: 12,
      title: 'Instrumentos',
      description: 'Paquímetro e micrômetro',
    }
    const { rerender } = render(
      <ModuleForm
        error={null}
        isPending={false}
        module={courseModule}
        onSubmit={vi.fn()}
      />,
    )

    rerender(
      <ModuleForm
        error={null}
        isPending={false}
        module={nextModule}
        onSubmit={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('Título')).toHaveProperty(
      'value',
      'Instrumentos',
    )
    expect(screen.getByLabelText('Descrição')).toHaveProperty(
      'value',
      'Paquímetro e micrômetro',
    )
  })
})
