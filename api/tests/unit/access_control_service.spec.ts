import AccessRule from '#models/access_rule'
import Course from '#models/course'
import CourseModule from '#models/course_module'
import Material from '#models/material'
import User from '#models/user'
import AccessControlService from '#services/access_control_service'
import testUtils from '@adonisjs/core/services/test_utils'
import { test } from '@japa/runner'
import { DateTime } from 'luxon'

const now = DateTime.fromISO('2026-09-06T12:00:00.000Z', { zone: 'utc' })

async function createHierarchy() {
  const student = await User.create({
    email: 'student@example.test',
    password: 'student-password',
    role: 'STUDENT',
    status: 'ACTIVE',
  })
  const course = await Course.create({ title: 'Access control course' })
  const module = await CourseModule.create({
    courseId: course.id,
    title: 'Access control module',
    position: 0,
  })
  const material = await Material.create({
    moduleId: module.id,
    title: 'Access control material',
    type: 'PDF',
    storageKey: 'originals/access-control.pdf',
    originalFilename: 'access-control.pdf',
    mimeType: 'application/pdf',
    size: 10,
    position: 0,
    processingStatus: 'READY',
  })

  return { student, course, module, material }
}

test.group('AccessControlService', (group) => {
  let cleanupDatabase: () => Promise<void>

  group.each.setup(async () => {
    cleanupDatabase = await testUtils.db().truncate()
    await cleanupDatabase()
  })

  group.each.teardown(async () => {
    await cleanupDatabase()
  })

  test('uses the most specific valid explicit rule and otherwise defaults to deny', async ({
    assert,
  }) => {
    const { student, course, module, material } = await createHierarchy()
    const access = new AccessControlService()

    await AccessRule.create({
      userId: student.id,
      resourceType: 'COURSE',
      resourceId: course.id,
      capability: 'VIEW',
      effect: 'ALLOW',
    })
    const moduleDeny = await AccessRule.create({
      userId: student.id,
      resourceType: 'MODULE',
      resourceId: module.id,
      capability: 'VIEW',
      effect: 'DENY',
    })

    assert.deepEqual(
      await access.resolve({
        userId: student.id,
        resourceType: 'MATERIAL',
        resourceId: material.id,
        capability: 'VIEW',
        now,
      }),
      { allowed: false, decision: 'DENY', source: 'MODULE', ruleId: moduleDeny.id }
    )
    assert.deepEqual(
      await access.resolve({
        userId: student.id,
        resourceType: 'COURSE',
        resourceId: course.id,
        capability: 'DOWNLOAD',
        now,
      }),
      { allowed: false, decision: 'DENY', source: 'DEFAULT', ruleId: null }
    )
  })

  test('ignores inherit, future, and expired rules before continuing inheritance', async ({
    assert,
  }) => {
    const { student, course, module, material } = await createHierarchy()
    const access = new AccessControlService()
    const courseAllow = await AccessRule.create({
      userId: student.id,
      resourceType: 'COURSE',
      resourceId: course.id,
      capability: 'VIEW',
      effect: 'ALLOW',
    })

    await AccessRule.createMany([
      {
        userId: student.id,
        resourceType: 'MATERIAL',
        resourceId: material.id,
        capability: 'VIEW',
        effect: 'INHERIT',
      },
      {
        userId: student.id,
        resourceType: 'MODULE',
        resourceId: module.id,
        capability: 'VIEW',
        effect: 'DENY',
        startsAt: now.plus({ second: 1 }),
      },
    ])

    assert.deepEqual(
      await access.resolve({
        userId: student.id,
        resourceType: 'MATERIAL',
        resourceId: material.id,
        capability: 'VIEW',
        now,
      }),
      { allowed: true, decision: 'ALLOW', source: 'COURSE', ruleId: courseAllow.id }
    )

    await AccessRule.query()
      .where({ resourceType: 'MODULE', resourceId: module.id, capability: 'VIEW' })
      .update({ startsAt: null, expiresAt: now })

    assert.deepEqual(
      await access.resolve({
        userId: student.id,
        resourceType: 'MATERIAL',
        resourceId: material.id,
        capability: 'VIEW',
        now,
      }),
      { allowed: true, decision: 'ALLOW', source: 'COURSE', ruleId: courseAllow.id }
    )
  })

  test('keeps VIEW and DOWNLOAD independent and honors inclusive start boundaries', async ({
    assert,
  }) => {
    const { student, material } = await createHierarchy()
    const access = new AccessControlService()
    const downloadAllow = await AccessRule.create({
      userId: student.id,
      resourceType: 'MATERIAL',
      resourceId: material.id,
      capability: 'DOWNLOAD',
      effect: 'ALLOW',
      startsAt: now,
    })

    assert.deepEqual(
      await access.resolve({
        userId: student.id,
        resourceType: 'MATERIAL',
        resourceId: material.id,
        capability: 'VIEW',
        now,
      }),
      { allowed: false, decision: 'DENY', source: 'DEFAULT', ruleId: null }
    )
    assert.deepEqual(
      await access.resolve({
        userId: student.id,
        resourceType: 'MATERIAL',
        resourceId: material.id,
        capability: 'DOWNLOAD',
        now,
      }),
      { allowed: true, decision: 'ALLOW', source: 'MATERIAL', ruleId: downloadAllow.id }
    )
  })

  test('caps module and material exceptions by every course enrollment window', async ({
    assert,
  }) => {
    const { student, course, module, material } = await createHierarchy()
    const access = new AccessControlService()
    // A VIEW window also caps DOWNLOAD, including ZIP's fallback to VIEW.
    const enrollment = await AccessRule.create({
      userId: student.id,
      resourceType: 'COURSE',
      resourceId: course.id,
      capability: 'VIEW',
      effect: 'DENY',
      startsAt: now,
      expiresAt: now.plus({ days: 1 }),
    })
    for (const [resourceType, resourceId] of [
      ['MODULE', module.id],
      ['MATERIAL', material.id],
    ] as const) {
      for (const capability of ['VIEW', 'DOWNLOAD'] as const) {
        const override = await AccessRule.create({
          userId: student.id,
          resourceType,
          resourceId,
          capability,
          effect: 'ALLOW',
        })
        for (const [at, allowed] of [
          [now.minus({ milliseconds: 1 }), false],
          [now, true],
          [now.plus({ hours: 12 }), true],
          [now.plus({ days: 1 }), false],
        ] as const) {
          assert.deepEqual(
            await access.resolve({
              userId: student.id,
              resourceType,
              resourceId,
              capability,
              now: at,
            }),
            {
              allowed,
              decision: allowed ? 'ALLOW' : 'DENY',
              source: allowed ? resourceType : 'COURSE',
              ruleId: allowed ? override.id : enrollment.id,
            }
          )
        }
      }
    }
  })

  test('rejects nonexistent Course, Module, and Material resources before making a decision', async ({
    assert,
  }) => {
    const { student } = await createHierarchy()
    const access = new AccessControlService()

    for (const resourceType of ['COURSE', 'MODULE', 'MATERIAL'] as const) {
      await assert.rejects(() =>
        access.resolve({
          userId: student.id,
          resourceType,
          resourceId: 999999,
          capability: 'VIEW',
          now,
        })
      )
    }
  })

  test('rejects an invalid resource type instead of treating it as a Material', async ({
    assert,
  }) => {
    const { student, material } = await createHierarchy()
    const access = new AccessControlService()

    await assert.rejects(() =>
      access.resolve({
        userId: student.id,
        resourceType: 'LESSON' as never,
        resourceId: material.id,
        capability: 'VIEW',
        now,
      })
    )
  })

  test('validates an existing write target without resolving a rule', async ({ assert }) => {
    const { material } = await createHierarchy()
    const access = new AccessControlService()

    await access.validateTarget({ resourceType: 'MATERIAL', resourceId: material.id })
    await assert.rejects(() =>
      access.validateTarget({ resourceType: 'MATERIAL', resourceId: 999999 })
    )
  })
})
