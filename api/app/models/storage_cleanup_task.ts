import { BaseModel, column } from '@adonisjs/lucid/orm'
import { DateTime } from 'luxon'

function jsonArrayColumn() {
  return {
    prepare: (value: string[]) => JSON.stringify(value),
    consume: (value: unknown) =>
      (typeof value === 'string' ? JSON.parse(value) : value) as string[],
    serializeAs: null,
  }
}

export default class StorageCleanupTask extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column(jsonArrayColumn())
  declare storagePrefixes: string[]

  @column(jsonArrayColumn())
  declare objectKeys: string[]

  @column.dateTime()
  declare lockedAt: DateTime | null

  @column.dateTime()
  declare leaseExpiresAt: DateTime | null

  @column({ serializeAs: null })
  declare claimToken: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null
}
