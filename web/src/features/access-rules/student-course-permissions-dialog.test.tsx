// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StudentCoursePermissionsDialog } from './student-course-permissions-dialog'

const update = vi.fn()
const remove = vi.fn()

vi.mock('./student-course-associations-queries', () => ({
  useStudentCourseAssociationsQuery: () => ({
    data: [
      {
        id: 9,
        title: 'Fundamentos de redes',
        description: 'Introdução',
        status: 'PUBLISHED',
        permission: 'READ',
        createdAt: '2026-09-07T00:00:00.000Z',
        updatedAt: null,
      },
    ],
    isPending: false,
    isError: false,
  }),
  useUpdateStudentCourseAssociationMutation: () => ({
    mutateAsync: update,
    isPending: false,
  }),
  useDeleteStudentCourseAssociationMutation: () => ({
    mutateAsync: remove,
    isPending: false,
  }),
}))

vi.mock('@/features/courses/courses-queries', () => ({
  useCoursesQuery: () => ({
    data: [
      {
        id: 11,
        title: 'Segurança',
        description: null,
        status: 'PUBLISHED',
        createdAt: '2026-09-07T00:00:00.000Z',
        updatedAt: null,
      },
    ],
    isPending: false,
  }),
  useCourseQuery: () => ({ data: { modules: [] }, isPending: false }),
}))

vi.mock('@/features/materials/materials-queries', () => ({
  useMaterialsQuery: () => ({ data: [], isPending: false }),
}))

vi.mock('./access-rules-queries', () => ({
  useAccessRulesQuery: () => ({ data: [], isPending: false }),
  useEffectiveAccessQuery: () => ({ data: null, isPending: false }),
  useUpsertAccessRuleMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

describe('StudentCoursePermissionsDialog', () => {
  afterEach(() => {
    cleanup()
    update.mockReset()
    remove.mockReset()
  })

  it('shows only assigned courses first and exposes course management actions', () => {
    render(
      <StudentCoursePermissionsDialog
        open
        onOpenChange={vi.fn()}
        student={{ id: 7, fullName: 'Ada Aluna' }}
      />,
    )

    expect(screen.getByRole('dialog', { name: 'Cursos e permissões' })).toBeTruthy()
    expect(screen.getByText('Fundamentos de redes')).toBeTruthy()
    expect(screen.queryByText('Segurança')).toBeNull()
    expect(screen.getByRole('button', { name: 'Adicionar curso' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Configurar Fundamentos de redes' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Remover curso Fundamentos de redes' })).toBeTruthy()
  })

  it('opens a searchable course selector without showing assigned courses again', () => {
    render(
      <StudentCoursePermissionsDialog
        open
        onOpenChange={vi.fn()}
        student={{ id: 7, fullName: 'Ada Aluna' }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar curso' }))

    expect(screen.getByRole('textbox', { name: 'Buscar curso' })).toBeTruthy()
    expect(screen.getByText('Segurança')).toBeTruthy()
    expect(screen.queryByText('Fundamentos de redes')).toBeNull()
  })

  it('updates the course through its association when the course toggle changes', () => {
    render(
      <StudentCoursePermissionsDialog
        open
        onOpenChange={vi.fn()}
        student={{ id: 7, fullName: 'Ada Aluna' }}
      />,
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Configurar Fundamentos de redes' }),
    )
    fireEvent.click(screen.getAllByRole('radio', { name: 'Total' })[0]!)

    expect(update).toHaveBeenCalledWith({
      userId: 7,
      courseId: 9,
      permission: 'FULL',
    })
  })
})
