-- Biological assessment evidence is tenant-scoped, append-only and explicitly client-calculated.
\set ON_ERROR_STOP on

do $$
declare
  v_table regclass := to_regclass('public.biological_assessments');
  v_guard text;
  v_rpc text;
begin
  if v_table is null then raise exception 'FAIL: biological_assessments is missing'; end if;
  if not (select relrowsecurity from pg_class where oid = v_table) then
    raise exception 'FAIL: biological assessment RLS is disabled';
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='biological_assessments'
      and policyname='biological_assessments_select' and qual ilike '%is_org_member%'
  ) then raise exception 'FAIL: assessment history is not organization-member scoped'; end if;
  if has_table_privilege('authenticated',v_table,'INSERT') or
     has_table_privilege('authenticated',v_table,'UPDATE') or
     has_table_privilege('authenticated',v_table,'DELETE') then
    raise exception 'FAIL: clients must write only through guarded assessment RPC and history is append-only';
  end if;
  if has_table_privilege('anon',v_table,'SELECT') then
    raise exception 'FAIL: anonymous role must not read assessment history';
  end if;
  select pg_get_functiondef('private.guard_biological_assessment_immutable()'::regprocedure) into v_guard;
  if v_guard not ilike '%biological_assessment_history_is_append_only%' then
    raise exception 'FAIL: immutable assessment trigger is missing';
  end if;
  select pg_get_functiondef('public.record_biological_assessment(uuid,uuid,text,text,text,jsonb,jsonb,jsonb,jsonb)'::regprocedure) into v_rpc;
  if v_rpc not ilike '%is_org_member%'
     or v_rpc not ilike '%Source measurement unavailable or excluded%'
     or v_rpc not ilike '%Assessment evidence does not match source raw measurement%'
     or v_rpc not ilike '%Assessment rule version is not the current reviewed version%'
     or v_rpc not ilike '%not_recomputed%' then
    raise exception 'FAIL: guarded assessment evidence RPC contract is incomplete';
  end if;
  if not has_function_privilege('authenticated','public.record_biological_assessment(uuid,uuid,text,text,text,jsonb,jsonb,jsonb,jsonb)','EXECUTE') then
    raise exception 'FAIL: authenticated users need guarded assessment RPC execution';
  end if;
end
$$;

select 'Biological assessment evidence history security contract passed' as result;
