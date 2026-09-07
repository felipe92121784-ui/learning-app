import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.raw(`
      CREATE OR REPLACE FUNCTION validate_access_rule_resource_target()
      RETURNS trigger AS $$
      BEGIN
        CASE NEW.resource_type
          WHEN 'COURSE' THEN
            PERFORM 1 FROM courses WHERE id = NEW.resource_id FOR KEY SHARE;
            IF NOT FOUND THEN
              RAISE EXCEPTION 'Course % does not exist', NEW.resource_id USING ERRCODE = '23503';
            END IF;
          WHEN 'MODULE' THEN
            PERFORM 1 FROM modules WHERE id = NEW.resource_id FOR KEY SHARE;
            IF NOT FOUND THEN
              RAISE EXCEPTION 'Module % does not exist', NEW.resource_id USING ERRCODE = '23503';
            END IF;
          WHEN 'MATERIAL' THEN
            PERFORM 1 FROM materials WHERE id = NEW.resource_id FOR KEY SHARE;
            IF NOT FOUND THEN
              RAISE EXCEPTION 'Material % does not exist', NEW.resource_id USING ERRCODE = '23503';
            END IF;
          ELSE
            RAISE EXCEPTION 'Unknown access rule resource type: %', NEW.resource_type USING ERRCODE = '23514';
        END CASE;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `)
  }

  async down() {
    this.schema.raw(`
      CREATE OR REPLACE FUNCTION validate_access_rule_resource_target()
      RETURNS trigger AS $$
      BEGIN
        CASE NEW.resource_type
          WHEN 'COURSE' THEN
            IF NOT EXISTS (SELECT 1 FROM courses WHERE id = NEW.resource_id) THEN
              RAISE EXCEPTION 'Course % does not exist', NEW.resource_id USING ERRCODE = '23503';
            END IF;
          WHEN 'MODULE' THEN
            IF NOT EXISTS (SELECT 1 FROM modules WHERE id = NEW.resource_id) THEN
              RAISE EXCEPTION 'Module % does not exist', NEW.resource_id USING ERRCODE = '23503';
            END IF;
          WHEN 'MATERIAL' THEN
            IF NOT EXISTS (SELECT 1 FROM materials WHERE id = NEW.resource_id) THEN
              RAISE EXCEPTION 'Material % does not exist', NEW.resource_id USING ERRCODE = '23503';
            END IF;
          ELSE
            RAISE EXCEPTION 'Unknown access rule resource type: %', NEW.resource_type USING ERRCODE = '23514';
        END CASE;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `)
  }
}
