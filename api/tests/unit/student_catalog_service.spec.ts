import AccessRule from '#models/access_rule'
import Course from '#models/course'
import CourseModule from '#models/course_module'
import Material, { type MaterialProcessingStatus, type MaterialType } from '#models/material'
import User from '#models/user'
import StudentCatalogService, {
  StudentCatalogNotFoundError,
  type StudentCatalogAccessControl,
} from '#services/student_catalog_service'
import testUtils from '@adonisjs/core/services/test_utils'
import { test } from '@japa/runner'
import { DateTime } from 'luxon'

test.group('StudentCatalogService', (group) => {
  let cleanupDatabase: () => Promise<void>
  let student: User

  group.each.setup(async () => {
    cleanupDatabase = await testUtils.db().truncate()
    await cleanupDatabase()
    student = await User.create({
      email: `student-catalog-${Math.random()}@example.test`,
      password: 'student-catalog-password',
      role: 'STUDENT',
      status: 'ACTIVE',
    })
  })

  group.each.teardown(async () => {
    await cleanupDatabase()
  })

  test('lists only published courses reachable through COURSE, MODULE, or MATERIAL VIEW', async ({
    assert,
  }) => {
    const service = new StudentCatalogService()
    const visibleByCourse = await createHierarchy('Course rule', {
      createdAt: '2026-09-07T09:00:00.000Z',
    })
    const visibleByModule = await createHierarchy('Module rule', {
      createdAt: '2026-09-07T10:00:00.000Z',
    })
    const visibleByMaterial = await createHierarchy('Material rule', {
      createdAt: '2026-09-07T11:00:00.000Z',
    })
    const draft = await createHierarchy('Draft', { status: 'DRAFT' })
    await allow(student.id, 'COURSE', visibleByCourse.course.id)
    await allow(student.id, 'MODULE', visibleByModule.module.id)
    await allow(student.id, 'MATERIAL', visibleByMaterial.material.id)
    await allow(student.id, 'COURSE', draft.course.id)

    const results = await service.listCourses({ userId: student.id })

    assert.deepEqual(
      results.map((course) => course.id),
      [visibleByMaterial.course.id, visibleByModule.course.id, visibleByCourse.course.id]
    )
    assert.deepEqual(results[0], {
      id: visibleByMaterial.course.id,
      title: 'Material rule',
      description: 'Material rule description',
      moduleCount: 1,
    })
  })

  test('excludes a course whose only VIEW rule is expired', async ({ assert }) => {
    const hierarchy = await createHierarchy('Expired course')
    await allow(student.id, 'MATERIAL', hierarchy.material.id, {
      expiresAt: DateTime.utc().minus({ minutes: 1 }),
    })

    assert.deepEqual(await new StudentCatalogService().listCourses({ userId: student.id }), [])
    await assert.rejects(
      () =>
        new StudentCatalogService().getCourse({
          userId: student.id,
          courseId: hierarchy.course.id,
        }),
      StudentCatalogNotFoundError
    )
  })

  test('returns the complete ordered safe hierarchy with DENY, processing, failed, and ZIP states', async ({
    assert,
  }) => {
    const course = await Course.create({
      title: 'Safe hierarchy',
      description: 'Visible structure',
      status: 'PUBLISHED',
    })
    const [allowedModule, descendantModule, lockedModule] = await CourseModule.createMany([
      { courseId: course.id, title: 'Allowed module', description: 'First', position: 0 },
      { courseId: course.id, title: 'Descendant module', description: null, position: 1 },
      { courseId: course.id, title: 'Locked module', description: 'Third', position: 2 },
    ])
    const ready = await createMaterial(allowedModule.id, 'Ready PDF', 'PDF', 'READY', 0)
    const denied = await createMaterial(allowedModule.id, 'Denied image', 'IMAGE', 'READY', 1)
    const processing = await createMaterial(
      allowedModule.id,
      'Processing PDF',
      'PDF',
      'PROCESSING',
      2
    )
    const failed = await createMaterial(allowedModule.id, 'Failed image', 'IMAGE', 'FAILED', 3)
    const zip = await createMaterial(descendantModule.id, 'Ready ZIP', 'ZIP', 'READY', 0)
    const locked = await createMaterial(lockedModule.id, 'Locked PDF', 'PDF', 'READY', 0)
    await allow(student.id, 'MODULE', allowedModule.id)
    await AccessRule.create({
      userId: student.id,
      resourceType: 'MATERIAL',
      resourceId: denied.id,
      capability: 'VIEW',
      effect: 'DENY',
    })
    await allow(student.id, 'MATERIAL', zip.id)

    const result = await new StudentCatalogService().getCourse({
      userId: student.id,
      courseId: course.id,
    })

    assert.deepEqual(result, {
      id: course.id,
      title: 'Safe hierarchy',
      description: 'Visible structure',
      moduleCount: 3,
      modules: [
        {
          id: allowedModule.id,
          title: 'Allowed module',
          description: 'First',
          availability: 'AVAILABLE',
          materials: [
            {
              id: ready.id,
              title: 'Ready PDF',
              description: 'Ready PDF description',
              type: 'PDF',
              availability: 'AVAILABLE',
            },
            {
              id: denied.id,
              title: 'Denied image',
              description: 'Denied image description',
              type: 'IMAGE',
              availability: 'LOCKED',
            },
            {
              id: processing.id,
              title: 'Processing PDF',
              description: 'Processing PDF description',
              type: 'PDF',
              availability: 'UNAVAILABLE',
              unavailableReason: 'PROCESSING',
            },
            {
              id: failed.id,
              title: 'Failed image',
              description: 'Failed image description',
              type: 'IMAGE',
              availability: 'UNAVAILABLE',
              unavailableReason: 'FAILED',
            },
          ],
        },
        {
          id: descendantModule.id,
          title: 'Descendant module',
          description: null,
          availability: 'AVAILABLE',
          materials: [
            {
              id: zip.id,
              title: 'Ready ZIP',
              description: 'Ready ZIP description',
              type: 'ZIP',
              availability: 'AVAILABLE',
            },
          ],
        },
        {
          id: lockedModule.id,
          title: 'Locked module',
          description: 'Third',
          availability: 'LOCKED',
          materials: [
            {
              id: locked.id,
              title: 'Locked PDF',
              description: 'Locked PDF description',
              type: 'PDF',
              availability: 'LOCKED',
            },
          ],
        },
      ],
    })
    const serialized = JSON.stringify(result)
    for (const secret of [
      'originals/',
      'storageKey',
      'originalFilename',
      'mimeType',
      'processingErrorCode',
    ]) {
      assert.notInclude(serialized, secret)
    }
  })

  test('uses one UTC request timestamp for every access decision', async ({ assert }) => {
    const hierarchy = await createHierarchy('Single timestamp')
    const timestamps: DateTime[] = []
    const accessControl: StudentCatalogAccessControl = {
      async resolve(input) {
        timestamps.push(input.now)
        return {
          allowed: input.resourceType === 'COURSE',
          decision: input.resourceType === 'COURSE' ? 'ALLOW' : 'DENY',
          source: input.resourceType === 'COURSE' ? 'COURSE' : 'DEFAULT',
          ruleId: null,
        }
      },
    }

    await new StudentCatalogService({ accessControl }).getCourse({
      userId: student.id,
      courseId: hierarchy.course.id,
    })

    assert.lengthOf(timestamps, 3)
    assert.isTrue(timestamps.every((timestamp) => timestamp === timestamps[0]))
    assert.equal(timestamps[0].zoneName, 'UTC')
  })

  test('conceals missing, unpublished, and unreachable courses with the same error', async ({
    assert,
  }) => {
    const draft = await createHierarchy('Draft course', { status: 'DRAFT' })
    const unreachable = await createHierarchy('Unreachable course')
    await allow(student.id, 'COURSE', draft.course.id)
    const service = new StudentCatalogService()

    for (const courseId of [draft.course.id, unreachable.course.id, 2_147_483_647]) {
      await assert.rejects(
        () => service.getCourse({ userId: student.id, courseId }),
        StudentCatalogNotFoundError
      )
    }
  })
})

