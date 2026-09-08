import { apiClient } from '@/lib/api-client'
import type { CoursePermission } from './course-permission'
import type { StudentCourseAssociation } from './student-course-associations-types'

interface ApiEnvelope<T> {
  data: T
}

function requireData<T>(response: ApiEnvelope<T> | undefined): T {
  if (!response || response.data === undefined) {
    throw new Error('Student course associations API returned no data')
  }

  return response.data
}

export async function listStudentCourseAssociations(
  userId: number,
): Promise<StudentCourseAssociation[]> {
  return requireData(
    await apiClient<ApiEnvelope<StudentCourseAssociation[]>>(`/users/${userId}/courses`),
  )
}

export async function updateStudentCourseAssociation(
  userId: number,
  courseId: number,
  permission: CoursePermission,
): Promise<StudentCourseAssociation> {
  return requireData(
    await apiClient<ApiEnvelope<StudentCourseAssociation>>(
      `/users/${userId}/courses/${courseId}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permission }),
      },
    ),
  )
}

export async function deleteStudentCourseAssociation(
  userId: number,
  courseId: number,
): Promise<void> {
  await apiClient<void>(`/users/${userId}/courses/${courseId}`, {
    method: 'DELETE',
  })
}
