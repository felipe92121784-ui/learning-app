import User from '#models/user'
import { bootstrapCsrf, csrfSessionFrom, postLogin, withCsrf } from '../helpers/csrf.js'
import hash from '@adonisjs/core/services/hash'
import testUtils from '@adonisjs/core/services/test_utils'
import type { ApiClient } from '@japa/api-client'
import { test } from '@japa/runner'

const currentPassword = 'current-password-123'
const newPassword = 'new-password-456'

async function login(client: ApiClient, user: User, password = currentPassword) {
  const response = await postLogin(client, {
    email: user.email,
    password,
  })

  response.assertStatus(200)
  return csrfSessionFrom(response)
}

test.group('Account password', (group) => {
  let user: User
  let cleanupDatabase: () => Promise<void>

  group.each.setup(async () => {
    cleanupDatabase = await testUtils.db().truncate()
    await cleanupDatabase()

    user = await User.create({
      fullName: 'Password Student',
      email: 'password.student@example.test',
      password: currentPassword,
      role: 'STUDENT',
      status: 'ACTIVE',
    })
  })

  group.each.teardown(async () => {
    await cleanupDatabase()
  })

  test('rejects an incorrect current password without changing the password', async ({
    assert,
    client,
  }) => {
    const sessionCookie = await login(client, user)
    const originalPasswordHash = user.password
    const response = await withCsrf(
      client.patch('/api/v1/account/password'),
      sessionCookie
    ).unsafeJson({
      currentPassword: 'incorrect-password',
      newPassword,
      newPasswordConfirmation: newPassword,
    })

    response.assertStatus(422)
    response.assertBodyContains({
      errors: [{ field: 'currentPassword', rule: 'current_password' }],
    })

    await user.refresh()
    assert.equal(user.password, originalPasswordHash)
    assert.isTrue(await hash.verify(user.password, currentPassword))
    assert.isFalse(await hash.verify(user.password, newPassword))
  })

  test('changes only the authenticated user password when the current password is correct', async ({
    assert,
    client,
  }) => {
    const otherUser = await User.create({
      fullName: 'Other Student',
      email: 'other.password.student@example.test',
      password: currentPassword,
      role: 'STUDENT',
      status: 'ACTIVE',
    })
    const otherPasswordHash = otherUser.password
    const sessionCookie = await login(client, user)
    const response = await withCsrf(
      client.patch('/api/v1/account/password'),
      sessionCookie
    ).unsafeJson({
      currentPassword,
      newPassword,
      newPasswordConfirmation: newPassword,
    })

    response.assertStatus(200)
    response.assertBodyContains({ message: 'Password updated successfully' })

    await user.refresh()
    await otherUser.refresh()
    assert.isTrue(await hash.verify(user.password, newPassword))
    assert.isFalse(await hash.verify(user.password, currentPassword))
    assert.equal(otherUser.password, otherPasswordHash)
    assert.isTrue(await hash.verify(otherUser.password, currentPassword))

    const oldPasswordLogin = await postLogin(client, {
      email: user.email,
      password: currentPassword,
    })
    const newPasswordLogin = await postLogin(client, {
      email: user.email,
      password: newPassword,
    })

    oldPasswordLogin.assertStatus(401)
    newPasswordLogin.assertStatus(200)
  })

  test('requires matching new password confirmation', async ({ assert, client }) => {
    const sessionCookie = await login(client, user)
    const response = await withCsrf(
      client.patch('/api/v1/account/password'),
      sessionCookie
    ).unsafeJson({
      currentPassword,
      newPassword,
      newPasswordConfirmation: 'different-password-789',
    })

    response.assertStatus(422)

    await user.refresh()
    assert.isTrue(await hash.verify(user.password, currentPassword))
    assert.isFalse(await hash.verify(user.password, newPassword))
  })

  test('requires an authenticated active session', async ({ client }) => {
    const csrf = await bootstrapCsrf(client)
    const response = await withCsrf(client.patch('/api/v1/account/password'), csrf).unsafeJson({
      currentPassword,
      newPassword,
      newPasswordConfirmation: newPassword,
    })

    response.assertStatus(401)
  })
})
