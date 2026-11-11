-- Append-only, tenant-scoped history for deterministic biological assessments.
create table public.biological_assessments (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  idempotency_key uuid not null,
  source_measurement_id uuid not null,
  rule_version_id uuid,
  status text not null check (status in ('normal','out_of_range','insufficient_context','not_assessed','no_matching_rule','ambiguous_rule')),
  reason text not null check (length(btrim(reason)) > 0),
  engine_version text not null check (length(btrim(engine_version)) > 0),
  calculation_origin text not null default 'client_engine' check (calculation_origin = 'client_engine'),
  server_verification text not null default 'not_recomputed' check (server_verification = 'not_recomputed'),
  measurement_snapshot jsonb not null check (jsonb_typeof(measurement_snapshot) = 'object'),
  context_snapshot jsonb not null check (jsonb_typeof(context_snapshot) = 'object'),
  resolution_snapshot jsonb not null check (jsonb_typeof(resolution_snapshot) = 'object'),
  result_snapshot jsonb not null check (jsonb_typeof(result_snapshot) = 'object'),
  assessed_by uuid not null default auth.uid() references auth.users(id),
  assessed_at timestamptz not null default now(),
  primary key (organization_id,id),
  unique (organization_id,idempotency_key),
  foreign key (organization_id,source_measurement_id)
    references public.measurements(organization_id,id) on delete restrict,
  foreign key (organization_id,rule_version_id)
    references public.biological_rules(organization_id,id) on delete restrict,
  check (result_snapshot->>'status' = status),
  check (result_snapshot->>'reason' = reason),
  check (result_snapshot->>'engine_version' = engine_version),
  check (result_snapshot->>'raw_measurement_modified' = 'false')
);

create index biological_assessments_measurement_history_idx
  on public.biological_assessments (organization_id,source_measurement_id,assessed_at desc);
create index biological_assessments_rule_history_idx
  on public.biological_assessments (organization_id,rule_version_id,assessed_at desc);

alter table public.biological_assessments enable row level security;
create policy biological_assessments_select
  on public.biological_assessments for select to authenticated
  using (private.is_org_member(organization_id));

revoke all on public.biological_assessments from public, anon, authenticated;
grant select on public.biological_assessments to authenticated;

create or replace function private.guard_biological_assessment_immutable()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, private, auth
as $function$
begin
  raise exception 'biological_assessment_history_is_append_only' using errcode = '55000';
end;
$function$;

revoke all on function private.guard_biological_assessment_immutable() from public;
create trigger biological_assessments_immutable
  before update or delete on public.biological_assessments
  for each row execute function private.guard_biological_assessment_immutable();

