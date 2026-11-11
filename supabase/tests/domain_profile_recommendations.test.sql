-- Structural contract for persisted, versioned recommendation definitions.
\set ON_ERROR_STOP on

do $$
declare
  v_profiles oid := to_regclass('public.domain_interpretation_profiles');
  v_trigger oid;
  v_definition text;
begin
  if v_profiles is null then
    raise exception 'FAIL: domain interpretation profile registry is missing';
  end if;

  if not exists (
    select 1
      from pg_attribute
     where attrelid = v_profiles
       and attname = 'recommendations'
       and atttypid = 'jsonb'::regtype
       and not attisdropped
  ) then
    raise exception 'FAIL: domain profiles do not persist recommendation definitions as JSONB';
  end if;

  select oid into v_trigger
    from pg_trigger
   where tgrelid = v_profiles
     and tgname = 'domain_interpretation_profiles_recommendations_validate'
     and not tgisinternal;

  if v_trigger is null then
    raise exception 'FAIL: recommendation definition validation trigger is missing';
  end if;

  select pg_get_functiondef(tgfoid) into v_definition
    from pg_trigger
   where oid = v_trigger;

  if position('domain_profile_recommendation_does_not_match_engine_contract' in v_definition) = 0
     or position('domain_profile_recommendation_codes_must_be_unique' in v_definition) = 0 then
    raise exception 'FAIL: recommendation definition validation contract is incomplete';
  end if;
end
$$;

select 'PASS: persisted domain recommendation definition contract' as result;
