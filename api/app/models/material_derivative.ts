import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { DateTime } from 'luxon'
import Material from '#models/material'

export const DERIVATIVE_KINDS = ['PDF_PAGE', 'IMAGE_PREVIEW'] as const
export type DerivativeKind = (typeof DERIVATIVE_KINDS)[number]

export default class MaterialDerivative extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare materialId: number

  @column()
  declare kind: DerivativeKind

  @column({ serializeAs: null })
  declare storageKey: string

  @column()
  declare mimeType: string

  @column()
  declare pageNumber: number | null

  @column()
  declare width: number

  @column()
  declare height: number

  @column()
  declare position: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null

  @belongsTo(() => Material)
  declare material: BelongsTo<typeof Material>
}
