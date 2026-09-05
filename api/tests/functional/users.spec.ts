import User from '#models/user'
import { csrfSessionFrom, postLogin, withCsrf } from '../helpers/csrf.js'
import hash from '@adonisjs/core/services/hash'
import testUtils from '@adonisjs/core/services/test_utils'
import type { ApiClient } from '@japa/api-client'
import { test } from '@japa/runner'

const initialPassword = 'initial-password-123'
const changedPassword = 'changed-password-456'

async function login(client: ApiClient, user: User) {
  const response = await postLogin(client, {
    email: user.email,
    password: initialPassword,
  })

  response.assertStatus(200)
  return csrfSessionFrom(response)
}

test.group('Administrative users', (group) => {
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

  test('an administrator can list users without exposing passwords', async ({ assert, client }) => {
    const sessionCookie = await login(client, admin)
    const response = await client
      .get('/api/v1/users')
      .cookie(sessionCookie.name, sessionCookie.value)

    response.assertStatus(200)
    response.assertBodyContains({
      data: [
        {
          id: admin.id,
          fullName: admin.fullName,
          email: admin.email,
          role: 'ADMIN',
          status: 'ACTIVE',
        },
        {
          id: student.id,
          fullName: student.fullName,
          email: student.email,
          role: 'STUDENT',
          status: 'ACTIVE',
        },
      ],
    })
    const users = response.body().data as object[]
    assert.isTrue(users.every((user) => !('password' in user)))
  })

  test('an administrator creates an active student with a hashed password', async ({
    assert,
    client,
  }) => {
    const sessionCookie = await login(client, admin)
    const response = await withCsrf(client.post('/api/v1/users'), sessionCookie).unsafeJson({
      fullName: 'New Student',
      email: 'new.student@example.test',
      password: initialPassword,
      role: 'ADMIN',
      status: 'BLOCKED',
    })

    response.assertStatus(201)
    response.assertBodyContains({
      data: {
        fullName: 'New Student',
        email: 'new.student@example.test',
        role: 'STUDENT',
        status: 'ACTIVE',
      },
    })
    assert.notProperty(response.body().data, 'password')

    const created = await User.findByOrFail('email', 'new.student@example.test')
    assert.equal(created.role, 'STUDENT')
    assert.equal(created.status, 'ACTIVE')
    assert.isTrue(await hash.verify(created.password, initialPassword))
    assert.notEqual(created.password, initialPassword)
  })

  test('an administrator can show one user without exposing the password', async ({
    assert,
    client,
  }) => {
    const sessionCookie = await login(client, admin)
    const response = await client
      .get(`/api/v1/users/${student.id}`)
      .cookie(sessionCookie.name, sessionCookie.value)

    response.assertStatus(200)
    response.assertBodyContains({
      data: {
        id: student.id,
        fullName: student.fullName,
        email: student.email,
        role: 'STUDENT',
        status: 'ACTIVE',
      },
    })
    assert.notProperty(response.body().data, 'password')
  })

  test('an administrator updates only a user name and email', async ({ assert, client }) => {
    const originalPasswordHash = student.password
    const sessionCookie = await login(client, admin)
    const response = await withCsrf(
      client.patch(`/api/v1/users/${student.id}`),
      sessionCookie
    ).unsafeJson({
      fullName: 'Updated Student',
      email: 'updated.student@example.test',
      password: changedPassword,
      role: 'ADMIN',
      status: 'BLOCKED',
    })

    response.assertStatus(200)
    response.assertBodyContains({
      data: {
        id: student.id,
        fullName: 'Updated Student',
        email: 'updated.student@example.test',
        role: 'STUDENT',
        status: 'ACTIVE',
      },
    })
    assert.notProperty(response.body().data, 'password')

    await student.refresh()
    assert.equal(student.password, originalPasswordHash)
    assert.isTrue(await hash.verify(student.password, initialPassword))
    assert.isFalse(await hash.verify(student.password, changedPassword))
    assert.equal(student.role, 'STUDENT')
    assert.equal(student.status, 'ACTIVE')
  })

  test('an administrator can block and reactivate a student', async ({ assert, client }) => {
    const sessionCookie = await login(client, admin)
    const blockResponse = await withCsrf(
      client.patch(`/api/v1/users/${student.id}/status`),
      sessionCookie
    ).unsafeJson({ status: 'BLOCKED' })

    blockResponse.assertStatus(200)
    blockResponse.assertBodyContains({
      data: {
        id: student.id,
        status: 'BLOCKED',
      },
    })
    assert.notProperty(blockResponse.body().data, 'password')

    await student.refresh()
    assert.equal(student.status, 'BLOCKED')

    const activateResponse = await withCsrf(
      client.patch(`/api/v1/users/${student.id}/status`),
      sessionCookie
    ).unsafeJson({ status: 'ACTIVE' })

    activateResponse.assertStatus(200)
    activateResponse.assertBodyContains({
      data: {
        id: student.id,
        status: 'ACTIVE',
      },
    })

    await student.refresh()
    assert.equal(student.status, 'ACTIVE')
  })

  test('updating a user status rejects values other than ACTIVE and BLOCKED', async ({
    assert,
    client,
  }) => {
    const sessionCookie = await login(client, admin)
    const response = await withCsrf(
      client.patch(`/api/v1/users/${student.id}/status`),
      sessionCookie
    ).unsafeJson({ status: 'PENDING' })

    response.assertStatus(422)

    await student.refresh()
    response.assertBodyContains({ errors: [{ field: 'status' }] })
    assert.equal(student.status, 'ACTIVE')
  })

  test('blocking a student revokes their existing session without affecting the active admin', async ({
    client,
  }) => {
    const studentSessionCookie = await login(client, student)
    const adminSessionCookie = await login(client, admin)

    const blockResponse = await withCsrf(
      client.patch(`/api/v1/users/${student.id}/status`),
      adminSessionCookie
    ).unsafeJson({ status: 'BLOCKED' })

    blockResponse.assertStatus(200)

    const studentProfile = await client
      .get('/api/v1/account/profile')
      .cookie(studentSessionCookie.name, studentSessionCookie.value)
    const adminUsers = await client
      .get('/api/v1/users')
      .cookie(adminSessionCookie.name, adminSessionCookie.value)

    studentProfile.assertStatus(401)
    adminUsers.assertStatus(200)
  })

  test('a student receives 403 from every administrative user endpoint', async ({ client }) => {
    const sessionCookie = await login(client, student)
    const responses = [
      await client.get('/api/v1/users').cookie(sessionCookie.name, sessionCookie.value),
      await withCsrf(client.post('/api/v1/users'), sessionCookie).unsafeJson({
        fullName: 'Forbidden Student',
        email: 'forbidden.student@example.test',
        password: initialPassword,
      }),
      await client.get(`/api/v1/users/${admin.id}`).cookie(sessionCookie.name, sessionCookie.value),
      await withCsrf(client.patch(`/api/v1/users/${admin.id}`), sessionCookie).unsafeJson({
        fullName: 'Forbidden Update',
      }),
      await withCsrf(client.patch(`/api/v1/users/${admin.id}/status`), sessionCookie).unsafeJson({
        status: 'BLOCKED',
      }),
    ]

    for (const response of responses) {
      response.assertStatus(403)
    }
  })

  test('creating a user with a duplicate email returns 422', async ({ client }) => {
    const sessionCookie = await login(client, admin)
    const response = await withCsrf(client.post('/api/v1/users'), sessionCookie).unsafeJson({
      fullName: 'Duplicate Student',
      email: student.email,
      password: initialPassword,
    })

    response.assertStatus(422)
    response.assertBodyContains({
      errors: [{ field: 'email', rule: 'database.unique' }],
    })
  })

  test('updating a user to a duplicate email returns 422', async ({ client }) => {
    const sessionCookie = await login(client, admin)
    const response = await withCsrf(
      client.patch(`/api/v1/users/${student.id}`),
      sessionCookie
    ).unsafeJson({ email: admin.email })

    response.assertStatus(422)
    response.assertBodyContains({
      errors: [{ field: 'email', rule: 'database.unique' }],
    })
  })
})
