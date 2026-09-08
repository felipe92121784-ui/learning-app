import AccessRule from '#models/access_rule'
import Course from '#models/course'
import CourseModule from '#models/course_module'
import Material from '#models/material'
import User from '#models/user'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import { csrfSessionFrom, postLogin, withCsrf } from '../helpers/csrf.js'

const password = 'course-association-password-123'

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
        status: 'DRAFT',
        permission: 'READ',
        createdAt: firstCourse.createdAt.toISO(),
        updatedAt: firstCourse.updatedAt?.toISO() ?? null,
      },
    ])
  })

  test('creates and updates a course association as paired direct permission rules', async ({
    assert,
    client,
  }) => {
    const session = await login(client, admin)

    for (const [permission, view, download] of [
      ['NONE', 'DENY', 'DENY'],
      ['READ', 'ALLOW', 'DENY'],
      ['FULL', 'ALLOW', 'ALLOW'],
    ] as const) {
      const response = await withCsrf(
        client.put(`/api/v1/users/${student.id}/courses/${firstCourse.id}`),
        session
      ).unsafeJson({ permission })

      response.assertStatus(200)
      response.assertBodyContains({
        data: { id: firstCourse.id, permission, title: 'First associated course' },
      })
      const rules = await AccessRule.query()
        .where({ userId: student.id, resourceType: 'COURSE', resourceId: firstCourse.id })
        .orderBy('capability', 'asc')
      assert.deepEqual(
        rules.map((rule) => ({ capability: rule.capability, effect: rule.effect })),
        [
          { capability: 'DOWNLOAD', effect: download },
          { capability: 'VIEW', effect: view },
        ]
      )
    }
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

  test('requires an admin and validates student and course targets', async ({ client }) => {
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
    ).unsafeJson({ permission: 'READ' })
    const invalidPermission = await withCsrf(
      client.put(`/api/v1/users/${student.id}/courses/${firstCourse.id}`),
      adminSession
    ).unsafeJson({ permission: 'EDIT' })

    guest.assertStatus(401)
    nonAdmin.assertStatus(403)
    missingCsrf.assertStatus(302)
    adminTarget.assertStatus(422)
    unknownStudent.assertStatus(422)
    unknownCourse.assertStatus(422)
    invalidPermission.assertStatus(422)
  })
})
