import { BaseTransformer } from '@adonisjs/core/transformers'
import type Material from '#models/material'

export default class MaterialTransformer extends BaseTransformer<Material> {
  toObject() {
    return this.pick(this.resource, [
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
  }
}