create or replace function public.record_biological_assessment(
  p_source_measurement_id uuid,
  p_rule_version_id uuid,
  p_status text,
  p_reason text,
  p_engine_version text,
  p_measurement_snapshot jsonb,
  p_context_snapshot jsonb,
  p_resolution_snapshot jsonb,
  p_result_snapshot jsonb,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_org_id uuid;
  v_measurement public.measurements%rowtype;
  v_rule public.biological_rules%rowtype;
  v_assessment_id uuid;
  v_existing public.biological_assessments%rowtype;
begin
  v_org_id := nullif(p_context_snapshot->>'organization_id','')::uuid;
  if auth.uid() is null or v_org_id is null or not private.is_org_member(v_org_id) then
    raise exception 'Organization access denied' using errcode = '42501';
  end if;
  if p_idempotency_key is null
     or p_source_measurement_id is null
     or p_status is null
     or p_status not in ('normal','out_of_range','insufficient_context','not_assessed','no_matching_rule','ambiguous_rule')
     or p_reason is null or length(btrim(p_reason)) = 0
     or p_engine_version is null or length(btrim(p_engine_version)) = 0
     or jsonb_typeof(p_measurement_snapshot) is distinct from 'object'
     or jsonb_typeof(p_context_snapshot) is distinct from 'object'
     or jsonb_typeof(p_resolution_snapshot) is distinct from 'object'
     or jsonb_typeof(p_result_snapshot) is distinct from 'object'
     or p_result_snapshot->>'status' is distinct from p_status
     or p_result_snapshot->>'reason' is distinct from p_reason
     or p_result_snapshot->>'engine_version' is distinct from p_engine_version
     or p_result_snapshot->>'raw_measurement_modified' is distinct from 'false' then
    raise exception 'Invalid biological assessment payload' using errcode = '22023';
  end if;

  -- Resolve a retry before checking whether its formerly-current rule is still current.
  select * into v_existing from public.biological_assessments
   where organization_id = v_org_id and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.source_measurement_id is distinct from p_source_measurement_id
       or v_existing.rule_version_id is distinct from p_rule_version_id
       or v_existing.status is distinct from p_status
       or v_existing.reason is distinct from p_reason
       or v_existing.engine_version is distinct from p_engine_version
       or v_existing.measurement_snapshot is distinct from p_measurement_snapshot
       or v_existing.context_snapshot is distinct from p_context_snapshot
       or v_existing.resolution_snapshot is distinct from p_resolution_snapshot
       or v_existing.result_snapshot is distinct from p_result_snapshot then
      raise exception 'Assessment idempotency key payload conflict' using errcode = '23505';
    end if;
    return v_existing.id;
  end if;

  select * into v_measurement
    from public.measurements
   where organization_id = v_org_id and id = p_source_measurement_id
   for share;
  if not found or v_measurement.quality_state = 'excluded' then
    raise exception 'Source measurement unavailable or excluded' using errcode = '22023';
  end if;
  if nullif(p_context_snapshot->>'culture_id','')::uuid is distinct from v_measurement.culture_id
     or p_measurement_snapshot->>'variable_code' is distinct from v_measurement.variable_code
     or p_measurement_snapshot->>'assessed_unit_code' is distinct from v_measurement.raw_unit_code
     or (p_measurement_snapshot->>'assessed_value')::numeric is distinct from v_measurement.raw_value then
    raise exception 'Assessment evidence does not match source raw measurement' using errcode = '22023';
  end if;

  if p_rule_version_id is not null then
    select * into v_rule
      from public.biological_rules
     where organization_id = v_org_id and id = p_rule_version_id
     for share;
    if not found or v_rule.status <> 'reviewed'
       or v_rule.domain is distinct from p_context_snapshot->>'domain'
       or v_rule.rule_id is distinct from p_result_snapshot->>'rule_id'
       or v_rule.version is distinct from p_result_snapshot->>'rule_version'
       or exists (
         select 1 from public.biological_rules newer
          where newer.organization_id = v_org_id
            and newer.rule_id = v_rule.rule_id
            and newer.revision_seq > v_rule.revision_seq
            and newer.status in ('reviewed','retired')
       ) then
      raise exception 'Assessment rule version is not the current reviewed version' using errcode = '40001';
    end if;
  elsif p_status in ('normal','out_of_range') then
    raise exception 'A matched biological assessment requires its rule version reference' using errcode = '22023';
  end if;

  insert into public.biological_assessments (
    organization_id, idempotency_key, source_measurement_id, rule_version_id, status, reason,
    engine_version, calculation_origin, server_verification,
    measurement_snapshot, context_snapshot, resolution_snapshot, result_snapshot, assessed_by
  ) values (
    v_org_id, p_idempotency_key, p_source_measurement_id, p_rule_version_id, p_status, p_reason,
    p_engine_version, 'client_engine', 'not_recomputed',
    p_measurement_snapshot, p_context_snapshot, p_resolution_snapshot, p_result_snapshot, auth.uid()
  ) on conflict (organization_id,idempotency_key) do nothing returning id into v_assessment_id;

  if v_assessment_id is null then
    select * into v_existing from public.biological_assessments
     where organization_id = v_org_id and idempotency_key = p_idempotency_key;
    if not found
       or v_existing.source_measurement_id is distinct from p_source_measurement_id
       or v_existing.rule_version_id is distinct from p_rule_version_id
       or v_existing.status is distinct from p_status
       or v_existing.reason is distinct from p_reason
       or v_existing.measurement_snapshot is distinct from p_measurement_snapshot
       or v_existing.context_snapshot is distinct from p_context_snapshot
       or v_existing.resolution_snapshot is distinct from p_resolution_snapshot
       or v_existing.result_snapshot is distinct from p_result_snapshot then
      raise exception 'Assessment idempotency key payload conflict' using errcode = '23505';
    end if;
    v_assessment_id := v_existing.id;
  end if;

  return v_assessment_id;
end;
$function$;

revoke all on function public.record_biological_assessment(uuid,uuid,text,text,text,jsonb,jsonb,jsonb,jsonb,uuid) from public, anon;
grant execute on function public.record_biological_assessment(uuid,uuid,text,text,text,jsonb,jsonb,jsonb,jsonb,uuid) to authenticated;
