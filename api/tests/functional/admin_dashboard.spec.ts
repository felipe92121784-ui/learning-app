import AccessLog from '#models/access_log'
import AccessRule from '#models/access_rule'
import Course from '#models/course'
import CourseModule from '#models/course_module'
import Material from '#models/material'
import User from '#models/user'
import { csrfSessionFrom, postLogin } from '../helpers/csrf.js'
import { DateTime } from 'luxon'
import testUtils from '@adonisjs/core/services/test_utils'
import type { ApiClient } from '@japa/api-client'
import { test } from '@japa/runner'

const password = 'dashboard-password-123'

async function login(client: ApiClient, user: User) {
  const response = await postLogin(client, { email: user.email, password })
  response.assertStatus(200)
  return csrfSessionFrom(response)
}

test.group('Administrative dashboard', (group) => {
  let admin: User
  let student: User
  let cleanupDatabase: () => Promise<void>

  group.each.setup(async () => {
    cleanupDatabase = await testUtils.db().truncate()
    await cleanupDatabase()
    ;[admin, student] = await User.createMany([
      {
        fullName: 'Ada Admin',
        email: 'ada.dashboard@example.test',
        password,
        role: 'ADMIN',
        status: 'ACTIVE',
      },
      {
        fullName: 'Sam Student',
        email: 'sam.dashboard@example.test',
        password,
        role: 'STUDENT',
        status: 'ACTIVE',
      },
    ])
  })

  group.each.teardown(async () => cleanupDatabase())

  test('shows real summary, recent activity, and material ranking to administrators', async ({
    client,
  }) => {
    const published = await Course.create({
      title: 'Curso publicado',
      description: null,
      status: 'PUBLISHED',
    })
    await Course.create({ title: 'Curso rascunho', description: null, status: 'DRAFT' })
    const module = await CourseModule.create({
      courseId: published.id,
      title: 'Módulo',
      description: null,
      position: 0,
    })
    const material = await Material.create({
      moduleId: module.id,
      title: 'Manual principal',
      description: null,
      type: 'PDF',
      storageKey: 'originals/dashboard-manual.pdf',
      originalFilename: 'manual.pdf',
      mimeType: 'application/pdf',
      size: 100,
      position: 0,
      processingStatus: 'READY',
      processingErrorCode: null,
    })
    await AccessRule.create({
      userId: student.id,
      resourceType: 'COURSE',
      resourceId: published.id,
      capability: 'VIEW',
      effect: 'ALLOW',
      startsAt: DateTime.utc().minus({ days: 1 }),
      expiresAt: DateTime.utc().plus({ days: 30 }),
    })
    await AccessLog.createMany([
      {
        userId: student.id,
        materialId: material.id,
        action: 'VIEW_MATERIAL',
        ipAddress: null,
        userAgent: null,
      },
      {
        userId: student.id,
        materialId: material.id,
        action: 'DOWNLOAD_MATERIAL',
        ipAddress: null,
        userAgent: null,
      },
    ])

    const session = await login(client, admin)
    const response = await client.get('/api/v1/dashboard').cookie(session.name, session.value)

    response.assertStatus(200)
    response.assertBodyContains({
      data: {
        summary: {
          totalCourses: 2,
          publishedCourses: 1,
          activeStudents: 1,
          activeEnrollments: 1,
          materialActivitiesLast30Days: 2,
        },
        recentActivities: [{ fullName: student.fullName, materialTitle: material.title }],
        topMaterials: [
          {
            materialId: material.id,
            materialTitle: material.title,
            courseTitle: published.title,
            accessCount: 2,
          },
        ],
      },
    })
  })

  test('does not expose administrative metrics to students', async ({ client }) => {
    const session = await login(client, student)
    const response = await client.get('/api/v1/dashboard').cookie(session.name, session.value)
    response.assertStatus(403)
  })
})
