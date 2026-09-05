import { MATERIAL_TYPES } from '#models/material'
import vine from '@vinejs/vine'

export const uploadSettingTypeValidator = vine.create({
  type: vine.enum(MATERIAL_TYPES),
})

export const updateUploadSettingValidator = vine.create({
  maxSizeMb: vine.number({ strict: true }).min(1).max(1024).withoutDecimals(),
})
