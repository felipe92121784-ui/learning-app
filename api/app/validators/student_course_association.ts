import {
  COURSE_PERMISSIONS,
  type StudentCourseAssociationPeriod,
} from '#services/student_course_association_service'
import { fieldError } from '#validators/access_rule'
import vine from '@vinejs/vine'
import { DateTime } from 'luxon'

const maximumDatabaseId = 2_147_483_647
const routeId = () => vine.number().positive().max(maximumDatabaseId).withoutDecimals()
const utcIsoDateTime = () =>
  vine.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/)

export const studentCourseAssociationUserValidator = vine.create({
  userId: routeId(),
})

export const studentCourseAssociationTargetValidator = vine.create({
  userId: routeId(),
  courseId: routeId(),
})

export const updateStudentCourseAssociationValidator = vine.create({
  permission: vine.enum(COURSE_PERMISSIONS),
  startsAt: utcIsoDateTime(),
  expiresAt: utcIsoDateTime(),
})

export function parseStudentCourseAssociationPeriod(
  startsAt: string,
  expiresAt: string
): StudentCourseAssociationPeriod {
  const parsedStartsAt = DateTime.fromISO(startsAt, { zone: 'utc' })
  const parsedExpiresAt = DateTime.fromISO(expiresAt, { zone: 'utc' })

  if (!parsedStartsAt.isValid) {
    throw fieldError('startsAt', 'The startsAt field must be a valid UTC ISO datetime')
  }
  if (!parsedExpiresAt.isValid) {
    throw fieldError('expiresAt', 'The expiresAt field must be a valid UTC ISO datetime')
  }
  if (parsedExpiresAt.toMillis() <= parsedStartsAt.toMillis()) {
    throw fieldError('expiresAt', 'The expiresAt field must be after startsAt')
  }

  return { startsAt: parsedStartsAt, expiresAt: parsedExpiresAt }
}
