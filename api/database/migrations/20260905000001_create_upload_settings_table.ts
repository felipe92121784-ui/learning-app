import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'upload_settings'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.enum('type', ['PDF', 'IMAGE', 'ZIP']).primary()
      table.integer('max_size_bytes').notNullable()
      table.check('max_size_bytes > 0')
    })

    this.defer(async (db) => {
      await db.table(this.tableName).insert([
        { type: 'PDF', max_size_bytes: 104857600 },
        { type: 'IMAGE', max_size_bytes: 104857600 },
        { type: 'ZIP', max_size_bytes: 104857600 },
      ])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
