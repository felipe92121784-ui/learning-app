/* eslint-disable react/only-export-components */
import { createFileRoute, Outlet, useRouterState } from '@tanstack/react-router'
import { useAuth } from '@/features/auth/auth-provider'
import {
  StudentCatalogEmpty,
  StudentCatalogError,
  StudentCatalogLoading,
} from '@/features/student-catalog/student-catalog-states'
import { StudentCourseCard } from '@/features/student-catalog/student-course-card'
import { useStudentCoursesQuery } from '@/features/student-catalog/student-catalog-queries'

export const Route = createFileRoute('/_app/app')({
  component: AppPage,
})

function AppPage() {
  const isPortalHome = useRouterState({
    select: (state) => state.matches.at(-1)?.routeId === Route.id,
  })

  return isPortalHome ? <StudentPortalHome /> : <Outlet />
}

function StudentPortalHome() {
  const auth = useAuth()
  const coursesQuery = useStudentCoursesQuery()
  const firstName = auth.user?.fullName.trim().split(/\s+/)[0]

  return (
    <main className="space-y-8">
      <p className="text-sm font-medium text-slate-500">Portal</p>
      <header>
        {firstName ? (
          <p className="text-sm text-muted-foreground">Olá, {firstName}.</p>
        ) : null}
        <h1 className="mt-2 text-3xl font-semibold">Seus cursos</h1>
        <p className="mt-3 text-muted-foreground">
          Continue sua jornada de aprendizagem.
        </p>
      </header>

      {coursesQuery.isPending ? (
        <StudentCatalogLoading />
      ) : coursesQuery.isError ? (
        <StudentCatalogError />
      ) : coursesQuery.data.length === 0 ? (
        <StudentCatalogEmpty />
      ) : (
        <section aria-label="Cursos disponíveis" className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {coursesQuery.data.map((course) => (
            <StudentCourseCard course={course} key={course.id} />
          ))}
        </section>
      )}
    </main>
  )
}
