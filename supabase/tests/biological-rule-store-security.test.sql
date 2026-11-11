-- Biological Rule Store tenant isolation and immutable-version contract.
\set ON_ERROR_STOP on

do $$
declare
  v_table regclass := to_regclass('public.biological_rules');
  v_trigger regclass;
  v_guard text;
begin
  if v_table is null then
    raise exception 'FAIL: public.biological_rules is missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='biological_rules'
      and column_name='revision_seq' and is_identity='YES'
  ) then
    raise exception 'FAIL: biological rule versions need a monotonic identity sequence';
  end if;
  if not (select relrowsecurity from pg_class where oid = v_table) then
    raise exception 'FAIL: biological_rules must have row-level security enabled';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='biological_rules'
      and policyname='biological_rules_select'
      and qual ilike '%is_org_member%'
  ) then
    raise exception 'FAIL: biological rule reads must be organization-member scoped';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='biological_rules'
      and policyname='biological_rules_update'
      and qual ilike '%is_org_admin%'
      and with_check ilike '%is_org_admin%'
  ) then
    raise exception 'FAIL: only organization administrators may update draft rules';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='biological_rules'
      and policyname='biological_rules_delete'
      and qual ilike '%is_org_admin%'
  ) then
    raise exception 'FAIL: only organization administrators may delete draft rules';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='biological_rules'
      and policyname='biological_rules_insert'
      and with_check ilike '%is_org_admin%'
  ) then
    raise exception 'FAIL: only organization administrators may insert biological rules';
  end if;
  if has_table_privilege('anon', v_table, 'SELECT') or
     has_table_privilege('anon', v_table, 'INSERT') then
    raise exception 'FAIL: anonymous role must not access biological rules';
  end if;
  if not has_table_privilege('authenticated', v_table, 'SELECT') then
    raise exception 'FAIL: authenticated users need table SELECT for RLS-scoped reads';
  end if;

  select pg_get_functiondef('private.guard_biological_rule_version()'::regprocedure)
    into v_guard;
  if v_guard not ilike '%biological_rule_version_immutable%' or
     v_guard not ilike '%biological_rule_reviewer_must_match_authenticated_user%' or
     v_guard not ilike '%biological_rule_variable_unit_dimension_mismatch%' or
     v_guard not ilike '%biological_rule_review_must_be_explicit_transition%' or
     v_guard not ilike '%biological_rule_retirement_requires_latest_reviewed_version%' or
     v_guard not ilike '%biological_rule_stale_draft_cannot_be_reviewed%' or
     v_guard not ilike '%biological_rule_retirement_requires_new_version%' or
     v_guard not ilike '%biological_rule_invalid_initial_status%' or
     v_guard not ilike '%biological_rule_review_must_be_explicit_transition%' or
     v_guard not ilike '%set search_path = pg_catalog, public, private, auth%' then
    raise exception 'FAIL: reviewed rule immutability or reviewer identity guard is missing';
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgrelid = v_table and tgname = 'biological_rules_version_guard'
      and not tgisinternal
  ) then
    raise exception 'FAIL: biological rule version guard trigger is missing';
  end if;
end
$$;

select 'Biological Rule Store tenant isolation and version immutability contract passed' as result;
