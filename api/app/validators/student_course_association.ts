import { COURSE_PERMISSIONS } from '#services/student_course_association_service'
import vine from '@vinejs/vine'

const maximumDatabaseId = 2_147_483_647
const routeId = () => vine.number().positive().max(maximumDatabaseId).withoutDecimals()

export const studentCourseAssociationUserValidator = vine.create({
  userId: routeId(),
})

export const studentCourseAssociationTargetValidator = vine.create({
  userId: routeId(),
  courseId: routeId(),
})

export const updateStudentCourseAssociationValidator = vine.create({
  permission: vine.enum(COURSE_PERMISSIONS),
})
