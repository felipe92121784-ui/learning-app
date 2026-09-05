import User from '#models/user'
import { loginValidator } from '#validators/user'
import { errors } from '@adonisjs/auth'
import type { HttpContext } from '@adonisjs/core/http'
import UserTransformer from '#transformers/user_transformer'

export default class AccessTokensController {
  async store({ auth, request, serialize }: HttpContext) {
    const { email, password } = await request.validateUsing(loginValidator)

    let user: User
    try {
      user = await User.verifyCredentials(email, password)
    } catch (error) {
      if (!errors.E_INVALID_CREDENTIALS.isError(error)) {
        throw error
      }

      throw new errors.E_INVALID_CREDENTIALS('Invalid user credentials', { status: 401 })
    }

    if (user.status !== 'ACTIVE') {
      throw new errors.E_INVALID_CREDENTIALS('Invalid user credentials', { status: 401 })
    }

    await auth.use('web').login(user)

    return serialize({
      user: UserTransformer.transform(user),
    })
  }

  async destroy({ auth }: HttpContext) {
    await auth.use('web').logout()

    return {
      message: 'Logged out successfully',
    }
  }
}
