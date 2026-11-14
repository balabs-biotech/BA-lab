-- Tenant-scoped immutable dependency edges between scientific engine executions.
-- v1 deliberately supports one fixed QC -> BIE edge; arbitrary DAGs are not exposed.
create table if not exists public.engine_execution_dependencies (
  organization_id uuid not null,
  downstream_execution_id uuid not null,
  upstream_execution_id uuid not null,
  upstream_result_id uuid not null,
  dependency_role text not null check (dependency_role = 'environmental_qc'),
  upstream_input_snapshot_sha256 text not null check (upstream_input_snapshot_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  primary key (organization_id, downstream_execution_id, dependency_role),
  check (downstream_execution_id <> upstream_execution_id),
  foreign key (organization_id, downstream_execution_id)
    references public.engine_executions(organization_id, id) on delete restrict,
  foreign key (organization_id, upstream_execution_id)
    references public.engine_executions(organization_id, id) on delete restrict,
  foreign key (organization_id, upstream_result_id)
    references public.engine_execution_results(organization_id, id) on delete restrict,
  unique (organization_id, downstream_execution_id, upstream_execution_id, dependency_role)
);

create index if not exists engine_execution_dependencies_upstream_idx
  on public.engine_execution_dependencies(organization_id, upstream_execution_id);

alter table public.engine_execution_dependencies enable row level security;
drop policy if exists engine_execution_dependencies_select on public.engine_execution_dependencies;
create policy engine_execution_dependencies_select
  on public.engine_execution_dependencies for select to authenticated
  using (private.is_org_member(organization_id));
revoke all on public.engine_execution_dependencies from public, anon, authenticated;
grant select on public.engine_execution_dependencies to authenticated;
grant all on public.engine_execution_dependencies to service_role;

create or replace function private.reject_engine_dependency_mutation()
returns trigger language plpgsql set search_path = pg_catalog
as $$
begin
  raise exception 'engine execution dependency edges are immutable'
    using errcode = '55000';
end;
$$;
revoke all on function private.reject_engine_dependency_mutation() from public, anon, authenticated;
drop trigger if exists engine_execution_dependencies_immutable on public.engine_execution_dependencies;
create trigger engine_execution_dependencies_immutable
  before update or delete on public.engine_execution_dependencies
  for each row execute function private.reject_engine_dependency_mutation();

create or replace function public.attach_environmental_qc_dependency(
  p_organization_id uuid,
  p_downstream_execution_id uuid,
  p_upstream_execution_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_downstream public.engine_executions%rowtype;
  v_upstream public.engine_executions%rowtype;
  v_result public.engine_execution_results%rowtype;
  v_dependency_id uuid;
begin
  select * into v_downstream
  from public.engine_executions
  where organization_id = p_organization_id and id = p_downstream_execution_id
  for update;

  if not found or v_downstream.status not in ('queued','running') then
    raise exception 'downstream execution is missing or not active' using errcode = '55000';
  end if;

  select * into v_upstream
  from public.engine_executions
  where organization_id = p_organization_id and id = p_upstream_execution_id;

  if not found or v_upstream.status <> 'completed'
    or v_upstream.engine_id <> 'environmental.timeseries.qc'
    or v_upstream.engine_version <> '0.2.0' then
    raise exception 'upstream execution is not a completed allowlisted environmental QC result'
      using errcode = '22023';
  end if;

  if v_downstream.engine_id <> 'biological.context.features'
    or v_downstream.engine_version <> '0.2.0'
    or v_downstream.status <> 'queued' then
    raise exception 'downstream execution is not a queued supported BIE v0.2 execution'
      using errcode = '22023';
  end if;

  -- QC scope is intentionally narrower than BIE scope (it has no culture/plant
  -- subject). Compare the shared tenant and location dimensions, not whole JSONB.
  if v_downstream.scope->>'organization_id' is distinct from v_upstream.scope->>'organization_id'
    or v_downstream.scope->>'location_id' is distinct from v_upstream.scope->>'location_id'
    or v_downstream.request_payload->'parameters'->>'window_start'
      is distinct from v_upstream.request_payload->'parameters'->>'window_start'
    or v_downstream.request_payload->'parameters'->>'window_end'
      is distinct from v_upstream.request_payload->'parameters'->>'window_end' then
    raise exception 'upstream QC scope or analysis window does not match downstream BIE'
      using errcode = '22023';
  end if;

  select * into v_result
  from public.engine_execution_results
  where organization_id = p_organization_id
    and execution_id = p_upstream_execution_id;

  if not found or v_result.input_snapshot_sha256 <> v_upstream.input_snapshot_sha256
    or v_result.engine_id <> v_upstream.engine_id
    or v_result.engine_version <> v_upstream.engine_version then
    raise exception 'upstream result is missing or does not match its immutable execution'
      using errcode = '22023';
  end if;

  insert into public.engine_execution_dependencies(
    organization_id, downstream_execution_id, upstream_execution_id,
    upstream_result_id, dependency_role, upstream_input_snapshot_sha256
  ) values (
    p_organization_id, p_downstream_execution_id, p_upstream_execution_id,
    v_result.id, 'environmental_qc', v_upstream.input_snapshot_sha256
  )
  returning upstream_result_id into v_dependency_id;

  return v_dependency_id;
end;
$$;

revoke all on function public.attach_environmental_qc_dependency(uuid,uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.attach_environmental_qc_dependency(uuid,uuid,uuid)
  to service_role;

comment on table public.engine_execution_dependencies is
  'Immutable, tenant-scoped lineage edges linking downstream scientific executions to verified upstream result rows.';
