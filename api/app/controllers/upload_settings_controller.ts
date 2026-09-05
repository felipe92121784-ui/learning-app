import UploadSetting from '#models/upload_setting'
import UploadSettingTransformer from '#transformers/upload_setting_transformer'
import {
  updateUploadSettingValidator,
  uploadSettingTypeValidator,
} from '#validators/upload_setting'
import type { HttpContext } from '@adonisjs/core/http'

const BY_DISPLAY_ORDER = ['PDF', 'IMAGE', 'ZIP'] as const
const BYTES_PER_MB = 1024 * 1024

export default class UploadSettingsController {
  async index({ serialize }: HttpContext) {
    const settings = await UploadSetting.query()
    const settingsByType = new Map(settings.map((setting) => [setting.type, setting]))
    const orderedSettings = BY_DISPLAY_ORDER.flatMap((type) => {
      const setting = settingsByType.get(type)
      return setting ? [setting] : []
    })

    return serialize(UploadSettingTransformer.transform(orderedSettings))
  }

  async update({ params, request, serialize }: HttpContext) {
    const { type } = await uploadSettingTypeValidator.validate({ type: params.type })
    const { maxSizeMb } = await request.validateUsing(updateUploadSettingValidator)
    const setting = await UploadSetting.findOrFail(type)

    setting.maxSizeBytes = maxSizeMb * BYTES_PER_MB
    await setting.save()

    return serialize(UploadSettingTransformer.transform(setting))
  }
}
