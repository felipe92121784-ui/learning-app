import type { CourseSummary } from '@/features/courses/courses-types'
import type { CoursePermission } from './course-permission'

export interface StudentCourseAssociation extends CourseSummary {
  permission: CoursePermission
}
