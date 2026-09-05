import Course from '#models/course'
import CourseModule from '#models/course_module'
import User from '#models/user'
import CourseModuleTransformer from '#transformers/course_module_transformer'
import CourseTransformer from '#transformers/course_transformer'
import {
  createCourseValidator,
  createModuleValidator,
  reorderModulesValidator,
  updateCourseValidator,
} from '#validators/course'
import type { ApiClient, ApiRequest, ApiResponse } from '@japa/api-client'
import testUtils from '@adonisjs/core/services/test_utils'
import { test } from '@japa/runner'
import { DateTime } from 'luxon'

const initialPassword = 'initial-password-123'

function xsrfHeaderValue(response: ApiResponse) {
  const setCookie = response.header('set-cookie')
  const xsrfCookie = (Array.isArray(setCookie) ? setCookie : [setCookie]).find((cookie) =>
    cookie?.startsWith('XSRF-TOKEN=')
  )
  const value = xsrfCookie?.match(/^XSRF-TOKEN=([^;]+)/)?.[1]
  if (!value) {
    throw new Error('Expected an encrypted XSRF-TOKEN response cookie')
  }

  return value
}

interface AuthSession {
  name: string
  value: string
  xsrfName: string
  xsrfValue: string
  xsrfHeader: string
}

function withCsrf(request: ApiRequest, session: AuthSession) {
  return request
    .cookie(session.name, session.value)
    .cookie(session.xsrfName, session.xsrfValue)
    .header('x-xsrf-token', session.xsrfHeader)
}

async function login(client: ApiClient, user: User): Promise<AuthSession> {
  const bootstrap = await client.get('/api/v1/account/profile')
  bootstrap.assertStatus(401)
  const bootstrapSession = bootstrap.cookie('adonis-session')
  const bootstrapXsrf = bootstrap.cookie('XSRF-TOKEN')
  if (!bootstrapSession || !bootstrapXsrf) {
    throw new Error('Expected profile bootstrap to establish session and XSRF cookies')
  }

  const response = await client
    .post('/api/v1/auth/login')
    .cookie(bootstrapSession.name, bootstrapSession.value)
    .cookie(bootstrapXsrf.name, bootstrapXsrf.value)
    .header('x-xsrf-token', xsrfHeaderValue(bootstrap))
    .unsafeJson({
      email: user.email,
      password: initialPassword,
    })

  response.assertStatus(200)
  const sessionCookie = response.cookie('adonis-session')
  if (!sessionCookie) {
    throw new Error('Expected login to establish an adonis-session cookie')
  }

  const xsrfCookie = response.cookie('XSRF-TOKEN')
  if (!xsrfCookie) {
    throw new Error('Expected login to refresh the XSRF-TOKEN cookie')
  }

  return {
    name: sessionCookie.name,
    value: sessionCookie.value,
    xsrfName: xsrfCookie.name,
    xsrfValue: xsrfCookie.value,
    xsrfHeader: xsrfHeaderValue(response),
  }
}

