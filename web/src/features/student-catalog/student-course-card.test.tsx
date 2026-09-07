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
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { StudentCatalogEmpty, StudentCatalogError, StudentCatalogLoading } from './student-catalog-states'
import { StudentCourseCard } from './student-course-card'
import type { StudentCourseSummary } from './student-catalog-types'

const course: StudentCourseSummary = {
  id: 14,
  title: 'Fundamentos seguros',
  description: 'Conteúdo permitido para a aluna.',
  moduleCount: 3,
}

function renderWithRouter(ui: ReactNode) {
  const rootRoute = createRootRoute({ component: Outlet })
  const pageRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => ui,
  })
  const courseRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/app/courses/$courseId',
    component: () => null,
  })
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ['/'] }),
    routeTree: rootRoute.addChildren([pageRoute, courseRoute]),
  })

  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

describe('student course card', () => {
  afterEach(cleanup)

  it('renders the course summary, module count and accessible course link', async () => {
    renderWithRouter(<StudentCourseCard course={course} />)

    expect(await screen.findByRole('heading', { name: course.title })).toBeTruthy()
    expect(screen.getByText(course.description!)).toBeTruthy()
    expect(screen.getByText('3 módulos')).toBeTruthy()
    expect(
      screen.getByRole('link', { name: 'Abrir curso' }).getAttribute('href'),
    ).toBe('/app/courses/14')
  })

  it('uses singular module copy and a safe description fallback', async () => {
    renderWithRouter(
      <StudentCourseCard
        course={{ ...course, description: null, moduleCount: 1 }}
      />,
    )

    expect(await screen.findByText('1 módulo')).toBeTruthy()
    expect(screen.getByText('Sem descrição disponível.')).toBeTruthy()
  })
})

describe('student catalog states', () => {
  afterEach(cleanup)

  it('renders an accessible loading state with card skeletons', () => {
    const { container } = render(<StudentCatalogLoading />)

    expect(screen.getByRole('status').textContent).toContain('Carregando cursos')
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(9)
  })

  it('renders safe error and empty messages', () => {
    const { rerender } = render(<StudentCatalogError />)
    expect(screen.getByRole('alert').textContent).toContain(
      'Não foi possível carregar seus cursos',
    )

    rerender(<StudentCatalogEmpty />)
    expect(screen.getByText('Nenhum curso disponível')).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
  })
})
