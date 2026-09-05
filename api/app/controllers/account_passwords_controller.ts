import { updateAccountPasswordValidator } from '#validators/account_password'
import type { HttpContext } from '@adonisjs/core/http'

export default class AccountPasswordsController {
  async update({ auth, request }: HttpContext) {
    const payload = await request.validateUsing(updateAccountPasswordValidator)
    const user = auth.getUserOrFail()

    await user.validatePassword(payload.currentPassword)

    user.password = payload.newPassword
    await user.save()

    return { message: 'Password updated successfully' }
  }
}
