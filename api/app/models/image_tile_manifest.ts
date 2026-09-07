import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { DateTime } from 'luxon'
import Material from '#models/material'

export default class ImageTileManifest extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare materialId: number

  @column({ serializeAs: null })
  declare storagePrefix: string

  @column()
  declare width: number

  @column()
  declare height: number

  @column()
  declare tileSize: number

  @column()
  declare minLevel: number

  @column()
  declare maxLevel: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null

  @belongsTo(() => Material)
  declare material: BelongsTo<typeof Material>
}
