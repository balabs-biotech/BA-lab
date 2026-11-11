-- Structural and privilege contract for recommendation persistence.
\set ON_ERROR_STOP on

do $$
declare
  v_recommendations oid := to_regclass('public.biological_recommendations');
  v_events oid := to_regclass('public.biological_recommendation_events');
  v_create oid := to_regprocedure(
    'public.create_biological_recommendation(uuid,uuid,text,text,text,text,uuid,uuid,uuid,text,text,text,jsonb)'
  );
  v_transition oid := to_regprocedure(
    'public.transition_biological_recommendation(uuid,uuid,integer,uuid,text,timestamp with time zone,text,text,text,timestamp with time zone)'
  );
  v_create_definition text;
  v_transition_definition text;
begin
  if v_recommendations is null or v_events is null then
    raise exception 'FAIL: recommendation persistence tables are missing';
  end if;

  if v_create is null or v_transition is null then
    raise exception 'FAIL: recommendation persistence RPCs are missing';
  end if;

  if not (select relrowsecurity from pg_class where oid = v_recommendations)
     or not (select relrowsecurity from pg_class where oid = v_events) then
    raise exception 'FAIL: recommendation tables must have RLS enabled';
  end if;

  if not has_table_privilege('authenticated', v_recommendations, 'SELECT')
     or has_table_privilege('authenticated', v_recommendations, 'INSERT')
     or has_table_privilege('authenticated', v_recommendations, 'UPDATE')
     or has_table_privilege('authenticated', v_recommendations, 'DELETE')
     or not has_table_privilege('authenticated', v_events, 'SELECT')
     or has_table_privilege('authenticated', v_events, 'INSERT')
     or has_table_privilege('authenticated', v_events, 'UPDATE')
     or has_table_privilege('authenticated', v_events, 'DELETE') then
    raise exception 'FAIL: authenticated recommendation table grants must be read-only';
  end if;

  if has_table_privilege('anon', v_recommendations, 'SELECT')
     or has_table_privilege('anon', v_events, 'SELECT') then
    raise exception 'FAIL: anonymous recommendation access must be denied';
  end if;

  if not has_function_privilege('service_role', v_create, 'EXECUTE')
     or has_function_privilege('authenticated', v_create, 'EXECUTE')
     or has_function_privilege('anon', v_create, 'EXECUTE') then
    raise exception 'FAIL: recommendation creation must be service-role only';
  end if;

  if not has_function_privilege('authenticated', v_transition, 'EXECUTE')
     or has_function_privilege('anon', v_transition, 'EXECUTE') then
    raise exception 'FAIL: recommendation transition must be authenticated-only';
  end if;

  if not (select prosecdef from pg_proc where oid = v_create)
     or not (select prosecdef from pg_proc where oid = v_transition) then
    raise exception 'FAIL: recommendation RPCs must use controlled SECURITY DEFINER execution';
  end if;

  select pg_get_functiondef(v_create) into v_create_definition;
  if position('biological_recommendation_proposal_idempotency_conflict' in v_create_definition) = 0
     or position('idempotent_replay' in v_create_definition) = 0 then
    raise exception 'FAIL: deterministic proposal creation must be idempotent and reject conflicting reuse';
  end if;

  select pg_get_functiondef(v_transition) into v_transition_definition;
  if position('auth.uid()' in v_transition_definition) = 0
     or position('p_actor_id' in v_transition_definition) > 0 then
    raise exception 'FAIL: recommendation event actor must come from auth.uid(), never a client parameter';
  end if;

  if not exists (
    select 1 from pg_trigger
     where tgrelid = v_recommendations
       and tgname = 'biological_recommendations_snapshot_immutable'
       and not tgisinternal
  ) then
    raise exception 'FAIL: immutable proposal snapshot trigger is missing';
  end if;

  if not exists (
    select 1 from pg_trigger
     where tgrelid = v_events
       and tgname = 'biological_recommendation_events_append_only'
       and not tgisinternal
  ) then
    raise exception 'FAIL: append-only event trigger is missing';
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = v_recommendations
       and conname = 'biological_recommendations_source_signal_fk'
  ) or not exists (
    select 1 from pg_constraint
     where conrelid = v_recommendations
       and conname = 'biological_recommendations_source_analysis_fk'
  ) or not exists (
    select 1 from pg_constraint
     where conrelid = v_recommendations
       and conname = 'biological_recommendations_profile_fk'
  ) then
    raise exception 'FAIL: tenant-scoped recommendation provenance FKs are incomplete';
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = v_events
       and conname = 'biological_recommendation_events_idempotency_key'
  ) then
    raise exception 'FAIL: recommendation event idempotency constraint is missing';
  end if;

  if not exists (
    select 1 from pg_attribute
     where attrelid = v_events
       and attname = 'revision'
       and atttypid = 'integer'::regtype
       and attnotnull
       and not attisdropped
  ) or not exists (
    select 1 from pg_constraint
     where conrelid = v_events
       and conname = 'biological_recommendation_events_revision_key'
  ) then
    raise exception 'FAIL: recommendation event revisions must be persisted and unique per aggregate';
  end if;

  select pg_get_functiondef(v_create) into v_create_definition;
  if position('pg_advisory_xact_lock' in v_create_definition) = 0
     or position('auth.role()' in v_create_definition) > 0
     or position('auth.jwt()' in v_create_definition) = 0
     or position('service_role' in v_create_definition) = 0 then
    raise exception 'FAIL: proposal creation must serialize retries and verify the signed service-role JWT';
  end if;

  select pg_get_functiondef(v_transition) into v_transition_definition;
  if position('''events''' in v_transition_definition) = 0
     or position('jsonb_agg' in v_transition_definition) = 0 then
    raise exception 'FAIL: transition RPC must return the committed aggregate event history atomically';
  end if;

end
$$;

select 'PASS: biological recommendation persistence structure and grants' as result;
