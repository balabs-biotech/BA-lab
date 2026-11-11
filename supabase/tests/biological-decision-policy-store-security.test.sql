-- Biological decision policy store: tenant isolation, version lifecycle and rule binding.
\set ON_ERROR_STOP on

do $$
declare
  v_table regclass := to_regclass('public.biological_decision_policies');
  v_guard text;
begin
  if v_table is null then raise exception 'FAIL: biological_decision_policies is missing'; end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='biological_decision_policies'
       and column_name='revision_seq' and is_identity='YES'
  ) then raise exception 'FAIL: decision policy revision sequence is missing'; end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid=v_table and contype='c'
       and pg_get_constraintdef(oid) ilike '%trigger_assessment_statuses%'
       and pg_get_constraintdef(oid) ilike '%out_of_range%'
  ) then raise exception 'FAIL: decision policies must be restricted to the implemented explicit trigger'; end if;
  if not (select relrowsecurity from pg_class where oid=v_table) then
    raise exception 'FAIL: decision policy RLS is disabled';
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='biological_decision_policies'
      and policyname='biological_decision_policies_select' and qual ilike '%is_org_member%'
  ) then raise exception 'FAIL: decision policy reads must be organization-member scoped'; end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='biological_decision_policies'
      and policyname='biological_decision_policies_insert' and with_check ilike '%is_org_admin%'
  ) then raise exception 'FAIL: only organization admins may create policies'; end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='biological_decision_policies'
      and policyname='biological_decision_policies_update' and qual ilike '%is_org_admin%'
      and with_check ilike '%is_org_admin%'
  ) then raise exception 'FAIL: only organization admins may review draft policies'; end if;
  if has_table_privilege('anon',v_table,'SELECT') or has_table_privilege('anon',v_table,'INSERT') then
    raise exception 'FAIL: anonymous role must not access decision policies';
  end if;
  if not has_table_privilege('authenticated',v_table,'SELECT') then
    raise exception 'FAIL: authenticated role needs RLS-scoped policy reads';
  end if;
  select pg_get_functiondef('private.guard_biological_decision_policy_version()'::regprocedure) into v_guard;
  if v_guard not ilike '%biological_decision_policy_version_immutable%'
     or v_guard not ilike '%biological_decision_policy_review_must_be_explicit_transition%'
     or v_guard not ilike '%biological_decision_policy_stale_draft_cannot_be_reviewed%'
     or v_guard not ilike '%biological_decision_policy_stale_retirement_blocked%'
     or v_guard not ilike '%biological_decision_policy_retirement_requires_latest_reviewed_version%'
     or v_guard not ilike '%biological_decision_policy_requires_current_reviewed_rule%'
     or v_guard not ilike '%biological_decision_policy_retirement_requires_new_version%'
     or v_guard not ilike '%search_path%pg_catalog, public, private, auth%' then
    raise exception 'FAIL: decision policy lifecycle and exact-rule binding guard is incomplete';
  end if;
  if not exists (
    select 1 from pg_trigger where tgrelid=v_table
      and tgname='biological_decision_policies_version_guard' and not tgisinternal
  ) then raise exception 'FAIL: decision policy version guard trigger is missing'; end if;
end
$$;

select 'Biological decision policy tenant, lifecycle and rule-binding contract passed' as result;
