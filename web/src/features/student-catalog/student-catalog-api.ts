import { apiClient } from '@/lib/api-client'
import type {
  StudentCourseDetail,
  StudentCourseSummary,
} from './student-catalog-types'

interface ApiEnvelope<T> {
  data: T
}

function requireData<T>(response: ApiEnvelope<T> | undefined): T {
  if (!response || response.data === undefined) {
    throw new Error('Student catalog API returned no data')
  }

  return response.data
}

export async function listStudentCourses(
  signal?: AbortSignal,
): Promise<StudentCourseSummary[]> {
  return requireData(
    await apiClient<ApiEnvelope<StudentCourseSummary[]>>('/student/courses', {
      signal,
    }),
  )
}

export async function getStudentCourse(
  courseId: number,
  signal?: AbortSignal,
): Promise<StudentCourseDetail> {
  return requireData(
    await apiClient<ApiEnvelope<StudentCourseDetail>>(
      `/student/courses/${courseId}`,
      { signal },
    ),
  )
}
