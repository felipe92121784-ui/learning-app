import User from '#models/user'
import env from '#start/env'
import { BaseSeeder } from '@adonisjs/lucid/seeders'

export default class AdminSeeder extends BaseSeeder {
  async run() {
    const name = env.get('ADMIN_NAME')
    const email = env.get('ADMIN_EMAIL')
    const password = env.get('ADMIN_PASSWORD')?.release()

    if (!name) {
      throw new Error('ADMIN_NAME must be defined')
    }

    if (!email) {
      throw new Error('ADMIN_EMAIL must be defined')
    }

    if (!password) {
      throw new Error('ADMIN_PASSWORD must be defined')
    }

    await User.firstOrCreate(
      { email },
      {
        fullName: name,
        password,
        role: 'ADMIN',
        status: 'ACTIVE',
      },
      { client: this.client }
    )
  }
}
