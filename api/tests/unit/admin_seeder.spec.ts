import env from '#start/env'
import User from '#models/user'
import hash from '@adonisjs/core/services/hash'
import app from '@adonisjs/core/services/app'
import testUtils from '@adonisjs/core/services/test_utils'
import { test } from '@japa/runner'
import { Secret } from '@poppinss/utils'

const admin = {
  name: 'Initial Administrator',
  email: 'admin.seed-test@example.test',
  password: 'seed-test-password',
}

test.group('AdminSeeder', (group) => {
  let cleanupDatabase: () => Promise<void>

  group.each.setup(async () => {
    cleanupDatabase = await testUtils.db().truncate()
    env.set('ADMIN_NAME', admin.name)
    env.set('ADMIN_EMAIL', admin.email)
    env.set('ADMIN_PASSWORD', new Secret(admin.password))
  })

  group.each.teardown(async () => {
    await cleanupDatabase()
  })

  test('creates one active administrator for the configured email when run twice', async ({
    assert,
  }) => {
    const { default: AdminSeeder } = await import('#database/seeders/admin_seeder')
    const db = await app.container.make('lucid.db')
    const seeder = new AdminSeeder(db.connection())

    await seeder.run()
    await seeder.run()

    const users = await User.query().where('email', admin.email)

    assert.lengthOf(users, 1)
    assert.equal(users[0].fullName, admin.name)
    assert.equal(users[0].role, 'ADMIN')
    assert.equal(users[0].status, 'ACTIVE')
    assert.isTrue(await hash.verify(users[0].password, admin.password))
  })

  test('rejects a missing administrator setting with a clear error', async ({ assert }) => {
    const { default: AdminSeeder } = await import('#database/seeders/admin_seeder')
    const db = await app.container.make('lucid.db')
    const seeder = new AdminSeeder(db.connection())
    env.set('ADMIN_PASSWORD', new Secret(''))

    await assert.rejects(() => seeder.run(), 'ADMIN_PASSWORD must be defined')
  })
})
