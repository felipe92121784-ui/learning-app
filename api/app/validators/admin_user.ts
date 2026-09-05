import vine from '@vinejs/vine'
import { USER_STATUSES } from '#models/user'

const fullName = () => vine.string().trim().minLength(2).maxLength(120)
const email = () => vine.string().trim().email().maxLength(254)
const password = () => vine.string().minLength(8).maxLength(32)

export const createAdminUserValidator = vine.create({
  fullName: fullName(),
  email: email().unique({ table: 'users', column: 'email' }),
  password: password(),
})

export const updateAdminUserValidator = vine.withMetaData<{ userId: number }>().create({
  fullName: fullName().optional(),
  email: email()
    .unique(async (db, value, field) => {
      const duplicate = await db
        .from('users')
        .where('email', value)
        .whereNot('id', field.meta.userId)
        .first()

      return !duplicate
    })
    .optional(),
})

export const updateAdminUserStatusValidator = vine.create({
  status: vine.enum(USER_STATUSES),
})
