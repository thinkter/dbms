BEGIN;

CREATE OR REPLACE FUNCTION write_case_audit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  row_payload jsonb;
  row_id bigint;
BEGIN
  row_payload := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  row_id := COALESCE((row_payload ->> 'alert_id')::bigint,
                     (row_payload ->> 'action_id')::bigint);
  INSERT INTO audit_log(entity_type, entity_id, operation, payload)
  VALUES (TG_TABLE_NAME, row_id, TG_OP, row_payload);
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS alerts_audit ON alerts;
CREATE TRIGGER alerts_audit
AFTER INSERT OR UPDATE OR DELETE ON alerts
FOR EACH ROW EXECUTE FUNCTION write_case_audit();

DROP TRIGGER IF EXISTS actions_audit ON actions;
CREATE TRIGGER actions_audit
AFTER INSERT OR UPDATE OR DELETE ON actions
FOR EACH ROW EXECUTE FUNCTION write_case_audit();

COMMIT;