test.group('Course catalog persistence contracts', (group) => {
  let cleanupDatabase: () => Promise<void>

  group.each.setup(async () => {
    cleanupDatabase = await testUtils.db().truncate()
    await cleanupDatabase()
  })

  group.each.teardown(async () => {
    await cleanupDatabase()
  })

  test('persists a course and its modules with a cascading relation', async ({ assert }) => {
    const course = await Course.create({ title: 'Intro to TypeScript' })
    const modules = await CourseModule.createMany([
      {
        courseId: course.id,
        title: 'Advanced types',
        position: 2,
      },
      {
        courseId: course.id,
        title: 'Basics',
        position: 0,
      },
      {
        courseId: course.id,
        title: 'Functions',
        position: 1,
      },
    ])
    const module = modules[0]

    await course.load('modules')
    await module.load('course')

    assert.equal(course.modules.length, 3)
    assert.deepEqual(
      course.modules.map((courseModule) => courseModule.position),
      [0, 1, 2]
    )
    assert.equal(module.course.id, course.id)
    await course.delete()
    assert.isNull(await CourseModule.find(module.id))
  })

  test('serializes only public course and module fields in camelCase', async ({ assert }) => {
    const course = new Course()
    course.id = 7
    course.title = 'Course'
    course.description = null
    course.status = 'PUBLISHED'

    const module = new CourseModule()
    module.id = 8
    module.courseId = 7
    module.title = 'Module'
    module.description = null
    module.position = 2

    assert.deepEqual(new CourseTransformer(course).toObject(), {
      id: 7,
      title: 'Course',
      description: null,
      status: 'PUBLISHED',
      createdAt: course.createdAt,
      updatedAt: course.updatedAt,
    })
    assert.deepEqual(new CourseModuleTransformer(module).toObject(), {
      id: 8,
      courseId: 7,
      title: 'Module',
      description: null,
      position: 2,
      createdAt: module.createdAt,
      updatedAt: module.updatedAt,
    })
  })

  test('validates course, module, and reorder payload contracts', async ({ assert }) => {
    const course = await createCourseValidator.validate({
      title: '  Valid course  ',
      description: '  A description  ',
      status: 'ARCHIVED',
    })
    assert.equal(course.title, 'Valid course')
    assert.equal(course.description, 'A description')

    const module = await createModuleValidator.validate({
      title: '  Module  ',
      description: '  Text  ',
    })
    assert.equal(module.title, 'Module')
    assert.equal(module.description, 'Text')

    const order = await reorderModulesValidator.validate({ moduleIds: [3, 1, 2] })
    assert.deepEqual(order.moduleIds, [3, 1, 2])

    const createPayload = await createCourseValidator.validate({
      title: 'Course',
      status: 'PUBLISHED',
    })
    assert.notProperty(createPayload, 'status')
    await assert.rejects(() => reorderModulesValidator.validate({ moduleIds: [3, 3] }))
    await assert.rejects(() => updateCourseValidator.validate({ status: 'PENDING' }))
    await assert.rejects(() => createCourseValidator.validate({ title: 'X' }))
    await assert.rejects(() =>
      createCourseValidator.validate({ title: 'Course', description: 'x'.repeat(2001) })
    )
    await assert.rejects(() => reorderModulesValidator.validate({ moduleIds: ['3', 1] }))
    await assert.rejects(() => reorderModulesValidator.validate({ moduleIds: [-1, 2] }))
    await assert.rejects(() => reorderModulesValidator.validate({ moduleIds: [1.5, 2] }))
  })
})

