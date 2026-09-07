import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'storage_cleanup_tasks'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('attempts').unsigned().notNullable().defaultTo(0)
      table.timestamp('next_attempt_at').notNullable().defaultTo(this.now())
      table.index(['next_attempt_at', 'id'])
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropIndex(['next_attempt_at', 'id'])
      table.dropColumn('next_attempt_at')
      table.dropColumn('attempts')
    })
  }
}
