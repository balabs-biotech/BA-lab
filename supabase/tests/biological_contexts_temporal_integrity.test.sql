-- Regression test for half-open temporal integrity.
begin;

set local search_path = public, extensions;

do $assert_catalog$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.biological_contexts'::regclass
      and conname = 'biological_contexts_no_overlapping_subject_windows'
      and contype = 'x'
  ) then
    raise exception 'missing biological_contexts exclusion constraint';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.biological_contexts'::regclass
      and conname = 'biological_contexts_valid_window'
      and contype = 'c'
  ) then
    raise exception 'missing biological_contexts validity-window check';
  end if;
end;
$assert_catalog$;

create temporary table biological_context_window_test (
  organization_id uuid not null,
  domain text not null,
  subject_id uuid not null,
  valid_from date not null,
  valid_to date,
  exclude using gist (
    organization_id with =,
    domain with =,
    subject_id with =,
    daterange(valid_from, valid_to, '[)') with &&
  ),
  check (valid_to is null or valid_to > valid_from)
) on commit drop;

do $assert_ranges$
declare
  org uuid := gen_random_uuid();
  subject uuid := gen_random_uuid();
begin
  -- Adjacent intervals are valid because valid_to is exclusive.
  insert into biological_context_window_test
    (organization_id, domain, subject_id, valid_from, valid_to)
  values
    (org, 'mycology', subject, date '2026-01-01', date '2026-01-10'),
    (org, 'mycology', subject, date '2026-01-10', date '2026-01-20');

  -- Any actual overlap for the same tenant/domain/subject must be rejected.
  begin
    insert into biological_context_window_test
      (organization_id, domain, subject_id, valid_from, valid_to)
    values
      (org, 'mycology', subject, date '2026-01-09', date '2026-01-11');
    raise exception 'overlapping biological context interval was accepted';
  exception
    when exclusion_violation then
      null;
  end;

  -- A different subject may use the same dates.
  insert into biological_context_window_test
    (organization_id, domain, subject_id, valid_from, valid_to)
  values
    (org, 'mycology', gen_random_uuid(), date '2026-01-09', date '2026-01-11');

  -- Empty intervals are rejected; they are not meaningful biological contexts.
  begin
    insert into biological_context_window_test
      (organization_id, domain, subject_id, valid_from, valid_to)
    values
      (org, 'mycology', gen_random_uuid(), date '2026-02-01', date '2026-02-01');
    raise exception 'empty biological context interval was accepted';
  exception
    when check_violation then
      null;
  end;
end;
$assert_ranges$;

rollback;
