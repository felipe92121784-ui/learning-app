// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { cleanup, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { StudentCourseDetailView } from './student-course-detail'
import type { StudentCourseDetail } from './student-catalog-types'

const course = {
  id: 14,
  title: 'Fundamentos seguros',
  description: 'Uma trilha segura.',
  moduleCount: 3,
  originalStorageKey: 'originals/private/manual.pdf',
  modules: [
    {
      id: 21,
      title: 'Módulo bloqueado primeiro',
      description: null,
      availability: 'LOCKED',
      materials: [{
        id: 41,
        title: 'Manual bloqueado',
        description: null,
        type: 'PDF',
        availability: 'LOCKED',
        downloadUrl: 'https://minio.example.test/private/manual.pdf',
      }],
    },
    {
      id: 22,
      title: 'Módulo em preparação',
      description: 'Conteúdo chegando em breve.',
      availability: 'AVAILABLE',
      materials: [
        {
          id: 43,
          title: 'Imagem em processamento',
          description: null,
          type: 'IMAGE',
          availability: 'UNAVAILABLE',
          unavailableReason: 'PROCESSING',
        },
        {
          id: 44,
          title: 'Arquivo com falha',
          description: null,
          type: 'PDF',
          availability: 'UNAVAILABLE',
          unavailableReason: 'FAILED',
        },
      ],
    },
    {
      id: 23,
      title: 'Módulo disponível por último',
      description: null,
      availability: 'AVAILABLE',
      materials: [
        {
          id: 42,
          title: 'Manual liberado',
          description: 'Leia antes da atividade.',
          type: 'PDF',
          availability: 'AVAILABLE',
        },
        {
          id: 45,
          title: 'Pacote liberado',
          description: null,
          type: 'ZIP',
          availability: 'AVAILABLE',
        },
      ],
    },
  ],
} satisfies StudentCourseDetail & {
  originalStorageKey: string
  modules: Array<StudentCourseDetail['modules'][number] & {
    materials: Array<StudentCourseDetail['modules'][number]['materials'][number] & {
      downloadUrl?: string
    }>
  }>
}

function renderWithRouter(ui: ReactNode) {
  const rootRoute = createRootRoute({ component: Outlet })
  const pageRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => ui,
  })
  const portalRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/app',
    component: () => null,
  })
  const courseRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/app/courses/$courseId',
    component: () => null,
  })
  const materialRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/app/courses/$courseId/materials/$materialId',
    component: () => null,
  })
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ['/'] }),
    routeTree: rootRoute.addChildren([
      pageRoute,
      portalRoute,
      courseRoute,
      materialRoute,
    ]),
  })

  const result = render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return result
}

describe('student course detail', () => {
  afterEach(cleanup)

  it('renders modules in API order using accessible accordion controls', async () => {
    renderWithRouter(<StudentCourseDetailView course={course} />)

    const moduleButtons = await screen.findAllByRole('button', { name: /módulo/i })
    expect(moduleButtons.map((button) => button.textContent)).toEqual([
      expect.stringContaining('Módulo bloqueado primeiro'),
      expect.stringContaining('Módulo em preparação'),
      expect.stringContaining('Módulo disponível por último'),
    ])
    expect(moduleButtons[0]?.textContent).toContain('Módulo bloqueado')
  })

  it('keeps locked and unavailable materials non-interactive and links only available materials', async () => {
    renderWithRouter(<StudentCourseDetailView course={course} />)

    expect(await screen.findByText('Conteúdo bloqueado')).toBeTruthy()
    expect(screen.queryByRole('link', { name: /manual bloqueado/i })).toBeNull()
    expect(screen.getByText('Processando material')).toBeTruthy()
    expect(screen.queryByRole('link', { name: /imagem em processamento/i })).toBeNull()
    expect(screen.getByText('Material indisponível')).toBeTruthy()
    expect(screen.queryByRole('link', { name: /arquivo com falha/i })).toBeNull()

    expect(
      screen.getByRole('link', { name: 'Abrir Manual liberado' }).getAttribute('href'),
    ).toBe('/app/courses/14/materials/42')
    expect(
      screen.getByRole('link', { name: 'Abrir Pacote liberado' }).getAttribute('href'),
    ).toBe('/app/courses/14/materials/45')
  })

  it('labels material types, exposes breadcrumb navigation and ignores private-shaped extras', async () => {
    const { container } = renderWithRouter(<StudentCourseDetailView course={course} />)

    const breadcrumb = await screen.findByRole('navigation', { name: 'Breadcrumb' })
    expect(
      within(breadcrumb).getByRole('link', { name: 'Portal' }).getAttribute('href'),
    ).toBe('/app')
    expect(screen.getAllByLabelText('Tipo de material: PDF')).toHaveLength(3)
    expect(screen.getByLabelText('Tipo de material: IMAGE')).toBeTruthy()
    expect(screen.getByLabelText('Tipo de material: ZIP')).toBeTruthy()
    expect(container.innerHTML).not.toContain('originals/private/manual.pdf')
    expect(container.innerHTML).not.toContain('minio.example.test')
  })

  it('keeps a long valid material title accessible without placing it inside the mobile action', async () => {
    const longTitle = 'Introdução aos fundamentos e exercícios complementares para a formação continuada do estudante'
    const longTitleCourse: StudentCourseDetail = {
      ...course,
      modules: [{
        ...course.modules[2],
        materials: [{
          ...course.modules[2].materials[0],
          title: longTitle,
        }],
      }],
    }
    renderWithRouter(<StudentCourseDetailView course={longTitleCourse} />)

    const link = await screen.findByRole('link', { name: `Abrir ${longTitle}` })
    expect(link.textContent).toBe('Abrir material')
    expect(link.getAttribute('aria-label')).toBe(`Abrir ${longTitle}`)
  })
})
