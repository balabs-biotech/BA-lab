-- Authenticated lifecycle RPC: writers may triage signals, viewers cannot.
\set ON_ERROR_STOP on

grant usage on schema auth, private, public to authenticated;
grant execute on function auth.uid() to authenticated;

do $$
declare
  v_org uuid := '00000000-0000-0000-0000-0000000000a1';
  v_viewer uuid := '00000000-0000-0000-0000-0000000000b1';
  v_member uuid := '00000000-0000-0000-0000-0000000000b2';
  v_function oid := to_regprocedure(
    'public.set_biological_signal_status(uuid,uuid,text)'
  );
begin
  if v_function is null then
    raise exception 'FAIL: authenticated biological signal lifecycle RPC is missing';
  end if;

  if not (select prosecdef from pg_proc where oid = v_function) then
    raise exception 'FAIL: lifecycle RPC must use controlled SECURITY DEFINER access';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.set_biological_signal_status(uuid,uuid,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'anon',
    'public.set_biological_signal_status(uuid,uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'FAIL: lifecycle RPC execute grant must be authenticated-only';
  end if;

  insert into public.organizations(id, code, name)
  values (v_org, 'BIO-SIGNAL-LIFECYCLE', 'Biological signal lifecycle test')
  on conflict (id) do nothing;

  insert into auth.users(id) values (v_viewer), (v_member)
  on conflict (id) do nothing;

  insert into public.organization_members(organization_id, user_id, role)
  values (v_org, v_viewer, 'viewer'), (v_org, v_member, 'member')
  on conflict (organization_id, user_id) do update set role = excluded.role;
end
$$;

-- Viewers cannot mutate alert workflow state, even through the definer RPC.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
do $$
begin
  begin
    perform * from public.set_biological_signal_status(
      '00000000-0000-0000-0000-0000000000a1',
      '00000000-0000-0000-0000-0000000000f1',
      'acknowledged'
    );
    raise exception 'FAIL: viewer changed a biological signal status';
  exception when insufficient_privilege then
    null;
  end;
end
$$;
rollback;

-- Invalid lifecycle states are rejected before any record lookup.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', true);
do $$
begin
  begin
    perform * from public.set_biological_signal_status(
      '00000000-0000-0000-0000-0000000000a1',
      '00000000-0000-0000-0000-0000000000f1',
      'silently_deleted'
    );
    raise exception 'FAIL: unsupported biological signal status was accepted';
  exception when check_violation then
    null;
  end;
end
$$;
rollback;

select 'PASS: biological signal lifecycle authorization contract' as result;
