import { BaseTransformer } from '@adonisjs/core/transformers'
import type AccessRule from '#models/access_rule'

export default class AccessRuleTransformer extends BaseTransformer<AccessRule> {
  toObject() {
    return this.pick(this.resource, [
      'id',
      'userId',
      'resourceType',
      'resourceId',
      'capability',
      'effect',
      'startsAt',
      'expiresAt',
      'createdAt',
      'updatedAt',
    ])
  }
}
