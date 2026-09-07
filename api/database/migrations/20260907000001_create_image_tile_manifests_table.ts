import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'image_tile_manifests'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table
        .integer('material_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('materials')
        .onDelete('CASCADE')
        .unique()
      table.string('storage_prefix', 1024).notNullable()
      table.integer('width').unsigned().notNullable()
      table.integer('height').unsigned().notNullable()
      table.integer('tile_size').unsigned().notNullable()
      table.integer('min_level').unsigned().notNullable()
      table.integer('max_level').unsigned().notNullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
      table.check('width >= 1')
      table.check('height >= 1')
      table.check('tile_size >= 1')
      table.check('min_level >= 0')
      table.check('max_level >= min_level')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