async function createHierarchy(
  title: string,
  options: {
    status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
    createdAt?: string
  } = {}
) {
  const course = await Course.create({
    title,
    description: `${title} description`,
    status: options.status ?? 'PUBLISHED',
    ...(options.createdAt ? { createdAt: DateTime.fromISO(options.createdAt) } : {}),
  })
  const module = await CourseModule.create({
    courseId: course.id,
    title: `${title} module`,
    description: `${title} module description`,
    position: 0,
  })
  const material = await createMaterial(module.id, `${title} material`, 'PDF', 'READY', 0)
  return { course, module, material }
}

function createMaterial(
  moduleId: number,
  title: string,
  type: MaterialType,
  processingStatus: MaterialProcessingStatus,
  position: number
) {
  return Material.create({
    moduleId,
    title,
    description: `${title} description`,
    type,
    storageKey: `originals/${title.toLowerCase().replaceAll(' ', '-')}-${Math.random()}`,
    originalFilename: `${title}.bin`,
    mimeType: 'application/octet-stream',
    size: 100,
    position,
    processingStatus,
    processingErrorCode: processingStatus === 'FAILED' ? 'PROCESSING_ERROR' : null,
  })
}

function allow(
  userId: number,
  resourceType: 'COURSE' | 'MODULE' | 'MATERIAL',
  resourceId: number,
  options: { expiresAt?: DateTime } = {}
) {
  return AccessRule.create({
    userId,
    resourceType,
    resourceId,
    capability: 'VIEW',
    effect: 'ALLOW',
    expiresAt: options.expiresAt,
  })
}
