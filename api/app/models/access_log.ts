import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { DateTime } from 'luxon'
import Material from '#models/material'
import User from '#models/user'

export const ACCESS_LOG_ACTIONS = ['VIEW_MATERIAL', 'DOWNLOAD_MATERIAL', 'FAILED_ACCESS'] as const
export type AccessLogAction = (typeof ACCESS_LOG_ACTIONS)[number]

export default class AccessLog extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number

  @column()
  declare materialId: number

  @column()
  declare action: AccessLogAction

  @column()
  declare ipAddress: string | null

  @column()
  declare userAgent: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  @belongsTo(() => Material)
  declare material: BelongsTo<typeof Material>
}
