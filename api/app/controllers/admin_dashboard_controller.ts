import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import type { HttpContext } from '@adonisjs/core/http'

const RECENT_ACTIVITY_LIMIT = 6
const TOP_MATERIALS_LIMIT = 5

export default class AdminDashboardController {
  async show({ serialize }: HttpContext) {
    const since = DateTime.utc().minus({ days: 30 }).toSQL()!
    const now = DateTime.utc().toSQL()!

    const [
      courses,
      publishedCourses,
      students,
      enrollments,
      activities,
      recentActivities,
      topMaterials,
    ] = await Promise.all([
      db.from('courses').count('* as total'),
      db.from('courses').where('status', 'PUBLISHED').count('* as total'),
      db.from('users').where({ role: 'STUDENT', status: 'ACTIVE' }).count('* as total'),
      db
        .from('access_rules as rules')
        .join('users', 'users.id', 'rules.user_id')
        .where({
          'rules.resource_type': 'COURSE',
          'rules.capability': 'VIEW',
          'rules.effect': 'ALLOW',
          'users.role': 'STUDENT',
          'users.status': 'ACTIVE',
        })
        .where('rules.starts_at', '<=', now)
        .where('rules.expires_at', '>', now)
        .count('* as total'),
      db
        .from('access_logs')
        .whereIn('action', ['VIEW_MATERIAL', 'DOWNLOAD_MATERIAL'])
        .where('created_at', '>=', since)
        .count('* as total'),
      db
        .from('access_logs as logs')
        .join('users', 'users.id', 'logs.user_id')
        .join('materials', 'materials.id', 'logs.material_id')
        .whereIn('logs.action', ['VIEW_MATERIAL', 'DOWNLOAD_MATERIAL'])
        .select([
          'logs.id as id',
          'logs.action as action',
          'logs.created_at as occurredAt',
          'users.full_name as fullName',
          'materials.title as materialTitle',
        ])
        .orderBy('logs.created_at', 'desc')
        .orderBy('logs.id', 'desc')
        .limit(RECENT_ACTIVITY_LIMIT),
      db
        .from('access_logs as logs')
        .join('materials', 'materials.id', 'logs.material_id')
        .join('modules', 'modules.id', 'materials.module_id')
        .join('courses', 'courses.id', 'modules.course_id')
        .whereIn('logs.action', ['VIEW_MATERIAL', 'DOWNLOAD_MATERIAL'])
        .where('logs.created_at', '>=', since)
        .select([
          'materials.id as materialId',
          'materials.title as materialTitle',
          'courses.title as courseTitle',
        ])
        .count('* as accessCount')
        .groupBy(['materials.id', 'materials.title', 'courses.id', 'courses.title'])
        .orderBy('accessCount', 'desc')
        .orderBy('materials.id', 'asc')
        .limit(TOP_MATERIALS_LIMIT),
    ])

    return serialize({
      summary: {
        totalCourses: count(courses[0]),
        publishedCourses: count(publishedCourses[0]),
        activeStudents: count(students[0]),
        activeEnrollments: count(enrollments[0]),
        materialActivitiesLast30Days: count(activities[0]),
      },
      recentActivities: recentActivities.map((activity) => ({
        id: Number(activity.id),
        action: activity.action,
        occurredAt: activity.occurredAt,
        fullName: activity.fullName,
        materialTitle: activity.materialTitle,
      })),
      topMaterials: topMaterials.map((material) => ({
        materialId: Number(material.materialId),
        materialTitle: material.materialTitle,
        courseTitle: material.courseTitle,
        accessCount: count(material, 'accessCount'),
      })),
    })
  }
}

function count(row: unknown, key = 'total') {
  if (!row || typeof row !== 'object') return 0
  return Number((row as Record<string, unknown>)[key] ?? 0)
}
