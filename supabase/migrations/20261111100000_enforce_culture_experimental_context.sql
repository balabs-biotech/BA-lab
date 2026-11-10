-- Keep culture-level experiment context consistent with the experiment that owns its unit.
-- The unit is the authoritative relationship; the culture stores both IDs for efficient
-- querying, but PostgreSQL must prevent the denormalized pair from drifting apart.

do $preflight$
begin
  if exists (
    select 1
      from public.cultures c
     where (c.experiment_id is null) <> (c.experimental_unit_id is null)
  ) then
    raise exception 'culture_experimental_context_incomplete: existing cultures must have both experiment_id and experimental_unit_id, or neither';
  end if;

  if exists (
    select 1
      from public.cultures c
      join public.experimental_units eu
        on eu.organization_id = c.organization_id
       and eu.id = c.experimental_unit_id
     where c.experiment_id is distinct from eu.experiment_id
  ) then
    raise exception 'culture_experimental_context_mismatch: existing culture experiment does not own its experimental unit';
  end if;
end;
$preflight$;

alter table public.experimental_units
  add constraint experimental_units_org_id_experiment_unique
  unique (organization_id, id, experiment_id);

alter table public.cultures
  drop constraint if exists cultures_experiment_id_fkey,
  drop constraint if exists cultures_experimental_unit_id_fkey,
  drop constraint if exists cultures_organization_id_experiment_id_fkey,
  drop constraint if exists cultures_organization_id_experimental_unit_id_fkey;

alter table public.cultures
  add constraint cultures_experimental_context_pair_check
    check ((experiment_id is null) = (experimental_unit_id is null)),
  add constraint cultures_experimental_context_fk
    foreign key (organization_id, experimental_unit_id, experiment_id)
    references public.experimental_units (organization_id, id, experiment_id)
    on delete set null (experimental_unit_id, experiment_id);

create index if not exists cultures_org_experimental_unit_idx
  on public.cultures (organization_id, experimental_unit_id)
  where experimental_unit_id is not null;
