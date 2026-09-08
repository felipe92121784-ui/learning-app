import AccessRule from '#models/access_rule'
import Course from '#models/course'
import CourseModule from '#models/course_module'
import Material from '#models/material'
import User from '#models/user'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import { DateTime } from 'luxon'
import { csrfSessionFrom, postLogin, withCsrf } from '../helpers/csrf.js'

const password = 'course-association-password-123'

function activePeriod() {
  return {
    startsAt: DateTime.utc().minus({ days: 1 }).toISO(),
    expiresAt: DateTime.utc().plus({ days: 1 }).toISO(),
  }
}

async function login(client: ApiClient, user: User) {
  const response = await postLogin(client, { email: user.email, password })
  response.assertStatus(200)
  return csrfSessionFrom(response)
}

async function createMaterial(course: Course, title: string) {
  const module = await CourseModule.create({
    courseId: course.id,
    title: `${title} module`,
    position: 0,
  })
  const material = await Material.create({
    moduleId: module.id,
    title: `${title} material`,
    type: 'PDF',
    storageKey: `originals/${title.toLowerCase().replaceAll(' ', '-')}.pdf`,
    originalFilename: `${title.toLowerCase().replaceAll(' ', '-')}.pdf`,
    mimeType: 'application/pdf',
    size: 10,
    position: 0,
    processingStatus: 'READY',
  })

  return { module, material }
}

