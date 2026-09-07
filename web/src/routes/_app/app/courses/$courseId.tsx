/* eslint-disable react/only-export-components */
import { createFileRoute, notFound, Outlet, useRouterState } from '@tanstack/react-router'
import {
  studentCourseQueryOptions,
  useStudentCourseQuery,
} from '@/features/student-catalog/student-catalog-queries'
import { StudentCourseDetailView } from '@/features/student-catalog/student-course-detail'
import {
  StudentCatalogNotFound,
  StudentCourseLoading,
} from '@/features/student-catalog/student-catalog-states'

function parseStudentCatalogRouteId(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null

  const id = Number(value)
  return Number.isSafeInteger(id) ? id : null
}

export const Route = createFileRoute('/_app/app/courses/$courseId')({
  loader: async ({ context, params }) => {
    const courseId = parseStudentCatalogRouteId(params.courseId)
    if (courseId === null) throw notFound()

    await context.queryClient.ensureQueryData(
      studentCourseQueryOptions(courseId),
    )
    return { courseId }
  },
  pendingComponent: StudentCourseLoading,
  pendingMs: 0,
  notFoundComponent: StudentCatalogNotFound,
  errorComponent: StudentCatalogNotFound,
  component: StudentCourseRoute,
})

function StudentCourseRoute() {
  const { courseId } = Route.useLoaderData()
  const courseQuery = useStudentCourseQuery(courseId)
  const isCoursePage = useRouterState({
    select: (state) => state.matches.at(-1)?.routeId === Route.id,
  })

  if (!isCoursePage) return <Outlet />

  if (courseQuery.isPending) {
    return <StudentCourseLoading />
  }
  if (courseQuery.isError || !courseQuery.data) {
    return <StudentCatalogNotFound />
  }

  return <StudentCourseDetailView course={courseQuery.data} />
}
