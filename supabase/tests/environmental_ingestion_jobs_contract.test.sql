DO $$
DECLARE
  v_rls_enabled boolean;
BEGIN
  SELECT c.relrowsecurity
  INTO v_rls_enabled
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'environmental_ingestion_jobs';

  IF v_rls_enabled IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Environmental ingestion jobs must have RLS enabled';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.environmental_ingestion_jobs', 'SELECT')
     OR has_table_privilege('authenticated', 'public.environmental_ingestion_jobs', 'INSERT')
     OR has_table_privilege('authenticated', 'public.environmental_ingestion_jobs', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.environmental_ingestion_jobs', 'DELETE') THEN
    RAISE EXCEPTION 'Authenticated role must have read-only access to ingestion jobs';
  END IF;

  IF has_table_privilege('anon', 'public.environmental_ingestion_jobs', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.environmental_ingestion_jobs', 'INSERT')
     OR NOT has_table_privilege('service_role', 'public.environmental_ingestion_jobs', 'UPDATE') THEN
    RAISE EXCEPTION 'Ingestion job table grants are not restricted to authenticated reads and service-role writes';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'environmental_ingestion_jobs'
      AND policyname = 'environmental_ingestion_jobs_org_member_read'
      AND cmd = 'SELECT'
      AND 'authenticated' = ANY(roles::text[])
  ) THEN
    RAISE EXCEPTION 'Organization-scoped authenticated read policy is missing';
  END IF;
END
$$;
