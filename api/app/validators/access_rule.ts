import { ACCESS_CAPABILITIES, ACCESS_EFFECTS, ACCESS_RESOURCE_TYPES } from '#models/access_rule'
import { ValidationError } from '@vinejs/vine'
import vine from '@vinejs/vine'
import { DateTime } from 'luxon'

const maximumDatabaseId = 2_147_483_647
const id = () => vine.number({ strict: true }).positive().max(maximumDatabaseId).withoutDecimals()
const queryId = () => vine.number().positive().max(maximumDatabaseId).withoutDecimals()
const utcIsoDateTime = () =>
  vine
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/)
    .nullable()

export const upsertAccessRuleValidator = vine.create({
  userId: id(),
  resourceType: vine.enum(ACCESS_RESOURCE_TYPES),
  resourceId: id(),
  capability: vine.enum(ACCESS_CAPABILITIES),
  effect: vine.enum(ACCESS_EFFECTS),
  startsAt: utcIsoDateTime(),
  expiresAt: utcIsoDateTime(),
})

export const accessRuleTargetValidator = vine.create({
  userId: queryId(),
  resourceType: vine.enum(ACCESS_RESOURCE_TYPES),
  resourceId: queryId(),
})

export const accessRuleIdValidator = vine.create({
  id: queryId(),
})

export function parseAccessRuleWindow(startsAt: string | null, expiresAt: string | null) {
  const parsedStartsAt = parseUtcDateTime(startsAt, 'startsAt')
  const parsedExpiresAt = parseUtcDateTime(expiresAt, 'expiresAt')

  if (
    parsedStartsAt &&
    parsedExpiresAt &&
    parsedExpiresAt.toMillis() <= parsedStartsAt.toMillis()
  ) {
    throw fieldError('expiresAt', 'The expiresAt field must be after startsAt')
  }

  return { startsAt: parsedStartsAt, expiresAt: parsedExpiresAt }
}

function parseUtcDateTime(value: string | null, field: 'startsAt' | 'expiresAt') {
  if (!value) {
    return null
  }

  const dateTime = DateTime.fromISO(value, { zone: 'utc' })
  if (!dateTime.isValid) {
    throw fieldError(field, `The ${field} field must be a valid UTC ISO datetime`)
  }

  return dateTime
}

export function fieldError(field: string, message: string) {
  return new ValidationError([{ message, rule: 'validation', field }])
}
