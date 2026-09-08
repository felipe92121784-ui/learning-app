import AccessRule from '#models/access_rule'
import Course from '#models/course'
import CourseModule from '#models/course_module'
import Material from '#models/material'
import User from '#models/user'
import AccessControlService from '#services/access_control_service'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import { csrfSessionFrom, postLogin, withCsrf } from '../helpers/csrf.js'
import type { ApiClient } from '@japa/api-client'

const password = 'access-rule-password-123'

async function login(client: ApiClient, user: User) {
  const response = await postLogin(client, { email: user.email, password })
  response.assertStatus(200)
  return csrfSessionFrom(response)
}

test.group('Access rule persistence constraints', (group) => {
  let cleanupDatabase: () => Promise<void>

  group.each.setup(async () => {
    cleanupDatabase = await testUtils.db().truncate()
    await cleanupDatabase()
  })

  group.each.teardown(async () => {
    await cleanupDatabase()
  })

  test('enforces one rule per user, resource, and capability', async ({ assert }) => {
    const student = await User.create({
      email: 'student@example.test',
      password: 'student-password',
      role: 'STUDENT',
      status: 'ACTIVE',
    })
    const course = await Course.create({ title: 'Unique rules course' })
    const attributes = {
      userId: student.id,
      resourceType: 'COURSE' as const,
      resourceId: course.id,
      capability: 'VIEW' as const,
      effect: 'ALLOW' as const,
    }

    await AccessRule.create(attributes)
    await assert.rejects(() => AccessRule.create({ ...attributes, effect: 'DENY' }))
    await AccessRule.create({ ...attributes, capability: 'DOWNLOAD' })
  })

  test('rejects a time window that expires at or before it starts', async ({ assert }) => {
    const student = await User.create({
      email: 'student@example.test',
      password: 'student-password',
      role: 'STUDENT',
      status: 'ACTIVE',
    })
    const course = await Course.create({ title: 'Date checks course' })
    const startsAt = DateTime.fromISO('2026-09-06T12:00:00.000Z', { zone: 'utc' })

    await assert.rejects(() =>
      AccessRule.create({
        userId: student.id,
        resourceType: 'COURSE',
        resourceId: course.id,
        capability: 'VIEW',
        effect: 'ALLOW',
        startsAt,
        expiresAt: startsAt,
      })
    )
    await assert.rejects(() =>
      AccessRule.create({
        userId: student.id,
        resourceType: 'COURSE',
        resourceId: course.id,
        capability: 'VIEW',
        effect: 'ALLOW',
        startsAt,
        expiresAt: startsAt.minus({ millisecond: 1 }),
      })
    )
  })

  test('rejects an unknown rule capability', async ({ assert }) => {
    const student = await User.create({
      email: 'student@example.test',
      password: 'student-password',
      role: 'STUDENT',
      status: 'ACTIVE',
    })
    const course = await Course.create({ title: 'Enum checks course' })

    await assert.rejects(() =>
      AccessRule.create({
        userId: student.id,
        resourceType: 'COURSE',
        resourceId: course.id,
        capability: 'EDIT' as never,
        effect: 'ALLOW',
      })
    )
  })

  test('rejects rules whose polymorphic target does not exist', async ({ assert }) => {
    const student = await User.create({
      email: 'student@example.test',
      password: 'student-password',
      role: 'STUDENT',
      status: 'ACTIVE',
    })

    for (const resourceType of ['COURSE', 'MODULE', 'MATERIAL'] as const) {
      await assert.rejects(() =>
        AccessRule.create({
          userId: student.id,
          resourceType,
          resourceId: 999999,
          capability: 'VIEW',
          effect: 'ALLOW',
        })
      )
    }
  })

  test('rejects an update that changes a rule target to a nonexistent resource', async ({
    assert,
  }) => {
    const student = await User.create({
      email: 'student@example.test',
      password: 'student-password',
      role: 'STUDENT',
      status: 'ACTIVE',
    })
    const course = await Course.create({ title: 'Update target checks course' })
    const rule = await AccessRule.create({
      userId: student.id,
      resourceType: 'COURSE',
      resourceId: course.id,
      capability: 'VIEW',
      effect: 'ALLOW',
    })

    await assert.rejects(() =>
      AccessRule.query().where('id', rule.id).update({ resourceId: 999999 })
    )
    const unchangedRule = await AccessRule.findOrFail(rule.id)
    assert.equal(unchangedRule.resourceId, course.id)
  })

  test('holds a target key-share lock until an access-rule write transaction completes', async ({
    assert,
  }) => {
    const student = await User.create({
      email: 'student@example.test',
      password: 'student-password',
      role: 'STUDENT',
      status: 'ACTIVE',
    })
    const course = await Course.create({ title: 'Target lock course' })
    const writer = await db.transaction()

    try {
      await AccessRule.create(
        {
          userId: student.id,
          resourceType: 'COURSE',
          resourceId: course.id,
          capability: 'VIEW',
          effect: 'ALLOW',
        },
        { client: writer }
      )

      await assert.rejects(() =>
        db.transaction(async (deleter) => {
          await deleter.rawQuery("SET LOCAL lock_timeout = '100ms'")
          await Course.query({ client: deleter }).where('id', course.id).delete()
        })
      )
    } finally {
      await writer.rollback()
    }
  })

  test('removes rules when their Course, Module, or Material target is deleted', async ({
    assert,
  }) => {
    const student = await User.create({
      email: 'student@example.test',
      password: 'student-password',
      role: 'STUDENT',
      status: 'ACTIVE',
    })
    const course = await Course.create({ title: 'Deletion cleanup course' })
    const module = await CourseModule.create({
      courseId: course.id,
      title: 'Deletion cleanup module',
      position: 0,
    })
    const material = await Material.create({
      moduleId: module.id,
      title: 'Deletion cleanup material',
      type: 'PDF',
      storageKey: 'originals/deletion-cleanup.pdf',
      originalFilename: 'deletion-cleanup.pdf',
      mimeType: 'application/pdf',
      size: 10,
      position: 0,
      processingStatus: 'READY',
    })
    const [courseRule, moduleRule, materialRule] = await AccessRule.createMany([
      {
        userId: student.id,
        resourceType: 'COURSE',
        resourceId: course.id,
        capability: 'VIEW',
        effect: 'ALLOW',
      },
      {
        userId: student.id,
        resourceType: 'MODULE',
        resourceId: module.id,
        capability: 'VIEW',
        effect: 'ALLOW',
      },
      {
        userId: student.id,
        resourceType: 'MATERIAL',
        resourceId: material.id,
        capability: 'VIEW',
        effect: 'ALLOW',
      },
    ])

    await material.delete()
    assert.isNull(await AccessRule.find(materialRule.id))

    await module.delete()
    assert.isNull(await AccessRule.find(moduleRule.id))

    await course.delete()
    assert.isNull(await AccessRule.find(courseRule.id))
  })

  test('removes Course, Module, and Material rules when a Course cascade deletes descendants', async ({
    assert,
  }) => {
    const student = await User.create({
      email: 'student@example.test',
      password: 'student-password',
      role: 'STUDENT',
      status: 'ACTIVE',
    })
    const course = await Course.create({ title: 'Course cascade cleanup' })
    const module = await CourseModule.create({
      courseId: course.id,
      title: 'Course cascade module',
      position: 0,
    })
    const material = await Material.create({
      moduleId: module.id,
      title: 'Course cascade material',
      type: 'PDF',
      storageKey: 'originals/course-cascade.pdf',
      originalFilename: 'course-cascade.pdf',
      mimeType: 'application/pdf',
      size: 10,
      position: 0,
      processingStatus: 'READY',
    })
    const [courseRule, moduleRule, materialRule] = await AccessRule.createMany([
      {
        userId: student.id,
        resourceType: 'COURSE',
        resourceId: course.id,
        capability: 'VIEW',
        effect: 'ALLOW',
      },
      {
        userId: student.id,
        resourceType: 'MODULE',
        resourceId: module.id,
        capability: 'VIEW',
        effect: 'ALLOW',
      },
      {
        userId: student.id,
        resourceType: 'MATERIAL',
        resourceId: material.id,
        capability: 'VIEW',
        effect: 'ALLOW',
      },
    ])

    await course.delete()

    assert.isNull(await CourseModule.find(module.id))
    assert.isNull(await Material.find(material.id))
    assert.isNull(await AccessRule.find(courseRule.id))
    assert.isNull(await AccessRule.find(moduleRule.id))
    assert.isNull(await AccessRule.find(materialRule.id))
  })
})

