import AccessLog from '#models/access_log'
import AccessRule from '#models/access_rule'
import Course from '#models/course'
import CourseModule from '#models/course_module'
import Material from '#models/material'
import User from '#models/user'
import AccessControlService from '#services/access_control_service'
import testUtils from '@adonisjs/core/services/test_utils'
import type { ApiClient } from '@japa/api-client'
import { test } from '@japa/runner'
import { csrfSessionFrom, postLogin, type CsrfSession } from '../helpers/csrf.js'

const password = 'student-catalog-password'

test.group('Student catalog API', (group) => {
  let cleanupDatabase: () => Promise<void>
  let student: User

  group.each.setup(async () => {
    cleanupDatabase = await testUtils.db().truncate()
    await cleanupDatabase()
    student = await User.create({
      email: `student-catalog-api-${Math.random()}@example.test`,
      password,
      role: 'STUDENT',
      status: 'ACTIVE',
    })
  })

  group.each.teardown(async () => {
    await cleanupDatabase()
  })

  test('requires an active web session for list and detail', async ({ client }) => {
    const hierarchy = await createHierarchy('Authentication course')

    const guestList = await client.get('/api/v1/student/courses')
    guestList.assertStatus(401)
    const guestDetail = await client.get(`/api/v1/student/courses/${hierarchy.course.id}`)
    guestDetail.assertStatus(401)

    const session = await login(client, student)
    await User.query().where('id', student.id).update({ status: 'BLOCKED' })
    const blockedList = await authenticatedGet(client, '/api/v1/student/courses', session)
    blockedList.assertStatus(401)
  })

  test('returns safe list/detail envelopes and writes no access logs', async ({
    assert,
    client,
  }) => {
    const hierarchy = await createHierarchy('Published API course')
    const locked = await createMaterial(
      hierarchy.module.id,
      'Locked API material',
      1,
      'READY',
      'IMAGE'
    )
    const processing = await createMaterial(
      hierarchy.module.id,
      'Processing API material',
      2,
      'PROCESSING',
      'PDF'
    )
    await allow(student.id, 'COURSE', hierarchy.course.id)
    await AccessRule.create({
      userId: student.id,
      resourceType: 'MATERIAL',
      resourceId: locked.id,
      capability: 'VIEW',
      effect: 'DENY',
    })
    const session = await login(client, student)

    const list = await authenticatedGet(client, '/api/v1/student/courses', session)
    list.assertStatus(200)
    assert.deepEqual(list.body(), {
      data: [
        {
          id: hierarchy.course.id,
          title: 'Published API course',
          description: 'Published API course description',
          moduleCount: 1,
        },
      ],
    })

    const detail = await authenticatedGet(
      client,
      `/api/v1/student/courses/${hierarchy.course.id}`,
      session
    )
    detail.assertStatus(200)
    const detailBody = detail.body() as StudentCourseDetailEnvelope
    const materials = detailBody.data.modules[0].materials
    assert.equal(materials[0].availability, 'AVAILABLE')
    assert.equal(materials[1].availability, 'LOCKED')
    assert.equal(materials[2].id, processing.id)
    assert.deepInclude(materials[2], {
      availability: 'UNAVAILABLE',
      unavailableReason: 'PROCESSING',
    })
    const body = JSON.stringify(detail.body())
    for (const secret of [
      hierarchy.material.storageKey,
      'originals/',
      'storageKey',
      'originalFilename',
      'mimeType',
      'processingStatus',
      'processingErrorCode',
      'download',
      'url',
    ]) {
      assert.notInclude(body, secret)
    }
    assert.lengthOf(await AccessLog.all(), 0)
  })

  test('returns the same generic 404 for unpublished and unreachable courses', async ({
    assert,
    client,
  }) => {
    const draft = await createHierarchy('Draft API course', 'DRAFT')
    const unreachable = await createHierarchy('Unreachable API course')
    await allow(student.id, 'COURSE', draft.course.id)
    const session = await login(client, student)

    for (const id of [draft.course.id, unreachable.course.id, 2_147_483_647]) {
      const response = await authenticatedGet(client, `/api/v1/student/courses/${id}`, session)
      response.assertStatus(404)
      assert.deepEqual(response.body(), { message: 'Course not found' })
    }
  })

  test('rejects invalid route IDs without disclosing catalog data', async ({ assert, client }) => {
    const session = await login(client, student)

    for (const id of ['not-a-number', '0', '-1', '1.5', '2147483648']) {
      const response = await authenticatedGet(client, `/api/v1/student/courses/${id}`, session)
      response.assertStatus(422)
      assert.notInclude(response.text(), 'Course not found')
    }
  })

  test('survives a resource deletion between preload and access resolution', async ({
    assert,
    client,
  }) => {
    const healthy = await createHierarchy('Healthy concurrent course')
    const disappearingFromList = await createHierarchy('Disappearing list course')
    await allow(student.id, 'COURSE', healthy.course.id)
    await allow(student.id, 'MATERIAL', disappearingFromList.material.id)
    const session = await login(client, student)
    const originalResolve = AccessControlService.prototype.resolve
    let materialToDelete = disappearingFromList.material.id

    AccessControlService.prototype.resolve = async function (input) {
      if (input.resourceType === 'MATERIAL' && input.resourceId === materialToDelete) {
        materialToDelete = -1
        const material = await Material.findOrFail(input.resourceId)
        await material.delete()
      }
      return originalResolve.call(this, input)
    }

    try {
      const list = await authenticatedGet(client, '/api/v1/student/courses', session)
      list.assertStatus(200)
      assert.deepEqual(
        (list.body() as { data: Array<{ id: number }> }).data.map((course) => course.id),
        [healthy.course.id]
      )

      const disappearingFromDetail = await createHierarchy('Disappearing detail course')
      await allow(student.id, 'MATERIAL', disappearingFromDetail.material.id)
      materialToDelete = disappearingFromDetail.material.id
      const detail = await authenticatedGet(
        client,
        `/api/v1/student/courses/${disappearingFromDetail.course.id}`,
        session
      )
      detail.assertStatus(404)
      assert.deepEqual(detail.body(), { message: 'Course not found' })
      assert.notInclude(detail.text(), disappearingFromDetail.material.title)
      assert.lengthOf(await AccessLog.all(), 0)
    } finally {
      AccessControlService.prototype.resolve = originalResolve
    }
  })
})

