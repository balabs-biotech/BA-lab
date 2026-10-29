-- Enforce role-aware tenant writes across direct RLS policies and privileged mutation RPCs.
-- viewer remains read-only; owner/admin/member may write tenant data.
-- Self-service consent and trusted-backend subscription policies are intentionally preserved.
create or replace function private.is_org_writer(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.organization_members om
    where om.organization_id = p_org
      and om.user_id = auth.uid()
      and om.role::text in ('owner', 'admin', 'member')
  );
$$;

revoke all on function private.is_org_writer(uuid) from public, anon;
grant execute on function private.is_org_writer(uuid) to authenticated;

do $$
declare
  p record;
  v_roles text;
  v_qual text;
  v_check text;
  v_sql text;
begin
  -- ALL policies combine read and write permissions. They need a dedicated review
  -- rather than being silently rewritten and accidentally removing viewer read access.
  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename not in (
        'organizations', 'organization_members', 'culture_data_consents',
        'organization_subscriptions'
      )
      and cmd = 'ALL'
      and (
        coalesce(qual, '') like '%private.is_org_member(%'
        or coalesce(with_check, '') like '%private.is_org_member(%'
      )
  ) then
    raise exception 'Role-aware write migration blocked: review ALL policies using private.is_org_member before proceeding';
  end if;

  for p in
    select *
    from pg_policies
    where schemaname = 'public'
      and tablename not in (
        'organizations', 'organization_members', 'culture_data_consents',
        'organization_subscriptions'
      )
      and cmd in ('INSERT', 'UPDATE', 'DELETE')
      and (
        coalesce(qual, '') like '%private.is_org_member(%'
        or coalesce(with_check, '') like '%private.is_org_member(%'
      )
  loop
    select string_agg(
      case when role_name = 'public' then 'public' else quote_ident(role_name) end,
      ', ' order by role_name
    )
    into v_roles
    from unnest(p.roles) as r(role_name);

    v_qual := case when p.qual is null then null
      else replace(p.qual, 'private.is_org_member(', 'private.is_org_writer(') end;
    v_check := case when p.with_check is null then null
      else replace(p.with_check, 'private.is_org_member(', 'private.is_org_writer(') end;

    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);

    v_sql := format(
      'create policy %I on %I.%I as %s for %s to %s',
      p.policyname, p.schemaname, p.tablename, p.permissive, p.cmd, v_roles
    );
    if v_qual is not null then
      v_sql := v_sql || format(' using (%s)', v_qual);
    end if;
    if v_check is not null then
      v_sql := v_sql || format(' with check (%s)', v_check);
    end if;

    execute v_sql;
  end loop;
end
$$;

do $$
declare
  f record;
  v_definition text;
begin
  -- Restrict privileged mutation RPCs by role as well as organization membership.
  -- Read-only SECURITY DEFINER functions are left unchanged.
  for f in
    select p.oid, pg_get_functiondef(p.oid) as definition
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and pg_get_functiondef(p.oid) like '%private.is_org_member(%'
      and lower(pg_get_functiondef(p.oid)) ~
        '(insert[[:space:]]+into[[:space:]]+public\.|update[[:space:]]+public\.|delete[[:space:]]+from[[:space:]]+public\.)'
  loop
    v_definition := replace(f.definition, 'private.is_org_member(', 'private.is_org_writer(');
    if v_definition is distinct from f.definition then
      execute v_definition;
    end if;
  end loop;
end
$$;