test.group('Administrative access rule API', (group) => {
  let admin: User
  let student: User
  let course: Course
  let module: CourseModule
  let material: Material
  let cleanupDatabase: () => Promise<void>

  group.each.setup(async () => {
    cleanupDatabase = await testUtils.db().truncate()
    await cleanupDatabase()

    ;[admin, student] = await User.createMany([
      {
        fullName: 'Ada Admin',
        email: 'ada.access-rules@example.test',
        password,
        role: 'ADMIN',
        status: 'ACTIVE',
      },
      {
        fullName: 'Sam Student',
        email: 'sam.access-rules@example.test',
        password,
        role: 'STUDENT',
        status: 'ACTIVE',
      },
    ])
    course = await Course.create({ title: 'Access rules course' })
    module = await CourseModule.create({
      courseId: course.id,
      title: 'Access rules module',
      position: 0,
    })
    material = await Material.create({
      moduleId: module.id,
      title: 'Private access rules material',
      type: 'PDF',
      storageKey: 'originals/private-access-rules.pdf',
      originalFilename: 'private-access-rules.pdf',
      mimeType: 'application/pdf',
      size: 10,
      position: 0,
      processingStatus: 'READY',
    })
  })

  group.each.teardown(async () => {
    await cleanupDatabase()
  })

  test('an admin upserts, lists, and revokes a time-bounded direct rule using safe fields', async ({
    assert,
    client,
  }) => {
    await AccessRule.createMany([
      {
        userId: student.id,
        resourceType: 'COURSE',
        resourceId: course.id,
        capability: 'VIEW',
        effect: 'ALLOW',
      },
      {
        userId: student.id,
        resourceType: 'COURSE',
        resourceId: course.id,
        capability: 'DOWNLOAD',
        effect: 'DENY',
      },
    ])
    const session = await login(client, admin)
    const startsAt = '2026-09-06T12:00:00.000Z'
    const expiresAt = '2026-09-07T12:00:00.000Z'
    const payload = {
      userId: student.id,
      resourceType: 'MATERIAL',
      resourceId: material.id,
      capability: 'VIEW',
      effect: 'ALLOW',
      startsAt,
      expiresAt,
    }

    const createResponse = await withCsrf(client.put('/api/v1/access-rules'), session).unsafeJson(
      payload
    )
    createResponse.assertStatus(200)
    createResponse.assertBodyContains({
      data: {
        userId: student.id,
        resourceType: 'MATERIAL',
        resourceId: material.id,
        capability: 'VIEW',
        effect: 'ALLOW',
      },
    })
    assert.equal(
      DateTime.fromISO(createResponse.body().data.startsAt).toMillis(),
      DateTime.fromISO(startsAt).toMillis()
    )
    assert.equal(
      DateTime.fromISO(createResponse.body().data.expiresAt).toMillis(),
      DateTime.fromISO(expiresAt).toMillis()
    )
    assert.notProperty(createResponse.body().data, 'storageKey')
    assert.notProperty(createResponse.body().data, 'url')

    const updateResponse = await withCsrf(client.put('/api/v1/access-rules'), session).unsafeJson({
      ...payload,
      effect: 'DENY',
      startsAt: null,
      expiresAt: null,
    })
    updateResponse.assertStatus(200)
    updateResponse.assertBodyContains({ data: { effect: 'DENY', startsAt: null, expiresAt: null } })
    assert.equal(updateResponse.body().data.id, createResponse.body().data.id)

    const indexResponse = await client
      .get(
        `/api/v1/access-rules?userId=${student.id}&resourceType=MATERIAL&resourceId=${material.id}`
      )
      .cookie(session.name, session.value)
    indexResponse.assertStatus(200)
    indexResponse.assertBodyContains({
      data: [{ id: createResponse.body().data.id, effect: 'DENY' }],
    })
    assert.notProperty(indexResponse.body().data[0], 'storageKey')

    const deleteResponse = await withCsrf(
      client.delete(`/api/v1/access-rules/${createResponse.body().data.id}`),
      session
    )
    deleteResponse.assertStatus(204)
    assert.isNull(await AccessRule.find(createResponse.body().data.id))
  })

  test('rejects module and material rules when the student is not associated with their course', async ({
    client,
  }) => {
    const session = await login(client, admin)

    for (const target of [
      { resourceType: 'MODULE' as const, resourceId: module.id },
      { resourceType: 'MATERIAL' as const, resourceId: material.id },
    ]) {
      const response = await withCsrf(client.put('/api/v1/access-rules'), session).unsafeJson({
        userId: student.id,
        ...target,
        capability: 'VIEW',
        effect: 'ALLOW',
        startsAt: null,
        expiresAt: null,
      })

      response.assertStatus(422)
    }
  })

  test('only an authenticated admin with CSRF can administer rules or inspect effective access', async ({
    client,
  }) => {
    const studentSession = await login(client, student)
    const adminSession = await login(client, admin)
    const payload = {
      userId: student.id,
      resourceType: 'COURSE',
      resourceId: course.id,
      capability: 'VIEW',
      effect: 'ALLOW',
      startsAt: null,
      expiresAt: null,
    }

    const guestIndex = await client.get('/api/v1/access-rules')
    const guestEffective = await client.get(
      `/api/v1/access-rules/effective?userId=${student.id}&resourceType=COURSE&resourceId=${course.id}`
    )
    const studentIndex = await client
      .get('/api/v1/access-rules')
      .cookie(studentSession.name, studentSession.value)
    const studentUpsert = await withCsrf(
      client.put('/api/v1/access-rules'),
      studentSession
    ).unsafeJson(payload)
    const missingCsrf = await client
      .put('/api/v1/access-rules')
      .redirects(0)
      .cookie(adminSession.name, adminSession.value)
      .unsafeJson(payload)

    guestIndex.assertStatus(401)
    guestEffective.assertStatus(401)
    studentIndex.assertStatus(403)
    studentUpsert.assertStatus(403)
    missingCsrf.assertStatus(302)
  })

  test('rejects non-student users, invalid resources, and invalid UTC date windows', async ({
    client,
  }) => {
    const session = await login(client, admin)
    const basePayload = {
      userId: student.id,
      resourceType: 'COURSE',
      resourceId: course.id,
      capability: 'VIEW',
      effect: 'ALLOW',
      startsAt: null,
      expiresAt: null,
    }

    const adminTarget = await withCsrf(client.put('/api/v1/access-rules'), session).unsafeJson({
      ...basePayload,
      userId: admin.id,
    })
    const unknownStudent = await withCsrf(client.put('/api/v1/access-rules'), session).unsafeJson({
      ...basePayload,
      userId: 999999,
    })
    const unknownResource = await withCsrf(client.put('/api/v1/access-rules'), session).unsafeJson({
      ...basePayload,
      resourceId: 999999,
    })
    const nonUtcDate = await withCsrf(client.put('/api/v1/access-rules'), session).unsafeJson({
      ...basePayload,
      startsAt: '2026-09-06T12:00:00.000-03:00',
    })
    const reversedWindow = await withCsrf(client.put('/api/v1/access-rules'), session).unsafeJson({
      ...basePayload,
      startsAt: '2026-09-07T12:00:00.000Z',
      expiresAt: '2026-09-06T12:00:00.000Z',
    })
    const oversizedBodyUserId = await withCsrf(
      client.put('/api/v1/access-rules'),
      session
    ).unsafeJson({
      ...basePayload,
      userId: 2_147_483_648,
    })
    const oversizedBodyResourceId = await withCsrf(
      client.put('/api/v1/access-rules'),
      session
    ).unsafeJson({
      ...basePayload,
      resourceId: 2_147_483_648,
    })
    const oversizedQueryId = await client
      .get(`/api/v1/access-rules?userId=2147483648&resourceType=COURSE&resourceId=${course.id}`)
      .cookie(session.name, session.value)
    const oversizedRouteId = await withCsrf(
      client.delete('/api/v1/access-rules/2147483648'),
      session
    )

    adminTarget.assertStatus(422)
    unknownStudent.assertStatus(422)
    unknownResource.assertStatus(422)
    nonUtcDate.assertStatus(422)
    reversedWindow.assertStatus(422)
    oversizedBodyUserId.assertStatus(422)
    oversizedBodyResourceId.assertStatus(422)
    oversizedQueryId.assertStatus(422)
    oversizedRouteId.assertStatus(422)
  })

  test('propagates an unexpected target-resolution failure as a server error', async ({
    client,
  }) => {
    const session = await login(client, admin)
    const validateTarget = AccessControlService.prototype.validateTarget
    AccessControlService.prototype.validateTarget = async () => {
      throw new Error('unexpected target resolver failure')
    }

    try {
      const response = await withCsrf(client.put('/api/v1/access-rules'), session).unsafeJson({
        userId: student.id,
        resourceType: 'COURSE',
        resourceId: course.id,
        capability: 'VIEW',
        effect: 'ALLOW',
        startsAt: null,
        expiresAt: null,
      })

      response.assertStatus(500)
    } finally {
      AccessControlService.prototype.validateTarget = validateTarget
    }
  })

  test('explains effective VIEW and DOWNLOAD independently without returning private material data', async ({
    assert,
    client,
  }) => {
    await AccessRule.createMany([
      {
        userId: student.id,
        resourceType: 'COURSE',
        resourceId: course.id,
        capability: 'VIEW',
        effect: 'ALLOW',
      },
      {
        userId: student.id,
        resourceType: 'MODULE',
        resourceId: module.id,
        capability: 'VIEW',
        effect: 'DENY',
      },
      {
        userId: student.id,
        resourceType: 'COURSE',
        resourceId: course.id,
        capability: 'DOWNLOAD',
        effect: 'ALLOW',
      },
    ])
    const session = await login(client, admin)

    const response = await client
      .get(
        `/api/v1/access-rules/effective?userId=${student.id}&resourceType=MATERIAL&resourceId=${material.id}`
      )
      .cookie(session.name, session.value)

    response.assertStatus(200)
    response.assertBodyContains({
      data: {
        view: { allowed: false, decision: 'DENY', source: 'MODULE' },
        download: { allowed: true, decision: 'ALLOW', source: 'COURSE' },
      },
    })
    assert.notProperty(response.body().data, 'storageKey')
    assert.notProperty(response.body().data, 'url')
  })
})
