// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ApiError } from '@/lib/api-client'
import { StudentCoursePermissionsDialog } from './student-course-permissions-dialog'

const update = vi.fn()
const create = vi.fn()
const remove = vi.fn()
const upsertRule = vi.fn()

const assignedCourse = {
  id: 9,
  title: 'Fundamentos de redes',
  description: 'Introdução',
  status: 'PUBLISHED',
  permission: 'READ' as const,
  createdAt: '2026-09-07T00:00:00.000Z',
  updatedAt: null,
}

let associationsState: {
  data: typeof assignedCourse[] | undefined
  isPending: boolean
  isError: boolean
  isSuccess: boolean
}
let associationResponses: typeof associationsState[]
let courseState: { data: { modules: unknown[] } | undefined; isPending: boolean; isError?: boolean }
let directRulesState: { data: unknown[] | undefined; isPending: boolean; isError: boolean }
let effectiveAccessState: { data: unknown; isPending: boolean; isError: boolean }

function resetStates() {
  associationsState = {
    data: [assignedCourse],
    isPending: false,
    isError: false,
    isSuccess: true,
  }
  associationResponses = []
  courseState = { data: { modules: [] }, isPending: false }
  directRulesState = { data: [], isPending: false, isError: false }
  effectiveAccessState = {
    data: {
      view: { allowed: true, source: 'COURSE' },
      download: { allowed: false, source: 'COURSE' },
    },
    isPending: false,
    isError: false,
  }
}

resetStates()

