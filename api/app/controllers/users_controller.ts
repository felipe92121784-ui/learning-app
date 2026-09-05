import User from '#models/user'
import UserTransformer from '#transformers/user_transformer'
import {
  createAdminUserValidator,
  updateAdminUserStatusValidator,
  updateAdminUserValidator,
} from '#validators/admin_user'
import type { HttpContext } from '@adonisjs/core/http'

export default class UsersController {
  async index({ serialize }: HttpContext) {
    const users = await User.query().orderBy('id', 'asc')

    return serialize(UserTransformer.transform(users))
  }

  async store({ request, response, serialize }: HttpContext) {
    const payload = await request.validateUsing(createAdminUserValidator)
    const user = await User.create({
      ...payload,
      role: 'STUDENT',
      status: 'ACTIVE',
    })

    return response.created(await serialize(UserTransformer.transform(user)))
  }

  async show({ params, serialize }: HttpContext) {
    const user = await User.findOrFail(params.id)

    return serialize(UserTransformer.transform(user))
  }

  async update({ params, request, serialize }: HttpContext) {
    const user = await User.findOrFail(params.id)
    const payload = await request.validateUsing(updateAdminUserValidator, {
      meta: { userId: user.id },
    })

    user.merge(payload)
    await user.save()

    return serialize(UserTransformer.transform(user))
  }

  async updateStatus({ params, request, serialize }: HttpContext) {
    const user = await User.findOrFail(params.id)
    const { status } = await request.validateUsing(updateAdminUserStatusValidator)

    user.status = status
    await user.save()

    return serialize(UserTransformer.transform(user))
  }
}
