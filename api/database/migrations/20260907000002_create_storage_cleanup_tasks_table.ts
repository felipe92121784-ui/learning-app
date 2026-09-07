import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'storage_cleanup_tasks'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table.jsonb('storage_prefixes').notNullable()
      table.jsonb('object_keys').notNullable()
      table.timestamp('locked_at').nullable()
      table.timestamp('lease_expires_at').nullable()
      table.string('claim_token', 64).nullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
