import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { DateTime } from 'luxon'
import Material, { type MaterialProcessingErrorCode } from '#models/material'

export const PROCESSING_JOB_KINDS = ['PDF_RENDER', 'IMAGE_DERIVATIVE'] as const
export type ProcessingJobKind = (typeof PROCESSING_JOB_KINDS)[number]

export const PROCESSING_JOB_STATUSES = ['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED'] as const
export type ProcessingJobStatus = (typeof PROCESSING_JOB_STATUSES)[number]

export default class ProcessingJob extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare materialId: number

  @column()
  declare kind: ProcessingJobKind

  @column()
  declare status: ProcessingJobStatus

  @column()
  declare attempts: number

  @column()
  declare maxAttempts: 3

  @column.dateTime()
  declare lockedAt: DateTime | null

  @column.dateTime()
  declare leaseExpiresAt: DateTime | null

  @column()
  declare lastErrorCode: MaterialProcessingErrorCode | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null

  @belongsTo(() => Material)
  declare material: BelongsTo<typeof Material>
}