test.group('Administrative student course associations API', (group) => {
  let admin: User
  let student: User
  let otherStudent: User
  let firstCourse: Course
  let secondCourse: Course
  let cleanupDatabase: () => Promise<void>

  group.each.setup(async () => {
    cleanupDatabase = await testUtils.db().truncate()
    await cleanupDatabase()

    ;[admin, student, otherStudent] = await User.createMany([
      {
        email: 'ada.course-associations@example.test',
        password,
        role: 'ADMIN',
        status: 'ACTIVE',
      },
      {
        email: 'sam.course-associations@example.test',
        password,
        role: 'STUDENT',
        status: 'ACTIVE',
      },
      {
        email: 'lee.course-associations@example.test',
        password,
        role: 'STUDENT',
        status: 'ACTIVE',
      },
    ])
    firstCourse = await Course.create({ title: 'First associated course' })
    secondCourse = await Course.create({ title: 'Unrelated course' })
  })

  group.each.teardown(async () => {
    await cleanupDatabase()
  })

  test('lists only courses with a direct course rule for the selected student', async ({
    assert,
    client,
  }) => {
    await AccessRule.createMany([
      {
        userId: student.id,
        resourceType: 'COURSE',
        resourceId: firstCourse.id,
        capability: 'VIEW',
        effect: 'ALLOW',
      },
      {
        userId: otherStudent.id,
        resourceType: 'COURSE',
        resourceId: secondCourse.id,
        capability: 'VIEW',
        effect: 'ALLOW',
      },
    ])
    const session = await login(client, admin)

    const response = await client
      .get(`/api/v1/users/${student.id}/courses`)
      .cookie(session.name, session.value)

    response.assertStatus(200)
    assert.deepEqual(response.body().data, [
      {
        id: firstCourse.id,
        title: 'First associated course',
        description: null,
        permission: 'READ',
        startsAt: null,
        expiresAt: null,
        status: 'ACTIVE',
        createdAt: firstCourse.createdAt.toISO(),
        updatedAt: firstCourse.updatedAt?.toISO() ?? null,
      },
    ])
  })

  test('lists scheduled, active, and expired dated course associations', async ({
    assert,
    client,
  }) => {
    const scheduledCourse = await Course.create({ title: 'Scheduled associated course' })
    const activeCourse = await Course.create({ title: 'Active associated course' })
    const expiredCourse = await Course.create({ title: 'Expired associated course' })
    const scheduledStart = DateTime.utc().plus({ days: 1 }).startOf('second')
    const scheduledEnd = scheduledStart.plus({ days: 7 })
    const activeStart = DateTime.utc().minus({ days: 1 }).startOf('second')
    const activeEnd = DateTime.utc().plus({ days: 1 }).startOf('second')
    const expiredStart = DateTime.utc().minus({ days: 7 }).startOf('second')
    const expiredEnd = DateTime.utc().minus({ days: 1 }).startOf('second')
    const session = await login(client, admin)

    for (const [course, permission, startsAt, expiresAt] of [
      [scheduledCourse, 'READ', scheduledStart, scheduledEnd],
      [activeCourse, 'FULL', activeStart, activeEnd],
      [expiredCourse, 'NONE', expiredStart, expiredEnd],
    ] as const) {
      const response = await withCsrf(
        client.post(`/api/v1/users/${student.id}/courses/${course.id}`),
        session
      ).unsafeJson({ permission, startsAt: startsAt.toISO(), expiresAt: expiresAt.toISO() })

      response.assertStatus(200)
    }

    const response = await client
      .get(`/api/v1/users/${student.id}/courses`)
      .cookie(session.name, session.value)

    response.assertStatus(200)
    const associations = response.body().data
    for (const [course, permission, startsAt, expiresAt, status] of [
      [scheduledCourse, 'READ', scheduledStart, scheduledEnd, 'SCHEDULED'],
      [activeCourse, 'FULL', activeStart, activeEnd, 'ACTIVE'],
      [expiredCourse, 'NONE', expiredStart, expiredEnd, 'EXPIRED'],
    ] as const) {
      const association = associations.find((item: { id: number }) => item.id === course.id)
      assert.deepEqual(
        {
          id: association.id,
          permission: association.permission,
          startsAt: association.startsAt,
          expiresAt: association.expiresAt,
          status: association.status,
        },
        {
          id: course.id,
          permission,
          startsAt: startsAt.toISO(),
          expiresAt: expiresAt.toISO(),
          status,
        }
      )
    }
  })

  test('creates a course association explicitly and updates its paired direct permission rules', async ({
    assert,
    client,
  }) => {
    const session = await login(client, admin)

    const startsAt = DateTime.utc().minus({ hours: 1 }).startOf('second')
    const expiresAt = DateTime.utc().plus({ days: 1 }).startOf('second')
    const updatedStartsAt = DateTime.utc().plus({ days: 2 }).startOf('second')
    const updatedExpiresAt = DateTime.utc().plus({ days: 3 }).startOf('second')

    for (const [method, permission, view, download, period] of [
      ['post', 'NONE', 'DENY', 'DENY', { startsAt, expiresAt }],
      ['put', 'READ', 'ALLOW', 'DENY', { startsAt: updatedStartsAt, expiresAt: updatedExpiresAt }],
      ['put', 'FULL', 'ALLOW', 'ALLOW', { startsAt, expiresAt }],
    ] as const) {
      const response = await withCsrf(
        client[method](`/api/v1/users/${student.id}/courses/${firstCourse.id}`),
        session
      ).unsafeJson({
        permission,
        startsAt: period.startsAt.toISO(),
        expiresAt: period.expiresAt.toISO(),
      })

      response.assertStatus(200)
      response.assertBodyContains({
        data: {
          id: firstCourse.id,
          permission,
          title: 'First associated course',
          startsAt: period.startsAt.toISO(),
          expiresAt: period.expiresAt.toISO(),
        },
      })
      const rules = await AccessRule.query()
        .where({ userId: student.id, resourceType: 'COURSE', resourceId: firstCourse.id })
        .orderBy('capability', 'asc')
      assert.deepEqual(
        rules.map((rule) => ({
          capability: rule.capability,
          effect: rule.effect,
          startsAt: rule.startsAt?.toUTC().toISO() ?? null,
          expiresAt: rule.expiresAt?.toUTC().toISO() ?? null,
        })),
        [
          {
            capability: 'DOWNLOAD',
            effect: download,
            startsAt: period.startsAt.toISO(),
            expiresAt: period.expiresAt.toISO(),
          },
          {
            capability: 'VIEW',
            effect: view,
            startsAt: period.startsAt.toISO(),
            expiresAt: period.expiresAt.toISO(),
          },
        ]
      )
    }
  })

  test('does not recreate an association when an update follows its removal', async ({
    assert,
    client,
  }) => {
    const session = await login(client, admin)
    const startsAt = DateTime.utc().minus({ hours: 1 }).startOf('second')
    const expiresAt = DateTime.utc().plus({ days: 1 }).startOf('second')
    const create = await withCsrf(
      client.post(`/api/v1/users/${student.id}/courses/${firstCourse.id}`),
      session
    ).unsafeJson({ permission: 'READ', startsAt: startsAt.toISO(), expiresAt: expiresAt.toISO() })
    create.assertStatus(200)

    const remove = await withCsrf(
      client.delete(`/api/v1/users/${student.id}/courses/${firstCourse.id}`),
      session
    )
    remove.assertStatus(204)

    const update = await withCsrf(
      client.put(`/api/v1/users/${student.id}/courses/${firstCourse.id}`),
      session
    ).unsafeJson({ permission: 'FULL', startsAt: startsAt.toISO(), expiresAt: expiresAt.toISO() })

    update.assertStatus(409)
    assert.lengthOf(
      await AccessRule.query().where({
        userId: student.id,
        resourceType: 'COURSE',
        resourceId: firstCourse.id,
      }),
      0
    )
  })

  test('derives stored association permission even when its direct rules are outside their window', async ({
    assert,
    client,
  }) => {
    await AccessRule.createMany([
      {
        userId: student.id,
        resourceType: 'COURSE',
        resourceId: firstCourse.id,
        capability: 'VIEW',
        effect: 'ALLOW',
        startsAt: DateTime.utc().plus({ hours: 1 }),
      },
      {
        userId: student.id,
        resourceType: 'COURSE',
        resourceId: firstCourse.id,
        capability: 'DOWNLOAD',
        effect: 'ALLOW',
        expiresAt: DateTime.utc().minus({ minutes: 1 }),
      },
    ])
    const session = await login(client, admin)

    const response = await client
      .get(`/api/v1/users/${student.id}/courses`)
      .cookie(session.name, session.value)

    response.assertStatus(200)
    assert.equal(response.body().data[0].permission, 'FULL')
    assert.equal(response.body().data[0].status, 'SCHEDULED')
  })

  test('removes direct rules inside the selected course while preserving unrelated rules', async ({
    assert,
    client,
  }) => {
    const firstTree = await createMaterial(firstCourse, 'First associated')
    const secondTree = await createMaterial(secondCourse, 'Unrelated')
    const rules = await AccessRule.createMany([
      {
        userId: student.id,
        resourceType: 'COURSE',
        resourceId: firstCourse.id,
        capability: 'VIEW',
        effect: 'ALLOW',
      },
      {
        userId: student.id,
        resourceType: 'COURSE',
        resourceId: firstCourse.id,
        capability: 'DOWNLOAD',
        effect: 'DENY',
      },
      {
        userId: student.id,
        resourceType: 'MODULE',
        resourceId: firstTree.module.id,
        capability: 'VIEW',
        effect: 'DENY',
      },
      {
        userId: student.id,
        resourceType: 'MATERIAL',
        resourceId: firstTree.material.id,
        capability: 'DOWNLOAD',
        effect: 'ALLOW',
      },
      {
        userId: student.id,
        resourceType: 'COURSE',
        resourceId: secondCourse.id,
        capability: 'VIEW',
        effect: 'ALLOW',
      },
      {
        userId: student.id,
        resourceType: 'MODULE',
        resourceId: secondTree.module.id,
        capability: 'VIEW',
        effect: 'DENY',
      },
      {
        userId: otherStudent.id,
        resourceType: 'MATERIAL',
        resourceId: firstTree.material.id,
        capability: 'VIEW',
        effect: 'ALLOW',
      },
    ])
    const session = await login(client, admin)

    const response = await withCsrf(
      client.delete(`/api/v1/users/${student.id}/courses/${firstCourse.id}`),
      session
    )

    response.assertStatus(204)
    for (const rule of rules.slice(0, 4)) {
      assert.isNull(await AccessRule.find(rule.id))
    }
    for (const rule of rules.slice(4)) {
      assert.exists(await AccessRule.find(rule.id))
    }
  })

  test('rolls back association cleanup when a direct rule deletion fails', async ({
    assert,
    client,
  }) => {
    const tree = await createMaterial(firstCourse, 'Transactional')
    const rules = await AccessRule.createMany([
      {
        userId: student.id,
        resourceType: 'COURSE',
        resourceId: firstCourse.id,
        capability: 'VIEW',
        effect: 'ALLOW',
      },
      {
        userId: student.id,
        resourceType: 'MODULE',
        resourceId: tree.module.id,
        capability: 'VIEW',
        effect: 'DENY',
      },
      {
        userId: student.id,
        resourceType: 'MATERIAL',
        resourceId: tree.material.id,
        capability: 'VIEW',
        effect: 'ALLOW',
      },
    ])
    await db.rawQuery(`
      CREATE FUNCTION reject_transactional_access_rule_deletion()
      RETURNS trigger AS $$
      BEGIN
        IF OLD.resource_type = 'MATERIAL' AND OLD.resource_id = ${tree.material.id} THEN
          RAISE EXCEPTION 'simulated direct rule deletion failure';
        END IF;
        RETURN OLD;
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER reject_transactional_access_rule_deletion
      BEFORE DELETE ON access_rules
      FOR EACH ROW EXECUTE FUNCTION reject_transactional_access_rule_deletion();
    `)
    const session = await login(client, admin)

    try {
      const response = await withCsrf(
        client.delete(`/api/v1/users/${student.id}/courses/${firstCourse.id}`),
        session
      )

      response.assertStatus(500)
      for (const rule of rules) {
        assert.exists(await AccessRule.find(rule.id))
      }
    } finally {
      await db.rawQuery(
        'DROP TRIGGER IF EXISTS reject_transactional_access_rule_deletion ON access_rules; DROP FUNCTION IF EXISTS reject_transactional_access_rule_deletion();'
      )
    }
  })

  test('rejects concurrent duplicate creation without changing the winning enrollment or exceptions', async ({
    assert,
    client,
  }) => {
    const session = await login(client, admin)
    const secondAdmin = await User.create({
      email: 'second-admin@example.test',
      password,
      role: 'ADMIN',
      status: 'ACTIVE',
    })
    const secondSession = await login(client, secondAdmin)
    const { material } = await createMaterial(firstCourse, 'Duplicate course')
    const exception = await AccessRule.create({
      userId: student.id,
      resourceType: 'MATERIAL',
      resourceId: material.id,
      capability: 'VIEW',
      effect: 'DENY',
    })
    const inputs = [
      {
        permission: 'READ',
        startsAt: '2026-09-01T03:00:00.000Z',
        expiresAt: '2026-10-01T03:00:00.000Z',
      },
      {
        permission: 'FULL',
        startsAt: '2026-09-08T03:00:00.000Z',
        expiresAt: '2027-09-08T03:00:00.000Z',
      },
    ]
    const responses = await Promise.all(
      inputs.map((input, index) =>
        withCsrf(
          client.post(`/api/v1/users/${student.id}/courses/${firstCourse.id}`),
          index === 0 ? session : secondSession
        ).unsafeJson(input)
      )
    )
    assert.deepEqual(responses.map((response) => response.status()).sort(), [200, 409])
    const winningIndex = responses.findIndex((response) => response.status() === 200)
    assert.equal(responses[1 - winningIndex].body().code, 'COURSE_ASSOCIATION_ALREADY_EXISTS')
    const rules = await AccessRule.query().where({
      userId: student.id,
      resourceType: 'COURSE',
      resourceId: firstCourse.id,
    })
    assert.lengthOf(rules, 2)
    for (const rule of rules) {
      assert.equal(rule.startsAt?.toUTC().toISO(), inputs[winningIndex].startsAt)
      assert.equal(rule.expiresAt?.toUTC().toISO(), inputs[winningIndex].expiresAt)
      assert.equal(
        rule.effect,
        rule.capability === 'VIEW' || inputs[winningIndex].permission === 'FULL' ? 'ALLOW' : 'DENY'
      )
    }
    assert.exists(await AccessRule.find(exception.id))
  })

  test('defines a legacy enrollment period and permission without replacing child exceptions', async ({
    assert,
    client,
  }) => {
    const { module, material } = await createMaterial(firstCourse, 'Legacy course')
    const rules = await AccessRule.createMany([
      {
        userId: student.id,
        resourceType: 'COURSE',
        resourceId: firstCourse.id,
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
        resourceType: 'MATERIAL',
        resourceId: material.id,
        capability: 'DOWNLOAD',
        effect: 'ALLOW',
      },
    ])
    const exceptions = await Promise.all(
      rules.slice(1).map(async (rule) => {
        await rule.refresh()
        return rule.serialize()
      })
    )
    const period = activePeriod()
    const session = await login(client, admin)
    const response = await withCsrf(
      client.put(`/api/v1/users/${student.id}/courses/${firstCourse.id}`),
      session
    ).unsafeJson({ permission: 'NONE', ...period })
    response.assertStatus(200)
    response.assertBodyContains({ data: { permission: 'NONE', ...period } })
    for (const [index, rule] of rules.slice(1).entries()) {
      const stored = await AccessRule.findOrFail(rule.id)
      assert.deepEqual(stored.serialize(), exceptions[index])
    }
    const courseRules = await AccessRule.query().where({
      userId: student.id,
      resourceType: 'COURSE',
      resourceId: firstCourse.id,
    })
    assert.lengthOf(courseRules, 2)
    assert.isTrue(courseRules.every((rule) => rule.effect === 'DENY'))
  })

  test('requires an admin and validates student and course targets', async ({ assert, client }) => {
    const studentSession = await login(client, student)
    const adminSession = await login(client, admin)

    const guest = await client.get(`/api/v1/users/${student.id}/courses`)
    const nonAdmin = await client
      .get(`/api/v1/users/${student.id}/courses`)
      .cookie(studentSession.name, studentSession.value)
    const missingCsrf = await client
      .put(`/api/v1/users/${student.id}/courses/${firstCourse.id}`)
      .redirects(0)
      .cookie(adminSession.name, adminSession.value)
      .unsafeJson({ permission: 'READ' })
    const adminTarget = await client
      .get(`/api/v1/users/${admin.id}/courses`)
      .cookie(adminSession.name, adminSession.value)
    const unknownStudent = await client
      .get('/api/v1/users/999999/courses')
      .cookie(adminSession.name, adminSession.value)
    const unknownCourse = await withCsrf(
      client.put(`/api/v1/users/${student.id}/courses/999999`),
      adminSession
    ).unsafeJson({ permission: 'READ', ...activePeriod() })
    const invalidPermission = await withCsrf(
      client.put(`/api/v1/users/${student.id}/courses/${firstCourse.id}`),
      adminSession
    ).unsafeJson({ permission: 'EDIT', ...activePeriod() })
    const missingPeriod = await withCsrf(
      client.post(`/api/v1/users/${student.id}/courses/${firstCourse.id}`),
      adminSession
    ).unsafeJson({ permission: 'READ' })
    const invalidWindow = await withCsrf(
      client.post(`/api/v1/users/${student.id}/courses/${firstCourse.id}`),
      adminSession
    ).unsafeJson({
      permission: 'READ',
      startsAt: '2026-09-07T12:00:00.000Z',
      expiresAt: '2026-09-06T12:00:00.000Z',
    })
    const nonUtcWindow = await withCsrf(
      client.post(`/api/v1/users/${student.id}/courses/${firstCourse.id}`),
      adminSession
    ).unsafeJson({
      permission: 'READ',
      startsAt: '2026-09-06T12:00:00.000-03:00',
      expiresAt: '2026-09-07T12:00:00.000Z',
    })

    guest.assertStatus(401)
    nonAdmin.assertStatus(403)
    missingCsrf.assertStatus(302)
    adminTarget.assertStatus(422)
    unknownStudent.assertStatus(422)
    unknownCourse.assertStatus(422)
    invalidPermission.assertStatus(422)
    assert.equal(unknownCourse.body().errors[0].field, 'courseId')
    assert.equal(invalidPermission.body().errors[0].field, 'permission')
    missingPeriod.assertStatus(422)
    assert.deepEqual(
      missingPeriod
        .body()
        .errors.map((error: { field: string }) => error.field)
        .sort(),
      ['expiresAt', 'startsAt']
    )
    invalidWindow.assertStatus(422)
    nonUtcWindow.assertStatus(422)
  })
})
