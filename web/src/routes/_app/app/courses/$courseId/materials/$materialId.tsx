/* eslint-disable react/only-export-components */
import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { ProtectedMaterialViewer } from '@/features/protected-viewer/protected-material-viewer'
import {
  studentCourseQueryOptions,
  useStudentCourseQuery,
} from '@/features/student-catalog/student-catalog-queries'
import {
  StudentCatalogNotFound,
  StudentCourseLoading,
} from '@/features/student-catalog/student-catalog-states'

function parseStudentCatalogRouteId(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null

  const id = Number(value)
  return Number.isSafeInteger(id) ? id : null
}

export const Route = createFileRoute(
  '/_app/app/courses/$courseId/materials/$materialId',
)({
  loader: async ({ context, params }) => {
    const courseId = parseStudentCatalogRouteId(params.courseId)
    const materialId = parseStudentCatalogRouteId(params.materialId)
    if (courseId === null || materialId === null) throw notFound()

    const course = await context.queryClient.ensureQueryData(
      studentCourseQueryOptions(courseId),
    )
    const material = course.modules
      .flatMap((module) => module.materials)
      .find((candidate) => candidate.id === materialId)

    if (!material || material.availability !== 'AVAILABLE') throw notFound()

    return { courseId, materialId: material.id }
  },
  pendingComponent: StudentCourseLoading,
  pendingMs: 0,
  notFoundComponent: StudentCatalogNotFound,
  errorComponent: StudentCatalogNotFound,
  component: StudentMaterialRoute,
})

function StudentMaterialRoute() {
  const { courseId, materialId } = Route.useLoaderData()
  const courseQuery = useStudentCourseQuery(courseId)

  if (courseQuery.isPending) return <StudentCourseLoading />
  if (courseQuery.isError || !courseQuery.data) {
    return <StudentCatalogNotFound />
  }

  const material = courseQuery.data.modules
    .flatMap((module) => module.materials)
    .find((candidate) => candidate.id === materialId)

  if (!material || material.availability !== 'AVAILABLE') {
    return <StudentCatalogNotFound />
  }

  return (
    <main className="space-y-8">
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <ol className="flex flex-wrap items-center gap-2">
          <li>
            <Link className="hover:text-foreground hover:underline" to="/app">
              Portal
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link
              className="hover:text-foreground hover:underline"
              params={{ courseId: String(courseId) }}
              to="/app/courses/$courseId"
            >
              {courseQuery.data.title}
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="text-foreground">
            {material.title}
          </li>
        </ol>
      </nav>

      <header>
        <p className="text-sm font-medium text-muted-foreground">Material</p>
        <h1 className="mt-2 text-3xl font-semibold">{material.title}</h1>
      </header>

      <ProtectedMaterialViewer materialId={material.id} />
    </main>
  )
}
