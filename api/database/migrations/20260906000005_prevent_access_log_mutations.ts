import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.raw(`
      CREATE FUNCTION prevent_access_log_mutation()
      RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'access_logs is append-only' USING ERRCODE = '55000';
      END;
      $$ LANGUAGE plpgsql;

      CREATE TRIGGER access_logs_prevent_mutation
      BEFORE UPDATE OR DELETE ON access_logs
      FOR EACH ROW EXECUTE FUNCTION prevent_access_log_mutation();
    `)
  }

  async down() {
    this.schema.raw(`
      DROP TRIGGER IF EXISTS access_logs_prevent_mutation ON access_logs;
      DROP FUNCTION IF EXISTS prevent_access_log_mutation();
    `)
  }
}
