import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

export default class AdminMiddleware {
  async handle({ auth, response }: HttpContext, next: NextFn) {
    const user = auth.use('web').getUserOrFail()

    if (user.role !== 'ADMIN') {
      return response.forbidden({ message: 'Administrator access required' })
    }

    return next()
  }
}
