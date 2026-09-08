import Course from '#models/course'
import User from '#models/user'
import StudentCourseAssociationService, {
  StudentCourseAssociationNotFoundError,
} from '#services/student_course_association_service'
import StudentCourseAssociationTransformer from '#transformers/student_course_association_transformer'
import { fieldError } from '#validators/access_rule'
import {
  studentCourseAssociationTargetValidator,
  studentCourseAssociationUserValidator,
  parseStudentCourseAssociationPeriod,
  updateStudentCourseAssociationValidator,
} from '#validators/student_course_association'
import type { HttpContext } from '@adonisjs/core/http'

export default class StudentCourseAssociationsController {
  private associations = new StudentCourseAssociationService()

  async index({ params, serialize }: HttpContext) {
    const { userId } = await studentCourseAssociationUserValidator.validate(params)
    await this.ensureStudent(userId)
    const associations = await this.associations.list(userId)

    return serialize(StudentCourseAssociationTransformer.transform(associations))
  }

  async create({ params, request, serialize }: HttpContext) {
    const target = await studentCourseAssociationTargetValidator.validate(params)
    const { permission, startsAt, expiresAt } = await request.validateUsing(
      updateStudentCourseAssociationValidator
    )
    const period = parseStudentCourseAssociationPeriod(startsAt, expiresAt)
    await this.ensureStudent(target.userId)
    await this.ensureCourse(target.courseId)
    const association = await this.associations.create(
      target.userId,
      target.courseId,
      permission,
      period
    )

    return serialize(StudentCourseAssociationTransformer.transform(association))
  }

  async update({ params, request, response, serialize }: HttpContext) {
    const target = await studentCourseAssociationTargetValidator.validate(params)
    const { permission, startsAt, expiresAt } = await request.validateUsing(
      updateStudentCourseAssociationValidator
    )
    const period = parseStudentCourseAssociationPeriod(startsAt, expiresAt)
    await this.ensureStudent(target.userId)
    await this.ensureCourse(target.courseId)

    try {
      const association = await this.associations.update(
        target.userId,
        target.courseId,
        permission,
        period
      )
      return serialize(StudentCourseAssociationTransformer.transform(association))
    } catch (error) {
      if (error instanceof StudentCourseAssociationNotFoundError) {
        return response.conflict({ message: error.message, code: 'COURSE_ASSOCIATION_NOT_FOUND' })
      }

      throw error
    }
  }

  async destroy({ params, response }: HttpContext) {
    const target = await studentCourseAssociationTargetValidator.validate(params)
    await this.ensureStudent(target.userId)
    await this.ensureCourse(target.courseId)
    await this.associations.remove(target.userId, target.courseId)

    return response.noContent()
  }

  private async ensureStudent(userId: number) {
    const user = await User.find(userId)
    if (!user || user.role !== 'STUDENT') {
      throw fieldError('userId', 'The userId field must identify an existing student')
    }
  }

  private async ensureCourse(courseId: number) {
    if (!(await Course.find(courseId))) {
      throw fieldError('courseId', 'The courseId field must identify an existing course')
    }
  }
}
