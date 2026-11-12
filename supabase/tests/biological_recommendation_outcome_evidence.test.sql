-- Structural and privilege contract for recommendation outcome evidence links.
\set ON_ERROR_STOP on

do $$
declare
  v_links oid := to_regclass('public.biological_recommendation_outcome_measurements');
  v_rpc oid := to_regprocedure(
    'public.link_biological_recommendation_outcome_measurement(uuid,uuid,uuid)'
  );
  v_definition text;
begin
  if v_links is null or v_rpc is null then
    raise exception 'FAIL: recommendation outcome evidence objects are missing';
  end if;

  if not (select relrowsecurity from pg_class where oid = v_links) then
    raise exception 'FAIL: outcome evidence links must have RLS enabled';
  end if;

  if not has_table_privilege('authenticated', v_links, 'SELECT')
     or has_table_privilege('authenticated', v_links, 'INSERT')
     or has_table_privilege('authenticated', v_links, 'UPDATE')
     or has_table_privilege('authenticated', v_links, 'DELETE')
     or has_table_privilege('anon', v_links, 'SELECT') then
    raise exception 'FAIL: outcome evidence links must be read-only for authenticated members';
  end if;

  if not has_function_privilege('authenticated', v_rpc, 'EXECUTE')
     or has_function_privilege('anon', v_rpc, 'EXECUTE')
     or not (select prosecdef from pg_proc where oid = v_rpc) then
    raise exception 'FAIL: evidence-link RPC must be authenticated SECURITY DEFINER only';
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = v_links
       and conname = 'biological_recommendation_outcome_measurements_event_fk'
  ) or not exists (
    select 1 from pg_constraint
     where conrelid = v_links
       and conname = 'biological_recommendation_outcome_measurements_measurement_fk'
  ) then
    raise exception 'FAIL: outcome evidence links need tenant-scoped event and measurement FKs';
  end if;

  if not exists (
    select 1 from pg_trigger
     where tgrelid = v_links
       and tgname = 'biological_recommendation_outcome_measurements_append_only'
       and not tgisinternal
  ) then
    raise exception 'FAIL: outcome evidence links must be append-only';
  end if;

  if not exists (
    select 1 from pg_attribute
     where attrelid = v_links
       and attname = 'variable_code'
       and atttypid = 'text'::regtype
       and attnotnull
       and not attisdropped
  ) or not exists (
    select 1 from pg_attribute
     where attrelid = v_links
       and attname = 'normalized_value'
       and atttypid = 'numeric'::regtype
       and not attisdropped
  ) or not exists (
    select 1 from pg_attribute
     where attrelid = v_links
       and attname = 'method'
       and atttypid = 'text'::regtype
       and not attisdropped
  ) or not exists (
    select 1 from pg_attribute
     where attrelid = v_links
       and attname = 'instrument'
       and atttypid = 'text'::regtype
       and not attisdropped
  ) then
    raise exception 'FAIL: measurement snapshot must preserve variable, value, method and instrument';
  end if;

  if not exists (
    select 1 from pg_attribute
     where attrelid = v_links
       and attname = 'measurement_quality_state'
       and atttypid = 'text'::regtype
       and not attisdropped
  ) then
    raise exception 'FAIL: immutable evidence must preserve measurement quality state';
  end if;

  if not exists (
    select 1 from pg_attribute
     where attrelid = v_links
       and attname = 'measurement_observed_at'
       and atttypid = 'timestamp with time zone'::regtype
       and attnotnull
       and not attisdropped
  ) or not exists (
    select 1 from pg_attribute
     where attrelid = v_links
       and attname = 'source_metadata'
       and atttypid = 'jsonb'::regtype
       and attnotnull
       and not attisdropped
  ) then
    raise exception 'FAIL: linked measurements must preserve immutable typed snapshots';
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'biological_recommendation_outcome_measurements'
       and policyname = 'biological_recommendation_outcome_measurements_select'
       and roles @> array['authenticated']::name[]
  ) then
    raise exception 'FAIL: outcome evidence links need authenticated tenant-scoped read policy';
  end if;

  select pg_get_functiondef(v_rpc) into v_definition;
  if position('auth.uid()' in v_definition) = 0
     or position('private.is_org_writer' in v_definition) = 0
     or position('outcome_recorded' in v_definition) = 0
     or position('record_execution' in v_definition) = 0
     or position('record_outcome' in v_definition) = 0
     or position('measured_at < v_execution_at' in v_definition) = 0
     or position('measured_at > v_outcome_event.outcome_observed_at' in v_definition) = 0
     or position('biological_subject_id' in v_definition) = 0
     or position('environment_id' in v_definition) = 0
     or position('v_measurement.measured_at is null' in v_definition) = 0
     or position('source_metadata' in v_definition) = 0
     or position('measurement_quality_state' in v_definition) = 0
     or position('v_measurement.quality_state' in v_definition) = 0 then
    raise exception 'FAIL: RPC must validate actor, lifecycle, temporal and biological/environmental scope';
  end if;

  if position('on conflict' in lower(v_definition)) = 0
     or position('idempotent_replay' in v_definition) = 0 then
    raise exception 'FAIL: evidence linking must be safely idempotent';
  end if;
end
$$;

select 'PASS: biological recommendation outcome evidence link contract' as result;
