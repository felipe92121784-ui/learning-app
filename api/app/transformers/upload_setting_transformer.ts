import { BaseTransformer } from '@adonisjs/core/transformers'
import type UploadSetting from '#models/upload_setting'

export default class UploadSettingTransformer extends BaseTransformer<UploadSetting> {
  toObject() {
    return this.pick(this.resource, ['type', 'maxSizeBytes'])
  }
}
