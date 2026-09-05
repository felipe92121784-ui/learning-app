// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CreateCourseForm, EditCourseForm } from './course-form'
import type { Course } from './courses-types'

const course: Course = {
  id: 7,
  title: 'Metrologia',
  description: 'Fundamentos',
  status: 'DRAFT',
  createdAt: '2026-09-04T12:00:00.000Z',
  updatedAt: '2026-09-04T12:00:00.000Z',
  modules: [],
}

describe('course forms', () => {
  afterEach(() => {
    cleanup()
    delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView
    vi.unstubAllGlobals()
  })

  it('submits title and optional description without a client-selected status on creation', async () => {
    const onSubmit = vi.fn()
    render(
      <CreateCourseForm error={null} isPending={false} onSubmit={onSubmit} />,
    )

    fireEvent.change(screen.getByLabelText('Título'), {
      target: { value: 'Metrologia' },
    })
    fireEvent.change(screen.getByLabelText('Descrição'), {
      target: { value: 'Fundamentos' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Criar curso' }))

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        title: 'Metrologia',
        description: 'Fundamentos',
      }),
    )
    expect(screen.queryByRole('combobox', { name: 'Status' })).toBeNull()
  })

  it('edits a course title, description, and status', async () => {
    const onSubmit = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    })
    render(
      <EditCourseForm
        course={course}
        error="Não foi possível salvar o curso."
        isPending={false}
        onSubmit={onSubmit}
      />,
    )

    expect(screen.getByRole('alert').textContent).toContain(
      'Não foi possível salvar o curso.',
    )
    fireEvent.change(screen.getByLabelText('Título'), {
      target: { value: 'Metrologia industrial' },
    })
    fireEvent.click(screen.getByRole('combobox', { name: 'Status' }))
    fireEvent.click(screen.getByRole('option', { name: 'Publicado' }))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        title: 'Metrologia industrial',
        description: 'Fundamentos',
        status: 'PUBLISHED',
      }),
    )
  })

  it('sends null when an existing course description is cleared', async () => {
    const onSubmit = vi.fn()
    render(
      <EditCourseForm
        course={course}
        error={null}
        isPending={false}
        onSubmit={onSubmit}
      />,
    )

    fireEvent.change(screen.getByLabelText('Descrição'), {
      target: { value: '' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        title: 'Metrologia',
        description: null,
        status: 'DRAFT',
      }),
    )
  })

  it('resets its rendered values when the edited course changes', () => {
    const nextCourse: Course = {
      ...course,
      id: 8,
      title: 'Desenho técnico',
      description: 'Leitura de projetos',
      status: 'PUBLISHED',
    }
    const { rerender } = render(
      <EditCourseForm
        course={course}
        error={null}
        isPending={false}
        onSubmit={vi.fn()}
      />,
    )

    rerender(
      <EditCourseForm
        course={nextCourse}
        error={null}
        isPending={false}
        onSubmit={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('Título')).toHaveProperty(
      'value',
      'Desenho técnico',
    )
    expect(screen.getByLabelText('Descrição')).toHaveProperty(
      'value',
      'Leitura de projetos',
    )
  })

  it('keeps submission unavailable while a course mutation is pending', () => {
    render(
      <CreateCourseForm error={null} isPending onSubmit={vi.fn()} />,
    )

    expect(screen.getByRole('button', { name: 'Criando…' })).toHaveProperty(
      'disabled',
      true,
    )
  })
})
