-- Apply least-privilege table grants to the multi-tenant biological data model.
-- RLS remains the row-level boundary; SQL grants should independently prevent anon
-- from invoking CRUD on organization-scoped tables and prevent client-side DDL-like
-- table privileges such as TRUNCATE, REFERENCES, and TRIGGER.
DO $migration$
DECLARE
  v_table record;
  v_has_org_id boolean;
BEGIN
  FOR v_table IN
    SELECT n.nspname AS schema_name, c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
  LOOP
    EXECUTE format(
      'REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE %I.%I FROM anon, authenticated',
      v_table.schema_name, v_table.table_name
    );

    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = v_table.schema_name
        AND table_name = v_table.table_name
        AND column_name = 'organization_id'
    ) INTO v_has_org_id;

    IF v_has_org_id THEN
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM anon',
        v_table.schema_name, v_table.table_name
      );
    END IF;
  END LOOP;
END
$migration$;