vi.mock('./student-course-associations-queries', () => ({
  studentCourseAssociationsQueryKeys: {
    list: (userId: number) => ['student-course-associations', 'list', userId],
  },
  useStudentCourseAssociationsQuery: () => associationResponses.shift() ?? associationsState,
  studentCourseAssociationsQueryOptions: (userId: number) => ({
    queryKey: ['student-course-associations', 'list', userId],
    queryFn: async () => associationsState.data ?? [],
  }),
  useUpdateStudentCourseAssociationMutation: () => ({
    mutateAsync: update,
    isPending: false,
  }),
  useCreateStudentCourseAssociationMutation: () => ({
    mutateAsync: create,
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
  useCourseQuery: () => courseState,
}))

vi.mock('@/features/materials/materials-queries', () => ({
  useMaterialsQuery: () => ({ data: [], isPending: false }),
}))

vi.mock('./access-rules-queries', () => ({
  accessRulesQueryKeys: { all: ['access-rules'] },
  useAccessRulesQuery: () => directRulesState,
  useEffectiveAccessQuery: () => effectiveAccessState,
  useUpsertAccessRuleMutation: () => ({ mutateAsync: upsertRule, isPending: false }),
}))

function renderDialog() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  const result = render(
    <QueryClientProvider client={queryClient}>
      <StudentCoursePermissionsDialog
        open
        onOpenChange={vi.fn()}
        student={{ id: 7, fullName: 'Ada Aluna' }}
      />
    </QueryClientProvider>,
  )

  return { ...result, queryClient }
}

describe('StudentCoursePermissionsDialog', () => {
  afterEach(() => {
    cleanup()
    update.mockReset()
    create.mockReset()
    remove.mockReset()
    upsertRule.mockReset()
    resetStates()
  })

  it('shows only assigned courses first and exposes course management actions', () => {
    renderDialog()

    expect(screen.getByRole('dialog', { name: 'Cursos e permissões' })).toBeTruthy()
    expect(screen.getByText('Fundamentos de redes')).toBeTruthy()
    expect(screen.queryByText('Segurança')).toBeNull()
    expect(screen.getByRole('button', { name: 'Adicionar curso' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Configurar Fundamentos de redes' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Remover curso Fundamentos de redes' })).toBeTruthy()
  })

  it('uses a wide desktop dialog and keeps course actions adaptable on narrow screens', () => {
    renderDialog()

    const dialog = screen.getByRole('dialog', { name: 'Cursos e permissões' })
    expect(dialog.className).toContain('sm:max-w-6xl')
    expect(dialog.className).toContain('sm:max-h-[calc(100vh-3rem)]')

    const actions = screen.getByRole('button', { name: 'Configurar Fundamentos de redes' }).parentElement
    expect(actions?.className).toContain('max-sm:grid')
    expect(actions?.className).toContain('max-sm:grid-cols-2')
  })

  it('opens a searchable course selector without showing assigned courses again', () => {
    renderDialog()

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar curso' }))

    expect(screen.getByRole('textbox', { name: 'Buscar curso' })).toBeTruthy()
    expect(screen.getByText('Segurança')).toBeTruthy()
    expect(screen.queryByText('Fundamentos de redes')).toBeNull()
  })

  it('creates an association explicitly when adding a course', async () => {
    renderDialog()

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar curso' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Segurança' }))
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar curso' }))

    await waitFor(() => expect(create).toHaveBeenCalledWith({
      userId: 7,
      courseId: 11,
      permission: 'READ',
    }))
    expect(update).not.toHaveBeenCalled()
  })

  it('updates the course through its association when the course toggle changes', async () => {
    renderDialog()

    fireEvent.click(
      screen.getByRole('button', { name: 'Configurar Fundamentos de redes' }),
    )
    fireEvent.click(screen.getAllByRole('radio', { name: 'Total' })[0]!)

    await waitFor(() => expect(update).toHaveBeenCalledWith({
      userId: 7,
      courseId: 9,
      permission: 'FULL',
    }))
  })

  it('closes stale course configuration instead of reassigning a course removed by another admin', async () => {
    renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Configurar Fundamentos de redes' }))
    associationsState = { ...associationsState, data: [] }

    fireEvent.click(screen.getAllByRole('radio', { name: 'Total' })[0]!)

    expect(await screen.findByText('Este curso não está mais atribuído ao aluno.')).toBeTruthy()
    expect(screen.queryByText('Curso: Fundamentos de redes')).toBeNull()
    expect(update).not.toHaveBeenCalled()
  })

  it('closes course configuration when the update reports a removed association', async () => {
    update.mockRejectedValueOnce(new ApiError(409))
    const { queryClient } = renderDialog()
    queryClient.setQueryData(
      ['student-course-associations', 'list', 7],
      [assignedCourse],
    )
    fireEvent.click(screen.getByRole('button', { name: 'Configurar Fundamentos de redes' }))

    fireEvent.click(screen.getAllByRole('radio', { name: 'Total' })[0]!)

    expect(await screen.findByText('Este curso não está mais atribuído ao aluno.')).toBeTruthy()
    expect(screen.queryByText('Curso: Fundamentos de redes')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Configurar Fundamentos de redes' })).toBeNull()
    expect(queryClient.getQueryData(['student-course-associations', 'list', 7])).toEqual([])
  })

  it.each(['expired', 'future'])('inherits current permission when the direct rule is %s', (window) => {
    courseState = {
      data: { modules: [{ id: 31, title: 'Módulo 1', description: null }] },
      isPending: false,
    }
    const now = Date.now()
    directRulesState = {
      data: [{
        id: 1, userId: 7, resourceType: 'MODULE', resourceId: 31,
        capability: 'VIEW', effect: 'DENY',
        startsAt: window === 'future' ? new Date(now + 3600000).toISOString() : null,
        expiresAt: window === 'expired' ? new Date(now - 3600000).toISOString() : null,
        createdAt: new Date(now - 7200000).toISOString(), updatedAt: null,
      }],
      isPending: false,
      isError: false,
    }

    renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Configurar Fundamentos de redes' }))

    expect((screen.getAllByRole('radio', { name: 'Leitura' })[1] as HTMLInputElement).checked).toBe(true)
    expect(screen.getByText('Herdado do curso')).toBeTruthy()
    expect(screen.queryByText('Exceção direta parcial neste item.')).toBeNull()
  })

  it('blocks a child toggle when its direct or effective access cannot be loaded', () => {
    courseState = {
      data: {
        modules: [{ id: 31, title: 'Módulo 1', description: null }],
      },
      isPending: false,
    }
    directRulesState = { data: undefined, isPending: false, isError: true }

    renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Configurar Fundamentos de redes' }))

    expect(screen.getByText('Não foi possível carregar as regras de acesso deste item.')).toBeTruthy()
    expect(screen.getAllByRole('radio', { name: 'Leitura' })[1]?.matches(':disabled')).toBe(true)
    expect(screen.queryByText('Aplicando o padrão da plataforma')).toBeNull()
  })

  it('identifies a partial direct override instead of presenting it as inherited', () => {
    courseState = {
      data: {
        modules: [{ id: 31, title: 'Módulo 1', description: null }],
      },
      isPending: false,
    }
    directRulesState = {
      data: [
        { capability: 'VIEW', effect: 'INHERIT' },
        { capability: 'DOWNLOAD', effect: 'DENY' },
      ],
      isPending: false,
      isError: false,
    }

    renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Configurar Fundamentos de redes' }))

    expect(screen.getByText('Exceção direta parcial neste item.')).toBeTruthy()
  })

  it('blocks a child toggle when the course is no longer associated with the student', () => {
    courseState = {
      data: {
        modules: [{ id: 31, title: 'Módulo 1', description: null }],
      },
      isPending: false,
    }
    associationResponses = [
      associationsState,
      associationsState,
      { data: [], isPending: false, isError: false, isSuccess: true },
    ]

    renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Configurar Fundamentos de redes' }))

    expect(screen.getByText('Este curso não está mais atribuído ao aluno.')).toBeTruthy()
    expect(screen.getAllByRole('radio', { name: 'Leitura' })[1]?.matches(':disabled')).toBe(true)
  })

  it('blocks course selection when assigned courses cannot be loaded', () => {
    associationsState = {
      data: undefined,
      isPending: false,
      isError: true,
      isSuccess: false,
    }

    renderDialog()

    expect(screen.getByText('Não foi possível carregar os cursos atribuídos.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Adicionar curso' }).hasAttribute('disabled')).toBe(true)
  })
})
