
alter table public.biological_parameter_references
  add column if not exists reference_kind text not null default 'observed_range';

alter table public.biological_parameter_references
  drop constraint if exists biological_parameter_references_reference_kind_check;

alter table public.biological_parameter_references
  add constraint biological_parameter_references_reference_kind_check
  check (reference_kind = any (array[
    'operating_condition',
    'observed_range',
    'experimental_optimum',
    'tolerance_limit',
    'alerting_interval',
    'recommendation'
  ]));

create unique index if not exists biological_parameter_references_org_id_uidx
  on public.biological_parameter_references (organization_id, id);

create unique index if not exists biological_profile_evidence_org_id_uidx
  on public.biological_profile_evidence (organization_id, id);

create table if not exists public.biological_parameter_reference_evidence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  parameter_reference_id uuid not null,
  profile_evidence_id uuid not null,
  relationship_note text,
  created_at timestamptz not null default now(),
  constraint biological_parameter_reference_evidence_pair_unique
    unique (organization_id, parameter_reference_id, profile_evidence_id),
  constraint biological_parameter_reference_evidence_reference_fk
    foreign key (organization_id, parameter_reference_id)
    references public.biological_parameter_references (organization_id, id)
    on delete cascade,
  constraint biological_parameter_reference_evidence_evidence_fk
    foreign key (organization_id, profile_evidence_id)
    references public.biological_profile_evidence (organization_id, id)
    on delete cascade
);

create index if not exists biological_parameter_reference_evidence_profile_ref_idx
  on public.biological_parameter_reference_evidence (organization_id, parameter_reference_id);

create index if not exists biological_parameter_reference_evidence_evidence_idx
  on public.biological_parameter_reference_evidence (organization_id, profile_evidence_id);

alter table public.biological_parameter_reference_evidence enable row level security;

drop policy if exists biological_parameter_reference_evidence_select on public.biological_parameter_reference_evidence;
create policy biological_parameter_reference_evidence_select
  on public.biological_parameter_reference_evidence
  for select to authenticated
  using (private.is_org_member(organization_id));

drop policy if exists biological_parameter_reference_evidence_insert on public.biological_parameter_reference_evidence;
create policy biological_parameter_reference_evidence_insert
  on public.biological_parameter_reference_evidence
  for insert to authenticated
  with check (private.is_org_writer(organization_id));

drop policy if exists biological_parameter_reference_evidence_update on public.biological_parameter_reference_evidence;
create policy biological_parameter_reference_evidence_update
  on public.biological_parameter_reference_evidence
  for update to authenticated
  using (private.is_org_writer(organization_id))
  with check (private.is_org_writer(organization_id));

drop policy if exists biological_parameter_reference_evidence_delete on public.biological_parameter_reference_evidence;
create policy biological_parameter_reference_evidence_delete
  on public.biological_parameter_reference_evidence
  for delete to authenticated
  using (private.is_org_writer(organization_id));

grant select, insert, update, delete on public.biological_parameter_reference_evidence to authenticated, service_role;

create or replace function public.enforce_parameter_reference_evidence_before_validation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.validation_status = 'validated'
     and (tg_op = 'INSERT' or old.validation_status is distinct from 'validated') then
    if not exists (
      select 1
      from public.biological_parameter_reference_evidence link
      where link.organization_id = new.organization_id
        and link.parameter_reference_id = new.id
    ) then
      raise exception 'parameter_reference_requires_linked_evidence_before_validation'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists biological_parameter_reference_evidence_validation_guard
  on public.biological_parameter_references;

create trigger biological_parameter_reference_evidence_validation_guard
  before insert or update of validation_status
  on public.biological_parameter_references
  for each row execute function public.enforce_parameter_reference_evidence_before_validation();
;