async function login(client: ApiClient, user: User) {
  const response = await postLogin(client, { email: user.email, password })
  response.assertStatus(200)
  return csrfSessionFrom(response)
}

function authenticatedGet(client: ApiClient, path: string, session: CsrfSession) {
  return client.get(path).cookie(session.name, session.value)
}

async function createHierarchy(title: string, status: 'DRAFT' | 'PUBLISHED' = 'PUBLISHED') {
  const course = await Course.create({
    title,
    description: `${title} description`,
    status,
  })
  const module = await CourseModule.create({
    courseId: course.id,
    title: `${title} module`,
    description: `${title} module description`,
    position: 0,
  })
  const material = await createMaterial(module.id, `${title} material`, 0, 'READY', 'PDF')
  return { course, module, material }
}

function createMaterial(
  moduleId: number,
  title: string,
  position: number,
  processingStatus: 'READY' | 'PROCESSING',
  type: 'PDF' | 'IMAGE'
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
  })
}

function allow(userId: number, resourceType: 'COURSE' | 'MODULE' | 'MATERIAL', resourceId: number) {
  return AccessRule.create({
    userId,
    resourceType,
    resourceId,
    capability: 'VIEW',
    effect: 'ALLOW',
  })
}

interface StudentCourseDetailEnvelope {
  data: {
    modules: Array<{
      materials: Array<{
        id: number
        availability: string
        unavailableReason?: string
      }>
    }>
  }
}
