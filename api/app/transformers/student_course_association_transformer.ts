import type { StudentCourseAssociation } from '#services/student_course_association_service'
import { BaseTransformer } from '@adonisjs/core/transformers'
import CourseTransformer from '#transformers/course_transformer'

export default class StudentCourseAssociationTransformer extends BaseTransformer<StudentCourseAssociation> {
  toObject() {
    return {
      ...new CourseTransformer(this.resource.course).toObject(),
      permission: this.resource.permission,
      startsAt: this.resource.startsAt?.toUTC().toISO() ?? null,
      expiresAt: this.resource.expiresAt?.toUTC().toISO() ?? null,
      status: this.resource.status,
    }
  }
}
