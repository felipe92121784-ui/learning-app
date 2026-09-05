import User from '#models/user'
import { csrfSessionFrom, postLogin, withCsrf } from '../helpers/csrf.js'
import testUtils from '@adonisjs/core/services/test_utils'
import { test } from '@japa/runner'

const password = 'functional-test-password'
const activeUser = {
  email: 'active.auth@example.test',
  fullName: 'Active Student',
}
const blockedUser = {
  email: 'blocked.auth@example.test',
  fullName: 'Blocked Student',
}

test.group('Authentication', (group) => {
  let cleanupDatabase: () => Promise<void>

  group.each.setup(async () => {
    cleanupDatabase = await testUtils.db().truncate()
    await cleanupDatabase()

    await User.createMany([
      { ...activeUser, password, role: 'STUDENT', status: 'ACTIVE' },
      { ...blockedUser, password, role: 'STUDENT', status: 'BLOCKED' },
    ])
  })

  group.each.teardown(async () => {
    await cleanupDatabase()
  })

  test('creates an HTTP-only session for an active user that can load the profile', async ({
    assert,
    client,
  }) => {
    const login = await postLogin(client, {
      email: activeUser.email,
      password,
    })

    login.assertStatus(200)
    login.assertBodyContains({
      data: {
        user: {
          email: activeUser.email,
          fullName: activeUser.fullName,
          role: 'STUDENT',
          status: 'ACTIVE',
        },
      },
    })
    assert.notProperty(login.body().data, 'token')

    const sessionCookie = login.cookie('adonis-session')
    if (!sessionCookie) {
      throw new Error('Expected login to establish an adonis-session cookie')
    }

    if (!sessionCookie.httpOnly) {
      throw new Error('Expected the authentication session cookie to be HTTP-only')
    }

    const profile = await client
      .get('/api/v1/account/profile')
      .cookie(sessionCookie.name, sessionCookie.value)

    profile.assertStatus(200)
    profile.assertBodyContains({
      data: {
        user: {
          email: activeUser.email,
          fullName: activeUser.fullName,
          role: 'STUDENT',
          status: 'ACTIVE',
        },
      },
    })
  })

  test('returns the same generic failure for invalid credentials and blocked users', async ({
    assert,
    client,
  }) => {
    const invalidCredentials = await postLogin(client, {
      email: activeUser.email,
      password: 'wrong-password',
    })
    const blockedAccount = await postLogin(client, {
      email: blockedUser.email,
      password,
    })

    invalidCredentials.assertStatus(401)
    blockedAccount.assertStatus(401)
    assert.deepEqual(blockedAccount.body(), invalidCredentials.body())
  })

  test('ends access for a session when its user becomes blocked', async ({ client }) => {
    const login = await postLogin(client, {
      email: activeUser.email,
      password,
    })
    const sessionCookie = login.cookie('adonis-session')
    if (!sessionCookie) {
      throw new Error('Expected login to establish an adonis-session cookie')
    }

    await User.query().where('email', activeUser.email).update({ status: 'BLOCKED' })

    const profile = await client
      .get('/api/v1/account/profile')
      .cookie(sessionCookie.name, sessionCookie.value)

    profile.assertStatus(401)
  })

  test('invalidates the session on logout', async ({ client }) => {
    const login = await postLogin(client, {
      email: activeUser.email,
      password,
    })
    const sessionCookie = login.cookie('adonis-session')
    if (!sessionCookie) {
      throw new Error('Expected login to establish an adonis-session cookie')
    }

    const logout = await withCsrf(client.post('/api/v1/account/logout'), csrfSessionFrom(login))

    logout.assertStatus(200)
    logout.assertBodyContains({ message: 'Logged out successfully' })

    const profile = await client
      .get('/api/v1/account/profile')
      .cookie(sessionCookie.name, sessionCookie.value)

    profile.assertStatus(401)
  })

  test('does not expose a public signup route', async ({ client }) => {
    const response = await client.post('/api/v1/auth/signup').unsafeJson({
      fullName: 'Unwanted Signup',
      email: 'signup.auth@example.test',
      password,
      passwordConfirmation: password,
    })

    response.assertStatus(404)
  })
})
