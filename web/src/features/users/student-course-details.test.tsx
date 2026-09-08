// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { listCourses, getCourse } from '@/features/courses/courses-api'
import { createStudentCourseAssociation, listStudentCourseAssociations } from '@/features/access-rules/student-course-associations-api'
import type { StudentCourseAssociation } from '@/features/access-rules/student-course-associations-types'
import type { ManagedUser } from './users-types'
import { StudentProfileCard } from './student-profile-card'
import { StudentCourseCards } from './student-course-cards'
import { AddStudentCourseDialog } from './add-student-course-dialog'
import { ApiError } from '@/lib/api-client'

vi.mock('@/features/courses/courses-api', () => ({ listCourses: vi.fn(), getCourse: vi.fn() }))
vi.mock('@/features/access-rules/student-course-associations-api', () => ({
  listStudentCourseAssociations: vi.fn(), createStudentCourseAssociation: vi.fn(),
  updateStudentCourseAssociation: vi.fn(), deleteStudentCourseAssociation: vi.fn(),
}))

const student: ManagedUser = {
  id: 7, fullName: 'Ada Aluna', email: 'ada@example.com', initials: 'AA',
  role: 'STUDENT', status: 'ACTIVE', createdAt: '2026-09-08T01:00:00.000Z', updatedAt: '2026-09-08T01:00:00.000Z',
}
const association: StudentCourseAssociation = {
  id: 9, title: 'Fundamentos de redes', description: 'Introdução', permission: 'READ',
  startsAt: '2026-09-08T03:00:00.000Z', expiresAt: '2027-09-09T02:59:59.999Z',
  status: 'ACTIVE', createdAt: '2026-09-08T12:00:00.000Z', updatedAt: null,
}
const available = { id: 11, title: 'Segurança', description: null, status: 'PUBLISHED' as const, createdAt: '2026-09-08T12:00:00.000Z', updatedAt: null }

function renderWithQueries(children: ReactNode) {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>{children}</QueryClientProvider>)
}

function renderAdd() {
  const onOpenChange = vi.fn()
  renderWithQueries(<AddStudentCourseDialog open onOpenChange={onOpenChange} studentId={student.id} associations={[association]} />)
  return onOpenChange
}

