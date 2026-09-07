import { BaseTransformer } from '@adonisjs/core/transformers'
import { MATERIAL_PROCESSING_ERROR_CODES, type MaterialProcessingErrorCode } from '#models/material'
import type Material from '#models/material'

function isSafeProcessingErrorCode(value: unknown): value is MaterialProcessingErrorCode {
  return (
    typeof value === 'string' &&
    MATERIAL_PROCESSING_ERROR_CODES.includes(value as MaterialProcessingErrorCode)
  )
}

export default class MaterialTransformer extends BaseTransformer<Material> {
  toObject() {
    const material = this.pick(this.resource, [
      'id',
      'moduleId',
      'title',
      'description',
      'type',
      'originalFilename',
      'mimeType',
      'size',
      'position',
      'processingStatus',
      'createdAt',
      'updatedAt',
    ])

    return isSafeProcessingErrorCode(this.resource.processingErrorCode)
      ? { ...material, processingErrorCode: this.resource.processingErrorCode }
      : material
  }
}