test.group('Administrative courses', (group) => {
  let admin: User
  let student: User
  let cleanupDatabase: () => Promise<void>

  group.each.setup(async () => {
    cleanupDatabase = await testUtils.db().truncate()
    await cleanupDatabase()

    ;[admin, student] = await User.createMany([
      {
        fullName: 'Ada Admin',
        email: 'ada.admin@example.test',
        password: initialPassword,
        role: 'ADMIN',
        status: 'ACTIVE',
      },
      {
        fullName: 'Sam Student',
        email: 'sam.student@example.test',
        password: initialPassword,
        role: 'STUDENT',
        status: 'ACTIVE',
      },
    ])
  })

  group.each.teardown(async () => {
    await cleanupDatabase()
  })

  test('bootstraps login with an XSRF cookie and protects course mutations', async ({
    assert,
    client,
  }) => {
    const bootstrap = await client.get('/api/v1/account/profile')
    bootstrap.assertStatus(401)
    const bootstrapSession = bootstrap.cookie('adonis-session')
    const bootstrapXsrf = bootstrap.cookie('XSRF-TOKEN')
    if (!bootstrapSession || !bootstrapXsrf) {
      throw new Error('Expected profile bootstrap to establish session and XSRF cookies')
    }

    const loginResponse = await client
      .post('/api/v1/auth/login')
      .cookie(bootstrapSession.name, bootstrapSession.value)
      .cookie(bootstrapXsrf.name, bootstrapXsrf.value)
      .header('x-xsrf-token', xsrfHeaderValue(bootstrap))
      .unsafeJson({ email: admin.email, password: initialPassword })
    loginResponse.assertStatus(200)
    const sessionCookie = loginResponse.cookie('adonis-session')
    const xsrfCookie = loginResponse.cookie('XSRF-TOKEN')
    if (!sessionCookie || !xsrfCookie) {
      throw new Error('Expected login to refresh session and XSRF cookies')
    }

    const missingToken = await client
      .post('/api/v1/courses')
      .redirects(0)
      .cookie(sessionCookie.name, sessionCookie.value)
      .unsafeJson({ title: 'Missing token' })
    missingToken.assertStatus(302)
    assert.isNull(await Course.findBy('title', 'Missing token'))

    const validToken = await client
      .post('/api/v1/courses')
      .cookie(sessionCookie.name, sessionCookie.value)
      .cookie(xsrfCookie.name, xsrfCookie.value)
      .header('x-xsrf-token', xsrfHeaderValue(loginResponse))
      .unsafeJson({ title: 'Valid token' })
    validToken.assertStatus(201)
  })

  test('an administrator creates a draft course with an empty module list', async ({
    assert,
    client,
  }) => {
    const sessionCookie = await login(client, admin)
    const response = await withCsrf(client.post('/api/v1/courses'), sessionCookie).unsafeJson({
      title: '  Intro to TypeScript  ',
      description: '  Type-safe JavaScript  ',
      status: 'PUBLISHED',
    })

    response.assertStatus(201)
    response.assertBodyContains({
      data: {
        title: 'Intro to TypeScript',
        description: 'Type-safe JavaScript',
        status: 'DRAFT',
        modules: [],
      },
    })

    const created = await Course.findByOrFail('title', 'Intro to TypeScript')
    assert.equal(created.status, 'DRAFT')
  })

  test('an administrator lists newest courses first and shows modules by position', async ({
    client,
  }) => {
    const oldest = await Course.create({ title: 'Oldest course' })
    const newest = await Course.create({ title: 'Newest course' })
    await CourseModule.createMany([
      { courseId: newest.id, title: 'Third module', position: 2 },
      { courseId: newest.id, title: 'First module', position: 0 },
      { courseId: newest.id, title: 'Second module', position: 1 },
    ])
    const sessionCookie = await login(client, admin)

    const listResponse = await client
      .get('/api/v1/courses')
      .cookie(sessionCookie.name, sessionCookie.value)
    listResponse.assertStatus(200)
    listResponse.assertBodyContains({ data: [{ id: newest.id }, { id: oldest.id }] })

    const showResponse = await client
      .get(`/api/v1/courses/${newest.id}`)
      .cookie(sessionCookie.name, sessionCookie.value)
    showResponse.assertStatus(200)
    showResponse.assertBodyContains({
      data: {
        id: newest.id,
        modules: [
          { title: 'First module', position: 0 },
          { title: 'Second module', position: 1 },
          { title: 'Third module', position: 2 },
        ],
      },
    })
  })

  test('orders courses with identical creation times by descending ID', async ({
    assert,
    client,
  }) => {
    const createdAt = DateTime.fromISO('2026-09-04T12:00:00.000Z')
    const first = await Course.create({ title: 'First tied course', createdAt })
    const second = await Course.create({ title: 'Second tied course', createdAt })
    const sessionCookie = await login(client, admin)

    const response = await client
      .get('/api/v1/courses')
      .cookie(sessionCookie.name, sessionCookie.value)

    response.assertStatus(200)
    const listedCourses = response.body().data as Array<{ id: number }>
    assert.deepEqual(
      listedCourses.map((listedCourse) => listedCourse.id),
      [second.id, first.id]
    )
  })

  test('an administrator updates a course title, description, and status', async ({ client }) => {
    const course = await Course.create({ title: 'Original course' })
    const sessionCookie = await login(client, admin)
    const response = await withCsrf(
      client.patch(`/api/v1/courses/${course.id}`),
      sessionCookie
    ).unsafeJson({
      title: 'Updated course',
      description: 'Updated description',
      status: 'PUBLISHED',
    })

    response.assertStatus(200)
    response.assertBodyContains({
      data: {
        id: course.id,
        title: 'Updated course',
        description: 'Updated description',
        status: 'PUBLISHED',
      },
    })
  })

  test('an administrator persists cleared course and module descriptions as null', async ({
    assert,
    client,
  }) => {
    const course = await Course.create({
      title: 'Descriptions course',
      description: 'Course description',
    })
    const module = await CourseModule.create({
      courseId: course.id,
      title: 'Descriptions module',
      description: 'Module description',
      position: 0,
    })
    const sessionCookie = await login(client, admin)

    const courseResponse = await withCsrf(
      client.patch(`/api/v1/courses/${course.id}`),
      sessionCookie
    ).unsafeJson({ description: null })
    const moduleResponse = await withCsrf(
      client.patch(`/api/v1/courses/${course.id}/modules/${module.id}`),
      sessionCookie
    ).unsafeJson({ description: null })

    courseResponse.assertStatus(200)
    courseResponse.assertBodyContains({ data: { description: null } })
    moduleResponse.assertStatus(200)
    moduleResponse.assertBodyContains({ data: { description: null } })
    await course.refresh()
    await module.refresh()
    assert.isNull(course.description)
    assert.isNull(module.description)
  })

  test('an administrator adds modules to the end of a course', async ({ client }) => {
    const course = await Course.create({ title: 'Ordered course' })
    await CourseModule.createMany([
      { courseId: course.id, title: 'First module', position: 0 },
      { courseId: course.id, title: 'Second module', position: 1 },
    ])
    const sessionCookie = await login(client, admin)
    const response = await withCsrf(
      client.post(`/api/v1/courses/${course.id}/modules`),
      sessionCookie
    ).unsafeJson({ title: 'Third module', description: 'At the end' })

    response.assertStatus(201)
    response.assertBodyContains({
      data: {
        courseId: course.id,
        title: 'Third module',
        description: 'At the end',
        position: 2,
      },
    })
  })

  test('concurrent module creation appends each module without duplicate positions', async ({
    assert,
    client,
  }) => {
    const course = await Course.create({ title: 'Concurrent course' })
    const sessionCookie = await login(client, admin)
    const createModule = (title: string) =>
      withCsrf(client.post(`/api/v1/courses/${course.id}/modules`), sessionCookie).unsafeJson({
        title,
      })

    const responses = await Promise.all([
      createModule('First module'),
      createModule('Second module'),
    ])

    for (const response of responses) {
      response.assertStatus(201)
    }

    const modules = await CourseModule.query().where('course_id', course.id).orderBy('position')
    assert.deepEqual(
      modules.map((module) => module.position),
      [0, 1]
    )
  })

  test('serializes concurrent module deletion and reorder without position gaps', async ({
    assert,
    client,
  }) => {
    const course = await Course.create({ title: 'Interleaved module course' })
    const [first, middle, last] = await CourseModule.createMany([
      { courseId: course.id, title: 'First module', position: 0 },
      { courseId: course.id, title: 'Middle module', position: 1 },
      { courseId: course.id, title: 'Last module', position: 2 },
    ])
    const sessionCookie = await login(client, admin)

    const [deleteResponse, reorderResponse] = await Promise.all([
      withCsrf(client.delete(`/api/v1/courses/${course.id}/modules/${middle.id}`), sessionCookie),
      withCsrf(client.put(`/api/v1/courses/${course.id}/modules/order`), sessionCookie).unsafeJson({
        moduleIds: [last.id, first.id, middle.id],
      }),
    ])

    deleteResponse.assertStatus(204)
    assert.include([200, 422], reorderResponse.status())
    const modules = await CourseModule.query().where('course_id', course.id).orderBy('position')
    assert.sameMembers(
      modules.map((courseModule) => courseModule.id),
      [first.id, last.id]
    )
    assert.deepEqual(
      modules.map((courseModule) => courseModule.position),
      [0, 1]
    )
  })

  test('an administrator updates a module and deletion compacts positions', async ({
    assert,
    client,
  }) => {
    const course = await Course.create({ title: 'Module course' })
    const [first, middle, last] = await CourseModule.createMany([
      { courseId: course.id, title: 'First module', position: 0 },
      { courseId: course.id, title: 'Middle module', position: 1 },
      { courseId: course.id, title: 'Last module', position: 2 },
    ])
    const sessionCookie = await login(client, admin)
    const updateResponse = await withCsrf(
      client.patch(`/api/v1/courses/${course.id}/modules/${middle.id}`),
      sessionCookie
    ).unsafeJson({ title: 'Updated middle module', description: 'Updated text' })

    updateResponse.assertStatus(200)
    updateResponse.assertBodyContains({
      data: { id: middle.id, title: 'Updated middle module', description: 'Updated text' },
    })

    const deleteResponse = await withCsrf(
      client.delete(`/api/v1/courses/${course.id}/modules/${middle.id}`),
      sessionCookie
    )
    deleteResponse.assertStatus(204)
    assert.isNull(await CourseModule.find(middle.id))

    const remainingModules = await CourseModule.query()
      .where('course_id', course.id)
      .orderBy('position')
    assert.deepEqual(
      remainingModules.map((courseModule) => [courseModule.id, courseModule.position]),
      [
        [first.id, 0],
        [last.id, 1],
      ]
    )
  })

  test('updates timestamps only on modules repositioned by deletion', async ({
    assert,
    client,
  }) => {
    const course = await Course.create({ title: 'Timestamp deletion course' })
    const [first, middle, last] = await CourseModule.createMany([
      { courseId: course.id, title: 'First module', position: 0 },
      { courseId: course.id, title: 'Middle module', position: 1 },
      { courseId: course.id, title: 'Last module', position: 2 },
    ])
    const oldTimestamp = DateTime.fromISO('2020-01-01T00:00:00.000Z')
    await CourseModule.query()
      .whereIn('id', [first.id, last.id])
      .update({ updatedAt: oldTimestamp })
    const sessionCookie = await login(client, admin)

    const response = await withCsrf(
      client.delete(`/api/v1/courses/${course.id}/modules/${middle.id}`),
      sessionCookie
    )

    response.assertStatus(204)
    await first.refresh()
    await last.refresh()
    assert.equal(first.updatedAt?.toISO(), oldTimestamp.toISO())
    assert.isTrue((last.updatedAt?.toMillis() ?? 0) > oldTimestamp.toMillis())
  })

  test('an administrator persists a valid complete module ordering', async ({ assert, client }) => {
    const course = await Course.create({ title: 'Reorder course' })
    const [first, second, third] = await CourseModule.createMany([
      { courseId: course.id, title: 'First module', position: 0 },
      { courseId: course.id, title: 'Second module', position: 1 },
      { courseId: course.id, title: 'Third module', position: 2 },
    ])
    const sessionCookie = await login(client, admin)
    const response = await withCsrf(
      client.put(`/api/v1/courses/${course.id}/modules/order`),
      sessionCookie
    ).unsafeJson({ moduleIds: [third.id, first.id, second.id] })

    response.assertStatus(200)
    response.assertBodyContains({
      data: {
        id: course.id,
        modules: [
          { id: third.id, position: 0 },
          { id: first.id, position: 1 },
          { id: second.id, position: 2 },
        ],
      },
    })
    const orderedModules = await CourseModule.query()
      .where('course_id', course.id)
      .orderBy('position')
    assert.deepEqual(
      orderedModules.map((module) => module.id),
      [third.id, first.id, second.id]
    )
  })

  test('updates timestamps on modules changed by reordering', async ({ assert, client }) => {
    const course = await Course.create({ title: 'Timestamp reorder course' })
    const [first, second, third] = await CourseModule.createMany([
      { courseId: course.id, title: 'First module', position: 0 },
      { courseId: course.id, title: 'Second module', position: 1 },
      { courseId: course.id, title: 'Third module', position: 2 },
    ])
    const oldTimestamp = DateTime.fromISO('2020-01-01T00:00:00.000Z')
    await CourseModule.query().where('course_id', course.id).update({ updatedAt: oldTimestamp })
    const sessionCookie = await login(client, admin)

    const response = await withCsrf(
      client.put(`/api/v1/courses/${course.id}/modules/order`),
      sessionCookie
    ).unsafeJson({ moduleIds: [third.id, first.id, second.id] })

    response.assertStatus(200)
    const modules = await CourseModule.query().where('course_id', course.id)
    assert.isTrue(
      modules.every(
        (courseModule) => (courseModule.updatedAt?.toMillis() ?? 0) > oldTimestamp.toMillis()
      )
    )
  })

  test('an administrator receives validation errors for missing, foreign, and duplicate module IDs', async ({
    client,
  }) => {
    const course = await Course.create({ title: 'Validation course' })
    const otherCourse = await Course.create({ title: 'Other course' })
    const [first, second] = await CourseModule.createMany([
      { courseId: course.id, title: 'First module', position: 0 },
      { courseId: course.id, title: 'Second module', position: 1 },
    ])
    const foreign = await CourseModule.create({
      courseId: otherCourse.id,
      title: 'Foreign module',
      position: 0,
    })
    const sessionCookie = await login(client, admin)

    const responses = await Promise.all([
      withCsrf(client.put(`/api/v1/courses/${course.id}/modules/order`), sessionCookie).unsafeJson({
        moduleIds: [first.id],
      }),
      withCsrf(client.put(`/api/v1/courses/${course.id}/modules/order`), sessionCookie).unsafeJson({
        moduleIds: [first.id, foreign.id],
      }),
      withCsrf(client.put(`/api/v1/courses/${course.id}/modules/order`), sessionCookie).unsafeJson({
        moduleIds: [first.id, first.id, second.id],
      }),
    ])

    for (const response of responses) {
      response.assertStatus(422)
    }
  })

  test('an administrator cannot update or delete a module from another course', async ({
    client,
  }) => {
    const course = await Course.create({ title: 'Current course' })
    const otherCourse = await Course.create({ title: 'Other course' })
    const foreignModule = await CourseModule.create({
      courseId: otherCourse.id,
      title: 'Foreign module',
      position: 0,
    })
    const sessionCookie = await login(client, admin)

    const responses = await Promise.all([
      withCsrf(
        client.patch(`/api/v1/courses/${course.id}/modules/${foreignModule.id}`),
        sessionCookie
      ).unsafeJson({ title: 'Forbidden update' }),
      withCsrf(
        client.delete(`/api/v1/courses/${course.id}/modules/${foreignModule.id}`),
        sessionCookie
      ),
    ])

    for (const response of responses) {
      response.assertStatus(404)
    }
  })

  test('an administrator receives 422 for malformed numeric route IDs', async ({ client }) => {
    const course = await Course.create({ title: 'Route validation course' })
    const module = await CourseModule.create({
      courseId: course.id,
      title: 'Route validation module',
      position: 0,
    })
    const sessionCookie = await login(client, admin)
    const responses = await Promise.all([
      client.get('/api/v1/courses/not-a-number').cookie(sessionCookie.name, sessionCookie.value),
      withCsrf(client.patch('/api/v1/courses/not-a-number'), sessionCookie).unsafeJson({
        title: 'Invalid route',
      }),
      withCsrf(client.post('/api/v1/courses/not-a-number/modules'), sessionCookie).unsafeJson({
        title: 'Invalid route',
      }),
      withCsrf(
        client.patch(`/api/v1/courses/${course.id}/modules/not-a-number`),
        sessionCookie
      ).unsafeJson({ title: 'Invalid route' }),
      withCsrf(client.delete(`/api/v1/courses/${course.id}/modules/not-a-number`), sessionCookie),
      withCsrf(client.put('/api/v1/courses/not-a-number/modules/order'), sessionCookie).unsafeJson({
        moduleIds: [module.id],
      }),
    ])

    for (const response of responses) {
      response.assertStatus(422)
      response.assertBodyContains({ errors: [{ rule: 'number' }] })
    }
  })

  test('an administrator receives 422 for route IDs above the PostgreSQL integer maximum', async ({
    client,
  }) => {
    const sessionCookie = await login(client, admin)
    const response = await client
      .get('/api/v1/courses/2147483648')
      .cookie(sessionCookie.name, sessionCookie.value)

    response.assertStatus(422)
    response.assertBodyContains({ errors: [{ field: 'id', rule: 'number' }] })
  })

  test('an unauthenticated visitor cannot access administrative courses', async ({ client }) => {
    const course = await Course.create({ title: 'Unauthenticated course' })

    const responses = await Promise.all([
      client.get('/api/v1/courses'),
      client.get(`/api/v1/courses/${course.id}`),
    ])

    for (const response of responses) {
      response.assertStatus(401)
    }
  })

  test('a student receives 403 from every administrative course endpoint', async ({ client }) => {
    const course = await Course.create({ title: 'Protected course' })
    const module = await CourseModule.create({
      courseId: course.id,
      title: 'Protected module',
      position: 0,
    })
    const sessionCookie = await login(client, student)
    const responses = await Promise.all([
      client.get('/api/v1/courses').cookie(sessionCookie.name, sessionCookie.value),
      withCsrf(client.post('/api/v1/courses'), sessionCookie).unsafeJson({
        title: 'Forbidden course',
      }),
      client.get(`/api/v1/courses/${course.id}`).cookie(sessionCookie.name, sessionCookie.value),
      withCsrf(client.patch(`/api/v1/courses/${course.id}`), sessionCookie).unsafeJson({
        title: 'Forbidden course',
      }),
      withCsrf(client.post(`/api/v1/courses/${course.id}/modules`), sessionCookie).unsafeJson({
        title: 'Forbidden module',
      }),
      withCsrf(
        client.patch(`/api/v1/courses/${course.id}/modules/${module.id}`),
        sessionCookie
      ).unsafeJson({ title: 'Forbidden module' }),
      withCsrf(client.delete(`/api/v1/courses/${course.id}/modules/${module.id}`), sessionCookie),
      withCsrf(client.put(`/api/v1/courses/${course.id}/modules/order`), sessionCookie).unsafeJson({
        moduleIds: [module.id],
      }),
    ])

    for (const response of responses) {
      response.assertStatus(403)
    }
  })
})
