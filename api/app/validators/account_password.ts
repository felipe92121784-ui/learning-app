import vine from '@vinejs/vine'

const newPassword = () => vine.string().minLength(8).maxLength(32)

export const updateAccountPasswordValidator = vine.create({
  currentPassword: vine.string(),
  newPassword: newPassword(),
  newPasswordConfirmation: newPassword().sameAs('newPassword'),
})
