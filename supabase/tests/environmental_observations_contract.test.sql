-- Post-migration contract checks are run after all migrations in CI.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='locations' AND column_name='latitude'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='locations' AND column_name='longitude'
  ) THEN
    RAISE EXCEPTION 'Environmental foundation must store coordinates on locations';
  END IF;
  IF to_regclass('public.environmental_observations') IS NULL THEN
    RAISE EXCEPTION 'Environmental observations table is missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='environmental_observations'
      AND policyname='environmental_observations_select'
  ) THEN
    RAISE EXCEPTION 'Organization-scoped read policy is missing';
  END IF;
  IF has_table_privilege('authenticated', 'public.environmental_observations', 'INSERT') THEN
    RAISE EXCEPTION 'Authenticated users must not directly insert provider-sourced observations';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='environmental_observations'
      AND column_name='source_record_id'
  ) THEN
    RAISE EXCEPTION 'Stable environmental source identity column is missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class idx
    JOIN pg_index i ON i.indexrelid = idx.oid
    WHERE idx.relname='environmental_observations_weather_dedup_key'
      AND i.indpred IS NOT NULL
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_class idx
    JOIN pg_index i ON i.indexrelid = idx.oid
    WHERE idx.relname='environmental_observations_satellite_dedup_key'
      AND i.indpred IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Weather and satellite partial idempotency indexes are required';
  END IF;

END
$$;
