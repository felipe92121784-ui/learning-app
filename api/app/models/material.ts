import { BaseModel, belongsTo, column, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import { DateTime } from 'luxon'
import CourseModule from '#models/course_module'
import MaterialDerivative from '#models/material_derivative'
import ProcessingJob from '#models/processing_job'
import AccessRule from '#models/access_rule'
import AccessLog from '#models/access_log'

export const MATERIAL_TYPES = ['PDF', 'IMAGE', 'ZIP'] as const
export type MaterialType = (typeof MATERIAL_TYPES)[number]

export const MATERIAL_PROCESSING_STATUSES = ['UPLOADING', 'PROCESSING', 'READY', 'FAILED'] as const
export type MaterialProcessingStatus = (typeof MATERIAL_PROCESSING_STATUSES)[number]

export const MATERIAL_PROCESSING_ERROR_CODES = [
  'PDF_PAGE_LIMIT_EXCEEDED',
  'ORIGINAL_NOT_FOUND',
  'INVALID_INPUT',
  'STORAGE_ERROR',
  'PROCESSING_ERROR',
] as const
export type MaterialProcessingErrorCode = (typeof MATERIAL_PROCESSING_ERROR_CODES)[number]

export default class Material extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare moduleId: number

  @column()
  declare title: string

  @column()
  declare description: string | null

  @column()
  declare type: MaterialType

  @column({ serializeAs: null })
  declare storageKey: string

  @column()
  declare originalFilename: string

  @column()
  declare mimeType: string

  @column({ consume: (value) => Number(value) })
  declare size: number

  @column()
  declare position: number

  @column()
  declare processingStatus: MaterialProcessingStatus

  @column()
  declare processingErrorCode: MaterialProcessingErrorCode | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null

  @belongsTo(() => CourseModule)
  declare module: BelongsTo<typeof CourseModule>

  @hasMany(() => ProcessingJob)
  declare jobs: HasMany<typeof ProcessingJob>

  @hasMany(() => MaterialDerivative, {
    onQuery: (query) => query.orderBy('position', 'asc'),
  })
  declare derivatives: HasMany<typeof MaterialDerivative>

  @hasMany(() => AccessRule, {
    foreignKey: 'resourceId',
    onQuery: (query) => query.where('resource_type', 'MATERIAL'),
  })
  declare accessRules: HasMany<typeof AccessRule>

  @hasMany(() => AccessLog)
  declare accessLogs: HasMany<typeof AccessLog>
}
