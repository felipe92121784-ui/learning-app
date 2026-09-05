import { BaseModel, column } from '@adonisjs/lucid/orm'
import type { MaterialType } from '#models/material'

export default class UploadSetting extends BaseModel {
  static table = 'upload_settings'

  @column({ isPrimary: true })
  declare type: MaterialType

  @column({ consume: (value) => Number(value) })
  declare maxSizeBytes: number
}