describe('student course details', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-08T15:00:00.000Z'))
    vi.mocked(listCourses).mockResolvedValue([{ ...available, id: 9, title: association.title }, available])
    vi.mocked(listStudentCourseAssociations).mockResolvedValue([association])
    vi.mocked(getCourse).mockResolvedValue({ ...available, id: 9, title: association.title, modules: [] })
    vi.mocked(createStudentCourseAssociation).mockResolvedValue({ ...association, id: 11, title: available.title })
  })
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.resetAllMocks() })

  it('shows profile identity, Brazilian registration date and assigned course count', () => {
    render(<StudentProfileCard student={student} courseCount={2} />)
    expect(screen.getByText('Ada Aluna')).toBeTruthy()
    expect(screen.getByText('ada@example.com')).toBeTruthy()
    expect(screen.getByText('AA')).toBeTruthy()
    expect(screen.getByText('Ativo')).toBeTruthy()
    expect(screen.getByText('07/09/2026')).toBeTruthy()
    expect(screen.getByText('2 cursos')).toBeTruthy()
  })

  it('keeps active, scheduled and expired courses visible with inclusive periods in a responsive grid', () => {
    renderWithQueries(<StudentCourseCards student={student} associations={[
      association,
      { ...association, id: 10, title: 'Curso agendado', status: 'SCHEDULED' },
      { ...association, id: 12, title: 'Curso expirado', status: 'EXPIRED' },
    ]} />)
    expect(screen.getByText('Ativo')).toBeTruthy()
    expect(screen.getByText('Agendado')).toBeTruthy()
    expect(screen.getByText('Expirado')).toBeTruthy()
    expect(screen.getAllByText('08/09/2026 a 08/09/2027')).toHaveLength(3)
    expect(screen.getAllByText('Leitura')).toHaveLength(3)
    const grid = screen.getByRole('list', { name: 'Cursos atribuídos' })
    expect(grid.className).toContain('grid-cols-1')
    expect(grid.className).toContain('lg:grid-cols-2')
  })

  it('opens only the permission tree of the chosen course', async () => {
    vi.mocked(listStudentCourseAssociations).mockResolvedValue([association, { ...association, id: 11, title: 'Segurança' }])
    renderWithQueries(<StudentCourseCards student={student} associations={[association, { ...association, id: 11, title: 'Segurança' }]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Gerenciar permissões de Fundamentos de redes' }))
    const dialog = await screen.findByRole('dialog', { name: 'Fundamentos de redes' })
    expect(await within(dialog).findByRole('heading', { name: 'Fundamentos de redes' })).toBeTruthy()
    expect(within(dialog).queryByText('Segurança')).toBeNull()
    expect(within(dialog).queryByRole('button', { name: 'Adicionar curso' })).toBeNull()
    expect(getCourse).toHaveBeenCalledWith(9)
    expect(getCourse).not.toHaveBeenCalledWith(11)
  })

  it('defaults dates to today and one year, excludes assigned courses and searches available courses', async () => {
    renderAdd()
    expect((screen.getByLabelText('Data de início') as HTMLInputElement).value).toBe('2026-09-08')
    expect((screen.getByLabelText('Data de término') as HTMLInputElement).value).toBe('2027-09-08')
    expect(await screen.findByRole('radio', { name: 'Segurança' })).toBeTruthy()
    expect(screen.queryByRole('radio', { name: /Fundamentos/ })).toBeNull()
    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar curso' }), { target: { value: 'inexistente' } })
    expect(screen.queryByRole('radio', { name: 'Segurança' })).toBeNull()
    expect(screen.getByText('Nenhum curso disponível.')).toBeTruthy()
  })

  it('submits selected permission and inclusive São Paulo dates through the association API', async () => {
    const onOpenChange = renderAdd()
    fireEvent.click(await screen.findByRole('radio', { name: 'Segurança' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Total' }))
    fireEvent.change(screen.getByLabelText('Data de início'), { target: { value: '2026-10-01' } })
    fireEvent.change(screen.getByLabelText('Data de término'), { target: { value: '2026-10-01' } })
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar curso' }))
    await waitFor(() => expect(createStudentCourseAssociation).toHaveBeenCalledWith(7, 11, 'FULL', {
      startsAt: '2026-10-01T03:00:00.000Z', expiresAt: '2026-10-02T02:59:59.999Z',
    }))
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })

  it('prevents an end date earlier than the start from reaching the API', async () => {
    renderAdd()
    fireEvent.click(await screen.findByRole('radio', { name: 'Segurança' }))
    fireEvent.change(screen.getByLabelText('Data de término'), { target: { value: '2026-09-07' } })
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar curso' }))
    expect(screen.getByRole('alert').textContent).toContain('A data de término não pode ser anterior à data de início.')
    expect(createStudentCourseAssociation).not.toHaveBeenCalled()
  })

  it('explains a duplicate enrollment conflict and keeps the form open', async () => {
    vi.mocked(createStudentCourseAssociation).mockRejectedValue(new ApiError(409))
    const onOpenChange = renderAdd()
    fireEvent.click(await screen.findByRole('radio', { name: 'Segurança' }))
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar curso' }))
    expect(await screen.findByText('Este curso já foi atribuído ao aluno. A lista foi atualizada.')).toBeTruthy()
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('keeps the form open with an actionable error after a failed assignment', async () => {
    vi.mocked(createStudentCourseAssociation).mockRejectedValue(new Error('Unavailable'))
    const onOpenChange = renderAdd()
    fireEvent.click(await screen.findByRole('radio', { name: 'Segurança' }))
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar curso' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(onOpenChange).not.toHaveBeenCalled()
  })
})
