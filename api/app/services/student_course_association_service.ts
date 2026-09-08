import AccessRule, { type AccessEffect } from '#models/access_rule'
import Course from '#models/course'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

export const COURSE_PERMISSIONS = ['NONE', 'READ', 'FULL'] as const
export type CoursePermission = (typeof COURSE_PERMISSIONS)[number]

export interface StudentCourseAssociation {
  course: Course
  permission: CoursePermission
}

export default class StudentCourseAssociationService {
  async list(userId: number): Promise<StudentCourseAssociation[]> {
    const courses = await Course.query()
      .whereExists((query) => {
        query.from('access_rules').whereColumn('access_rules.resource_id', 'courses.id').where({
          'access_rules.user_id': userId,
          'access_rules.resource_type': 'COURSE',
        })
      })
      .orderBy('courses.created_at', 'desc')
      .orderBy('courses.id', 'desc')

    if (courses.length === 0) {
      return []
    }

    const rules = await AccessRule.query()
      .where({ userId, resourceType: 'COURSE' })
      .whereIn(
        'resource_id',
        courses.map((course) => course.id)
      )

    const rulesByCourse = new Map<number, AccessRule[]>()
    for (const rule of rules) {
      rulesByCourse.set(rule.resourceId, [...(rulesByCourse.get(rule.resourceId) ?? []), rule])
    }

    return courses.map((course) => ({
      course,
      permission: permissionFromRules(rulesByCourse.get(course.id) ?? []),
    }))
  }

  async setPermission(
    userId: number,
    courseId: number,
    permission: CoursePermission
  ): Promise<StudentCourseAssociation> {
    const effects = effectsFor(permission)
    const course = await db.transaction(async (trx) => {
      const lockedCourse = await lockCourse(courseId, trx)
      const now = new Date()

      await trx
        .table('access_rules')
        .insert([
          courseRule(userId, lockedCourse.id, 'VIEW', effects.view, now),
          courseRule(userId, lockedCourse.id, 'DOWNLOAD', effects.download, now),
        ])
        .onConflict(['user_id', 'resource_type', 'resource_id', 'capability'])
        .merge(['effect', 'starts_at', 'expires_at', 'updated_at'])

      return lockedCourse
    })

    return { course, permission }
  }

  async remove(userId: number, courseId: number): Promise<void> {
    await db.transaction(async (trx) => {
      await lockCourse(courseId, trx)
      await trx.rawQuery(
        `
          DELETE FROM access_rules
          WHERE user_id = ?
            AND (
              (resource_type = 'COURSE' AND resource_id = ?)
              OR (resource_type = 'MODULE' AND resource_id IN (
                SELECT id FROM modules WHERE course_id = ?
              ))
              OR (resource_type = 'MATERIAL' AND resource_id IN (
                SELECT materials.id
                FROM materials
                INNER JOIN modules ON modules.id = materials.module_id
                WHERE modules.course_id = ?
              ))
            )
        `,
        [userId, courseId, courseId, courseId]
      )
    })
  }
}

function effectsFor(permission: CoursePermission): { view: AccessEffect; download: AccessEffect } {
  switch (permission) {
    case 'NONE':
      return { view: 'DENY', download: 'DENY' }
    case 'READ':
      return { view: 'ALLOW', download: 'DENY' }
    case 'FULL':
      return { view: 'ALLOW', download: 'ALLOW' }
  }
}

function permissionFromRules(rules: AccessRule[]): CoursePermission {
  const view = rules.find((rule) => rule.capability === 'VIEW')?.effect
  const download = rules.find((rule) => rule.capability === 'DOWNLOAD')?.effect

  if (view === 'ALLOW' && download === 'ALLOW') {
    return 'FULL'
  }
  if (view === 'ALLOW') {
    return 'READ'
  }
  return 'NONE'
}

function courseRule(
  userId: number,
  courseId: number,
  capability: 'VIEW' | 'DOWNLOAD',
  effect: AccessEffect,
  now: Date
) {
  return {
    user_id: userId,
    resource_type: 'COURSE',
    resource_id: courseId,
    capability,
    effect,
    starts_at: null,
    expires_at: null,
    created_at: now,
    updated_at: now,
  }
}

async function lockCourse(courseId: number, trx: TransactionClientContract) {
  return Course.query({ client: trx }).where('id', courseId).forUpdate().firstOrFail()
}
