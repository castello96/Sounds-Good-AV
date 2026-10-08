-- Records every insert, update and delete on the business tables in audit_events.
--
-- The acting staff user is read from the transaction-local setting app.user_id,
-- which server/db/index.ts sets via withActor(). When it isn't set (public quote
-- form, scripts) user_id is null.
CREATE FUNCTION audit_row_change() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  actor integer := nullif(current_setting('app.user_id', true), '')::integer;
  -- Never copy password hashes into the audit log.
  old_row jsonb := to_jsonb(OLD) - 'password_hash';
  new_row jsonb := to_jsonb(NEW) - 'password_hash';
  diff jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    diff := new_row;
  ELSIF TG_OP = 'DELETE' THEN
    diff := old_row;
  ELSE
    -- Only the columns that changed, as {"column": [old, new]}.
    SELECT jsonb_object_agg(n.key, jsonb_build_array(o.value, n.value))
      INTO diff
      FROM jsonb_each(new_row) n
      JOIN jsonb_each(old_row) o USING (key)
     WHERE n.value IS DISTINCT FROM o.value
       AND n.key <> 'updated_at';

    IF diff IS NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  INSERT INTO audit_events (user_id, action, entity_type, entity_id, changes)
  VALUES (
    actor,
    lower(TG_OP)::audit_action,
    TG_TABLE_NAME,
    (coalesce(new_row, old_row)->>'id')::integer,
    diff
  );

  RETURN NULL;
END;
$$;
--> statement-breakpoint
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'departments', 'categories', 'equipment', 'inventory',
    'customers', 'addresses', 'bookings', 'booking_items',
    'booking_item_units', 'payments', 'users'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I
         FOR EACH ROW EXECUTE FUNCTION audit_row_change()',
      t || '_audit', t
    );
  END LOOP;
END;
$$;
