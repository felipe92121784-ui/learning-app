import type { CourseSummary } from '@/features/courses/courses-types'
import type { EnrollmentStatus } from '@/features/users/enrollment-period'
import type { CoursePermission } from './course-permission'

export interface StudentCourseAssociation extends Omit<CourseSummary, 'status'> {
  permission: CoursePermission
  startsAt: string | null
  expiresAt: string | null
  status: EnrollmentStatus
}
