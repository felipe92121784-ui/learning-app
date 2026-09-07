import { queryOptions, useQuery } from '@tanstack/react-query'
import { getStudentCourse, listStudentCourses } from './student-catalog-api'

export const studentCatalogKeys = {
  all: ['student-catalog'] as const,
  courses: () => ['student-catalog', 'courses'] as const,
  detail: (courseId: number) =>
    ['student-catalog', 'courses', courseId] as const,
}

export function studentCoursesQueryOptions() {
  return queryOptions({
    queryKey: studentCatalogKeys.courses(),
    queryFn: ({ signal }) => listStudentCourses(signal),
  })
}

export function studentCourseQueryOptions(courseId: number) {
  return queryOptions({
    queryKey: studentCatalogKeys.detail(courseId),
    queryFn: ({ signal }) => getStudentCourse(courseId, signal),
  })
}

export function useStudentCoursesQuery() {
  return useQuery(studentCoursesQueryOptions())
}

export function useStudentCourseQuery(courseId: number) {
  return useQuery(studentCourseQueryOptions(courseId))
}
