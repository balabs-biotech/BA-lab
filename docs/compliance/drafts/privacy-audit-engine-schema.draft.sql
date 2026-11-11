-- REVIEW DRAFT — do not apply directly.
-- This file is deliberately outside supabase/migrations until it is generated
-- through the repository's Supabase CLI workflow and reviewed locally.

create table private.legal_document_versions (
  id uuid primary key default gen_random_uuid(),
  document_type text not null check (
    document_type in ('terms','privacy_notice','cookies_notice','research_consent')
  ),
  version text not null check (length(btrim(version)) > 0),
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  document_path text not null check (length(btrim(document_path)) > 0),
  effective_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint legal_document_versions_type_version_unique unique (document_type, version),
  constraint legal_document_versions_retirement_after_effective check (
    retired_at is null or (effective_at is not null and retired_at >= effective_at)
  )
);

create table private.legal_consent_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  subject_user_id uuid references auth.users(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  document_version_id uuid not null
    references private.legal_document_versions(id) on delete restrict,
  action text not null check (action in ('accepted','acknowledged','withdrawn')),
  purpose text not null check (
    purpose in ('terms_acceptance','privacy_notice_acknowledgement','research_reuse')
  ),
  occurred_at timestamptz not null default now(),
  capture_channel text not null check (
    capture_channel in ('signup','workspace','settings','admin','migration')
  ),
  request_id text,
  constraint legal_consent_events_request_id_length check (
    request_id is null or length(request_id) between 1 and 128
  )
);

create index legal_consent_events_subject_time_idx
  on private.legal_consent_events(subject_user_id, occurred_at desc);
create index legal_consent_events_org_time_idx
  on private.legal_consent_events(organization_id, occurred_at desc);
create index legal_consent_events_document_idx
  on private.legal_consent_events(document_version_id);

create table private.personal_data_operation_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  operation text not null check (
    operation in ('collect','create','read','update','export','transmit','delete',
                  'encrypt','restore','admin_access')
  ),
  data_categories text[] not null check (cardinality(data_categories) > 0),
  purpose_code text not null check (length(btrim(purpose_code)) > 0),
  subject_ref text,
  resource_ref text not null check (length(btrim(resource_ref)) > 0),
  recipient_code text,
  occurred_at timestamptz not null default now(),
  request_id text,
  source_component text not null check (length(btrim(source_component)) > 0),
  outcome text not null check (outcome in ('success','failure','denied')),
  constraint personal_data_operation_request_id_length check (
    request_id is null or length(request_id) between 1 and 128
  )
);

create index personal_data_operation_org_time_idx
  on private.personal_data_operation_events(organization_id, occurred_at desc);
create index personal_data_operation_actor_time_idx
  on private.personal_data_operation_events(actor_user_id, occurred_at desc);
create index personal_data_operation_resource_idx
  on private.personal_data_operation_events(resource_ref, occurred_at desc);

-- Defense in depth: the application roles receive no direct access to these tables.
alter table private.legal_document_versions enable row level security;
alter table private.legal_consent_events enable row level security;
alter table private.personal_data_operation_events enable row level security;

revoke all on private.legal_document_versions from public, anon, authenticated;
revoke all on private.legal_consent_events from public, anon, authenticated;
revoke all on private.personal_data_operation_events from public, anon, authenticated;
grant usage on schema private to service_role;
grant select, insert, update, delete on private.legal_document_versions to service_role;
grant select, insert on private.legal_consent_events to service_role;
grant select, insert on private.personal_data_operation_events to service_role;

create or replace function private.reject_append_only_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'append_only_record_immutable';
end;
$$;

revoke all on function private.reject_append_only_mutation() from public, anon, authenticated;

create trigger legal_consent_events_append_only
before update or delete on private.legal_consent_events
for each row execute function private.reject_append_only_mutation();

create trigger personal_data_operation_events_append_only
before update or delete on private.personal_data_operation_events
for each row execute function private.reject_append_only_mutation();

-- A published document's content identity cannot be rewritten. Retirement is
-- represented by a one-way timestamp transition; all other fields stay fixed.
create or replace function private.guard_legal_document_version()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if old.effective_at is not null then
    if new.id is distinct from old.id
       or new.document_type is distinct from old.document_type
       or new.version is distinct from old.version
       or new.content_sha256 is distinct from old.content_sha256
       or new.document_path is distinct from old.document_path
       or new.effective_at is distinct from old.effective_at
       or new.created_at is distinct from old.created_at
       or new.created_by is distinct from old.created_by
       or (old.retired_at is not null and new.retired_at is distinct from old.retired_at)
       or (old.retired_at is null and new.retired_at is not null
           and new.retired_at < old.effective_at) then
      raise exception 'published_legal_document_version_immutable';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.guard_legal_document_version() from public, anon, authenticated;

create trigger legal_document_versions_immutable_after_publish
before update on private.legal_document_versions
for each row execute function private.guard_legal_document_version();

create or replace function private.reject_published_legal_document_delete()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if old.effective_at is not null then
    raise exception 'published_legal_document_version_cannot_be_deleted';
  end if;
  return old;
end;
$$;

revoke all on function private.reject_published_legal_document_delete() from public, anon, authenticated;

create trigger legal_document_versions_no_published_delete
before delete on private.legal_document_versions
for each row execute function private.reject_published_legal_document_delete();
