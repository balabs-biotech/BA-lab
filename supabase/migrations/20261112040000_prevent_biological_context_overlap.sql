-- Enforce one non-overlapping, half-open biological context interval per subject.
-- btree_gist supplies GiST equality operator classes for UUID and text keys.
create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;
set search_path = public, extensions;

do $preflight$
begin
  if exists (
    select 1
    from public.biological_contexts
    where valid_to is not null
      and valid_to <= valid_from
  ) then
    raise exception 'biological_contexts contains an empty or inverted validity interval';
  end if;

  if exists (
    select 1
    from public.biological_contexts a
    join public.biological_contexts b
      on a.id < b.id
     and a.organization_id = b.organization_id
     and a.domain = b.domain
     and coalesce(a.culture_id, a.plant_culture_id)
         = coalesce(b.culture_id, b.plant_culture_id)
     and daterange(a.valid_from, a.valid_to, '[)')
         && daterange(b.valid_from, b.valid_to, '[)')
  ) then
    raise exception 'biological_contexts contains overlapping validity intervals for a subject';
  end if;
end;
$preflight$;

alter table public.biological_contexts
  drop constraint if exists biological_contexts_valid_window;

alter table public.biological_contexts
  add constraint biological_contexts_valid_window
  check (valid_to is null or valid_to > valid_from);

alter table public.biological_contexts
  add constraint biological_contexts_no_overlapping_subject_windows
  exclude using gist (
    organization_id with =,
    domain with =,
    (coalesce(culture_id, plant_culture_id)) with =,
    daterange(valid_from, valid_to, '[)') with &&
  );

comment on constraint biological_contexts_no_overlapping_subject_windows
  on public.biological_contexts is
  'Prevents overlapping half-open [valid_from, valid_to) biological context intervals for the same tenant, domain and biological subject.';
