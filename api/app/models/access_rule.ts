import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { DateTime } from 'luxon'
import User from '#models/user'

export const ACCESS_RESOURCE_TYPES = ['COURSE', 'MODULE', 'MATERIAL'] as const
export type AccessResourceType = (typeof ACCESS_RESOURCE_TYPES)[number]

export const ACCESS_CAPABILITIES = ['VIEW', 'DOWNLOAD'] as const
export type AccessCapability = (typeof ACCESS_CAPABILITIES)[number]

export const ACCESS_EFFECTS = ['ALLOW', 'DENY', 'INHERIT'] as const
export type AccessEffect = (typeof ACCESS_EFFECTS)[number]

export default class AccessRule extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number

  @column()
  declare resourceType: AccessResourceType

  @column()
  declare resourceId: number

  @column()
  declare capability: AccessCapability

  @column()
  declare effect: AccessEffect

  @column.dateTime()
  declare startsAt: DateTime | null

  @column.dateTime()
  declare expiresAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>
}
