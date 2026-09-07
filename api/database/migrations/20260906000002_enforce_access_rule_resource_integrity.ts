import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.raw(`
      CREATE FUNCTION validate_access_rule_resource_target()
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

      CREATE TRIGGER access_rules_validate_resource_target
      BEFORE INSERT OR UPDATE OF resource_type, resource_id ON access_rules
      FOR EACH ROW EXECUTE FUNCTION validate_access_rule_resource_target();
    `)
    this.schema.raw(`
      CREATE FUNCTION cleanup_access_rules_for_deleted_target()
      RETURNS trigger AS $$
      DECLARE
        target_type text;
      BEGIN
        target_type := CASE TG_TABLE_NAME
          WHEN 'courses' THEN 'COURSE'
          WHEN 'modules' THEN 'MODULE'
          WHEN 'materials' THEN 'MATERIAL'
        END;

        DELETE FROM access_rules
        WHERE resource_type = target_type AND resource_id = OLD.id;

        RETURN OLD;
      END;
      $$ LANGUAGE plpgsql;

      CREATE TRIGGER courses_cleanup_access_rules
      AFTER DELETE ON courses
      FOR EACH ROW EXECUTE FUNCTION cleanup_access_rules_for_deleted_target();

      CREATE TRIGGER modules_cleanup_access_rules
      AFTER DELETE ON modules
      FOR EACH ROW EXECUTE FUNCTION cleanup_access_rules_for_deleted_target();

      CREATE TRIGGER materials_cleanup_access_rules
      AFTER DELETE ON materials
      FOR EACH ROW EXECUTE FUNCTION cleanup_access_rules_for_deleted_target();
    `)
  }

  async down() {
    this.schema.raw(`
      DROP TRIGGER materials_cleanup_access_rules ON materials;
      DROP TRIGGER modules_cleanup_access_rules ON modules;
      DROP TRIGGER courses_cleanup_access_rules ON courses;
      DROP FUNCTION cleanup_access_rules_for_deleted_target();
      DROP TRIGGER access_rules_validate_resource_target ON access_rules;
      DROP FUNCTION validate_access_rule_resource_target();
    `)
  }
}
