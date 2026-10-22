-- Close the same least-privilege gaps on views and materialized views.
-- The previous table-only pass left PostgreSQL's non-applicable table privileges
-- visible on views in information_schema.role_table_grants.
DO $migration$
DECLARE
  v_relation record;
  v_has_org_id boolean;
BEGIN
  FOR v_relation IN
    SELECT n.nspname AS schema_name, c.relname AS relation_name, c.relkind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p', 'v', 'm')
  LOOP
    EXECUTE format(
      'REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE %I.%I FROM anon, authenticated',
      v_relation.schema_name, v_relation.relation_name
    );

    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = v_relation.schema_name
        AND table_name = v_relation.relation_name
        AND column_name = 'organization_id'
    ) INTO v_has_org_id;

    IF v_has_org_id THEN
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM anon',
        v_relation.schema_name, v_relation.relation_name
      );
    END IF;
  END LOOP;
END
$migration$;
