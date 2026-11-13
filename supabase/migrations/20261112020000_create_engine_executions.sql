-- Durable, tenant-scoped lifecycle for registered scientific engine executions.
-- Writes are service-managed by the authenticated orchestration Edge Function;
-- organization members can read executions but cannot forge results or state.
create table if not exists public.engine_executions (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  request_id uuid not null,
  idempotency_key text not null,
  engine_id text not null check (engine_id ~ '^[a-z][a-z0-9_.-]{1,79}$'),
  engine_version text not null check (engine_version ~ '^[0-9]+\.[0-9]+\.[0-9]+([+-][0-9A-Za-z.-]+)?$'),
  scope jsonb not null check (jsonb_typeof(scope) = 'object'),
  input_record_ids uuid[] not null check (cardinality(input_record_ids) > 0 or engine_id = 'biological.context.features'),
  input_snapshot_sha256 text not null check (input_snapshot_sha256 ~ '^[a-f0-9]{64}$'),
  request_payload jsonb not null check (jsonb_typeof(request_payload) = 'object'),
  status text not null default 'queued' check (status in ('queued','running','completed','failed')),
  result_payload jsonb,
  error_code text,
  error_message text,
  requested_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (organization_id, id),
  unique (organization_id, id),
  unique (organization_id, request_id),
  unique (organization_id, idempotency_key),
  check (
    (status in ('queued','running') and result_payload is null and completed_at is null)
    or (status = 'completed' and result_payload is not null and completed_at is not null)
    or (status = 'failed' and result_payload is null and error_code is not null and completed_at is not null)
  ),
  check (status <> 'running' or started_at is not null)
);

create index if not exists engine_executions_org_created_idx
  on public.engine_executions (organization_id, created_at desc);
create index if not exists engine_executions_org_status_idx
  on public.engine_executions (organization_id, status, created_at desc);

alter table public.engine_executions enable row level security;
drop policy if exists engine_executions_select on public.engine_executions;
create policy engine_executions_select
  on public.engine_executions for select to authenticated
  using (private.is_org_member(organization_id));

revoke all on public.engine_executions from anon, authenticated;
grant select on public.engine_executions to authenticated;

comment on table public.engine_executions is
  'Immutable-input, tenant-scoped execution ledger for versioned BA Labs scientific engines. Writes are service-managed; raw source records remain unchanged.';

-- The execution identity and input snapshot are immutable after creation.
-- Only the controlled lifecycle fields may change, and only along valid edges.
create or replace function private.guard_engine_execution_update()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.organization_id is distinct from old.organization_id
    or new.id is distinct from old.id
    or new.request_id is distinct from old.request_id
    or new.idempotency_key is distinct from old.idempotency_key
    or new.engine_id is distinct from old.engine_id
    or new.engine_version is distinct from old.engine_version
    or new.scope is distinct from old.scope
    or new.input_record_ids is distinct from old.input_record_ids
    or new.input_snapshot_sha256 is distinct from old.input_snapshot_sha256
    or new.request_payload is distinct from old.request_payload
    or new.requested_by is distinct from old.requested_by
    or new.created_at is distinct from old.created_at then
    raise exception 'engine execution identity and input snapshot are immutable'
      using errcode = '55000';
  end if;

  if old.status in ('completed', 'failed') then
    raise exception 'terminal engine executions are immutable'
      using errcode = '55000';
  end if;

  if old.status = 'queued' and new.status not in ('running', 'failed') then
    raise exception 'invalid engine execution transition from queued'
      using errcode = '55000';
  end if;
  if old.status = 'running' and new.status not in ('completed', 'failed') then
    raise exception 'invalid engine execution transition from running'
      using errcode = '55000';
  end if;
  if old.status = 'running' and new.started_at is distinct from old.started_at then
    raise exception 'engine execution start timestamp is immutable once running'
      using errcode = '55000';
  end if;
  if new.updated_at < old.updated_at then
    raise exception 'engine execution updated_at cannot move backwards'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_engine_execution_update() from public, anon, authenticated;
drop trigger if exists engine_executions_guard_update on public.engine_executions;
create trigger engine_executions_guard_update
  before update on public.engine_executions
  for each row execute function private.guard_engine_execution_update();
