-- Queryable, immutable scientific outputs and atomic execution completion.
create table if not exists public.engine_execution_results (
  organization_id uuid not null,
  id uuid not null default gen_random_uuid(),
  execution_id uuid not null,
  engine_id text not null,
  engine_version text not null,
  result_type text not null,
  outcome text not null check (outcome in ('success','insufficient_data','out_of_domain','review_required')),
  input_record_ids uuid[] not null,
  input_snapshot_sha256 text not null check (input_snapshot_sha256 ~ '^[a-f0-9]{64}$'),
  value jsonb not null check (jsonb_typeof(value) = 'object'),
  limitations jsonb not null default '[]'::jsonb check (jsonb_typeof(limitations) = 'array'),
  quality_flags jsonb not null default '[]'::jsonb check (jsonb_typeof(quality_flags) = 'array'),
  confidence jsonb check (confidence is null or jsonb_typeof(confidence) = 'object'),
  provenance jsonb not null check (jsonb_typeof(provenance) = 'object'),
  generated_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, id),
  unique (organization_id, execution_id),
  foreign key (organization_id, execution_id)
    references public.engine_executions(organization_id, id) on delete cascade
);

create index if not exists engine_execution_results_org_type_time_idx
  on public.engine_execution_results (organization_id, result_type, generated_at desc);
create index if not exists engine_execution_results_org_outcome_time_idx
  on public.engine_execution_results (organization_id, outcome, generated_at desc);
create index if not exists engine_execution_results_input_ids_idx
  on public.engine_execution_results using gin (input_record_ids);

alter table public.engine_execution_results enable row level security;
drop policy if exists engine_execution_results_select on public.engine_execution_results;
create policy engine_execution_results_select
  on public.engine_execution_results for select to authenticated
  using (private.is_org_member(organization_id));
revoke all on public.engine_execution_results from anon, authenticated;
grant select on public.engine_execution_results to authenticated;
grant all on public.engine_execution_results to service_role;

create or replace function private.reject_engine_result_update()
returns trigger language plpgsql set search_path = pg_catalog
as $$
begin
  raise exception 'engine results cannot be updated; create a new execution for a new interpretation'
    using errcode = '55000';
end;
$$;
revoke all on function private.reject_engine_result_update() from public, anon, authenticated;
drop trigger if exists engine_execution_results_immutable on public.engine_execution_results;
drop trigger if exists engine_execution_results_no_update on public.engine_execution_results;
create trigger engine_execution_results_no_update
  before update on public.engine_execution_results
  for each row execute function private.reject_engine_result_update();

create or replace function public.complete_engine_execution(
  p_organization_id uuid, p_execution_id uuid, p_result jsonb, p_completed_at timestamptz
)
returns uuid language plpgsql security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_execution public.engine_executions%rowtype;
  v_result_id uuid;
  v_payload jsonb;
begin
  if jsonb_typeof(p_result) is distinct from 'object'
    or p_result->>'contract' is distinct from 'BA-LABS/ENGINE-RESULT'
    or p_result->>'status' is distinct from 'completed'
    or jsonb_typeof(p_result->'result') is distinct from 'object' then
    raise exception 'invalid completed engine result envelope' using errcode = '22023';
  end if;

  select * into v_execution from public.engine_executions
  where organization_id = p_organization_id and id = p_execution_id for update;

  if not found or v_execution.status <> 'running' then
    raise exception 'execution is missing or not running' using errcode = '55000';
  end if;
  if p_result->>'execution_id' is distinct from v_execution.id::text then
    raise exception 'result execution_id does not match durable ledger identity' using errcode = '22023';
  end if;
  if p_result->>'request_id' <> v_execution.request_id::text
    or p_result->'engine'->>'engine_id' <> v_execution.engine_id
    or p_result->'engine'->>'engine_version' <> v_execution.engine_version
    or p_result->>'input_snapshot_sha256' <> v_execution.input_snapshot_sha256 then
    raise exception 'result does not match execution identity and input snapshot' using errcode = '22023';
  end if;

  v_payload := p_result->'result';
  if v_payload->>'outcome' is null
    or v_payload->>'outcome' not in ('success','insufficient_data','out_of_domain','review_required')
    or jsonb_typeof(v_payload->'value') is distinct from 'object'
    or jsonb_typeof(v_payload->'limitations') is distinct from 'array'
    or jsonb_typeof(v_payload->'quality_flags') is distinct from 'array'
    or jsonb_typeof(v_payload->'provenance') is distinct from 'object'
    or (v_payload ? 'confidence' and jsonb_typeof(v_payload->'confidence') is distinct from 'object') then
    raise exception 'result payload is missing required structured fields' using errcode = '22023';
  end if;

  insert into public.engine_execution_results (
    organization_id, execution_id, engine_id, engine_version, result_type, outcome,
    input_record_ids, input_snapshot_sha256, value, limitations, quality_flags,
    confidence, provenance, generated_at
  ) values (
    p_organization_id, p_execution_id, v_execution.engine_id, v_execution.engine_version,
    v_execution.engine_id, v_payload->>'outcome', v_execution.input_record_ids,
    v_execution.input_snapshot_sha256, v_payload->'value', v_payload->'limitations',
    v_payload->'quality_flags', v_payload->'confidence', v_payload->'provenance',
    p_completed_at
  ) returning id into v_result_id;

  update public.engine_executions
  set status = 'completed', result_payload = p_result,
      completed_at = p_completed_at, updated_at = p_completed_at
  where organization_id = p_organization_id and id = p_execution_id;
  return v_result_id;
end;
$$;
revoke all on function public.complete_engine_execution(uuid, uuid, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.complete_engine_execution(uuid, uuid, jsonb, timestamptz) to service_role;
comment on table public.engine_execution_results is
  'Queryable immutable analytical outputs, separated from raw measurements and linked to their immutable execution input snapshot.';
