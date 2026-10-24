-- Public dataset release surface. Draft datasets and source tables stay private.
-- Only trusted backend code may create/update public export rows.

-- The device registry is created by a later version in the production ledger.
-- Create this index here only on databases where that registry already exists.
do $migration$
begin
  if to_regclass('public.iot_devices') is not null then
    execute 'create unique index if not exists iot_devices_token_sha256_uidx on public.iot_devices (token_sha256)';
  end if;
end
$migration$;

create table if not exists public.public_dataset_records (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references public.commons_datasets(id) on delete cascade,
  record_key text not null,
  schema_version text not null default '1',
  public_payload jsonb not null,
  published_at timestamptz not null default now(),
  unique (dataset_id, record_key),
  check (length(record_key) between 1 and 160),
  check (length(schema_version) between 1 and 40),
  check (jsonb_typeof(public_payload) = 'object')
);

create index if not exists public_dataset_records_dataset_idx
  on public.public_dataset_records (dataset_id, published_at);

alter table public.public_dataset_records enable row level security;

revoke all on table public.public_dataset_records from anon, authenticated;
grant select on table public.public_dataset_records to anon, authenticated;
grant all on table public.public_dataset_records to service_role;

drop policy if exists commons_select on public.commons_datasets;
drop policy if exists commons_published_select on public.commons_datasets;
create policy commons_published_select
  on public.commons_datasets
  for select
  to anon, authenticated
  using (status = 'published');

drop policy if exists public_dataset_records_published_select on public.public_dataset_records;
create policy public_dataset_records_published_select
  on public.public_dataset_records
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.commons_datasets d
      where d.id = public_dataset_records.dataset_id
        and d.status = 'published'
    )
  );

comment on table public.public_dataset_records is
  'Sanitized, explicitly curated export rows. Never populate from raw tables without consent and de-identification checks.';
