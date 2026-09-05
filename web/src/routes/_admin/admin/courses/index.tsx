/* eslint-disable react/only-export-components */
import { createFileRoute, Link } from '@tanstack/react-router'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  coursesQueryOptions,
  useCoursesQuery,
} from '@/features/courses/courses-queries'
import type { CourseStatus } from '@/features/courses/courses-types'

export const Route = createFileRoute('/_admin/admin/courses/')({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(coursesQueryOptions()),
  errorComponent: CoursesRouteError,
  component: CoursesPage,
})

const statusLabels: Record<CourseStatus, string> = {
  DRAFT: 'Rascunho',
  PUBLISHED: 'Publicado',
  ARCHIVED: 'Arquivado',
}

function statusVariant(status: CourseStatus) {
  return status === 'PUBLISHED'
    ? 'secondary'
    : status === 'ARCHIVED'
      ? 'outline'
      : 'default'
}

function descriptionSummary(description: string | null) {
  if (!description) return 'Sem descrição.'
  return description.length > 160 ? `${description.slice(0, 157)}…` : description
}

function CoursesRouteError() {
  return (
    <main>
      <Alert variant="destructive">
        <AlertDescription>
          Não foi possível carregar os cursos. Tente novamente.
        </AlertDescription>
      </Alert>
    </main>
  )
}

function CoursesPage() {
  const coursesQuery = useCoursesQuery()

  return (
    <main>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">Administração</p>
          <h1 className="mt-2 text-3xl font-semibold">Cursos</h1>
          <p className="mt-3 text-slate-600">
            Organize os cursos e seus módulos de aprendizagem.
          </p>
        </div>
        <Button asChild>
          <Link to="/admin/courses/new">Novo curso</Link>
        </Button>
      </div>

      <div className="mt-8">
        {coursesQuery.isPending ? (
          <Card>
            <CardContent className="py-8 text-sm text-slate-600">
              Carregando cursos…
            </CardContent>
          </Card>
        ) : coursesQuery.isError ? (
          <Alert variant="destructive">
            <AlertDescription>
              Não foi possível carregar os cursos. Tente novamente.
            </AlertDescription>
          </Alert>
        ) : coursesQuery.data.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Nenhum curso criado</CardTitle>
              <CardDescription>
                Crie o primeiro curso para começar a estruturar o catálogo.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link to="/admin/courses/new">Novo curso</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {coursesQuery.data.map((course) => (
              <Card key={course.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <CardTitle>{course.title}</CardTitle>
                    <Badge variant={statusVariant(course.status)}>
                      {statusLabels[course.status]}
                    </Badge>
                  </div>
                  <CardDescription>
                    {descriptionSummary(course.description)}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button asChild size="sm" variant="outline">
                    <Link
                      params={{ courseId: String(course.id) }}
                      to="/admin/courses/$courseId"
                    >
                      Editar curso
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
