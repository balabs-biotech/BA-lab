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




-- Supabase Before User Created Auth Hook.
-- Configure this function as the project's before-user-created hook in Auth.
-- It validates the document versions before Auth inserts the user. The
-- AFTER INSERT trigger below remains the transactional persistence safeguard.
create or replace function public.hook_validate_signup_legal_versions(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private
as $
declare
  terms_version text;
  privacy_version text;
  current_at timestamptz := statement_timestamp();
  terms_is_current boolean;
  privacy_is_current boolean;
begin
  terms_version := event -> 'user' -> 'user_metadata' ->> 'legal_terms_version';
  privacy_version := event -> 'user' -> 'user_metadata' ->> 'legal_privacy_version';

  if terms_version is null or length(btrim(terms_version)) = 0
     or privacy_version is null or length(btrim(privacy_version)) = 0 then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 400,
      'message', 'Current terms and privacy notice versions are required.'
    ));
  end if;

  select exists (
    select 1 from private.legal_document_versions
    where document_type = 'terms' and version = terms_version
      and effective_at is not null and effective_at <= current_at
      and (retired_at is null or retired_at > current_at)
  ) into terms_is_current;

  select exists (
    select 1 from private.legal_document_versions
    where document_type = 'privacy_notice' and version = privacy_version
      and effective_at is not null and effective_at <= current_at
      and (retired_at is null or retired_at > current_at)
  ) into privacy_is_current;

  if not terms_is_current or not privacy_is_current then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 400,
      'message', 'The legal documents have changed. Reload the current documents and try again.'
    ));
  end if;

  return '{}'::jsonb;
end;
$;

revoke all on function public.hook_validate_signup_legal_versions(jsonb)
  from public, anon, authenticated;
grant execute on function public.hook_validate_signup_legal_versions(jsonb)
  to supabase_auth_admin;

-- Pre-session signup capture. Auth creates the user even when email confirmation
-- is required and no client session is returned. The trigger snapshots the
-- submitted version identifiers into the immutable ledger in the same DB
-- transaction as auth.users insertion.
create or replace function private.capture_signup_legal_acts()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  terms_version_id uuid;
  privacy_version_id uuid;
  terms_version text;
  privacy_version text;
  captured_at timestamptz := statement_timestamp();
begin
  terms_version := new.raw_user_meta_data ->> 'legal_terms_version';
  privacy_version := new.raw_user_meta_data ->> 'legal_privacy_version';

  if terms_version is null or length(btrim(terms_version)) = 0
     or privacy_version is null or length(btrim(privacy_version)) = 0 then
    raise exception 'signup_legal_document_versions_required';
  end if;

  select id into terms_version_id
  from private.legal_document_versions
  where document_type = 'terms'
    and version = terms_version
    and effective_at is not null
    and effective_at <= captured_at
    and (retired_at is null or retired_at > captured_at);

  if terms_version_id is null then
    raise exception 'signup_terms_version_not_current';
  end if;

  select id into privacy_version_id
  from private.legal_document_versions
  where document_type = 'privacy_notice'
    and version = privacy_version
    and effective_at is not null
    and effective_at <= captured_at
    and (retired_at is null or retired_at > captured_at);

  if privacy_version_id is null then
    raise exception 'signup_privacy_version_not_current';
  end if;

  insert into private.legal_consent_events (
    organization_id, subject_user_id, actor_user_id, document_version_id,
    action, purpose, occurred_at, capture_channel
  ) values (
    null, new.id, new.id, terms_version_id,
    'accepted', 'terms_acceptance', captured_at, 'signup'
  );

  insert into private.legal_consent_events (
    organization_id, subject_user_id, actor_user_id, document_version_id,
    action, purpose, occurred_at, capture_channel
  ) values (
    null, new.id, new.id, privacy_version_id,
    'acknowledged', 'privacy_notice_acknowledgement', captured_at, 'signup'
  );

  return new;
end;
$$;

revoke all on function private.capture_signup_legal_acts() from public, anon, authenticated;

create trigger auth_user_signup_legal_acts
after insert on auth.users
for each row execute function private.capture_signup_legal_acts();


-- Platform-level administrators are distinct from organization owners/admins.
-- No client role receives access. Initial provisioning is performed out-of-band
-- by the database owner after identity verification; no self-service grant path.
create table private.platform_administrators (
  user_id uuid primary key references auth.users(id) on delete restrict,
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users(id) on delete set null,
  reason text not null check (length(btrim(reason)) > 0)
);

alter table private.platform_administrators enable row level security;
revoke all on private.platform_administrators from public, anon, authenticated, service_role;

-- Narrow server-only authorization check. The Edge Function first validates
-- the caller's JWT with Auth, then asks this function about that verified UUID.
create or replace function public.is_platform_administrator(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private
as $$
  select exists (
    select 1 from private.platform_administrators pa
    where pa.user_id = p_user_id
  );
$$;

revoke all on function public.is_platform_administrator(uuid) from public, anon, authenticated;
grant execute on function public.is_platform_administrator(uuid) to service_role;

create or replace function public.list_legal_document_versions()
returns table (
  id uuid,
  document_type text,
  version text,
  content_sha256 text,
  document_path text,
  effective_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, private
as $$
  select d.id, d.document_type, d.version, d.content_sha256, d.document_path,
         d.effective_at, d.retired_at, d.created_at
  from private.legal_document_versions d
  order by d.document_type, d.effective_at desc nulls last, d.created_at desc;
$$;

revoke all on function public.list_legal_document_versions() from public, anon, authenticated;
grant execute on function public.list_legal_document_versions() to service_role;

create or replace function public.publish_legal_document_version(
  p_document_type text,
  p_version text,
  p_content_sha256 text,
  p_document_path text,
  p_effective_at timestamptz,
  p_created_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  new_id uuid;
begin
  if p_document_type is null
     or p_document_type not in ('terms','privacy_notice','cookies_notice','research_consent')
     or p_version is null or length(btrim(p_version)) = 0
     or p_content_sha256 is null
     or p_content_sha256 !~ '^[0-9a-f]{64}
     or p_document_path is null or length(btrim(p_document_path)) = 0
     or p_effective_at is null or p_effective_at < statement_timestamp()
     or p_created_by is null then
    raise exception 'invalid_legal_document_publication_payload';
  end if;

  perform pg_advisory_xact_lock(hashtext('ba_labs_legal_doc:' || p_document_type));

  if exists (
    select 1 from private.legal_document_versions d
    where d.document_type = p_document_type
      and d.effective_at is not null
      and (d.retired_at is null or d.retired_at > p_effective_at)
      and d.effective_at >= p_effective_at
  ) then
    raise exception 'legal_document_future_version_conflict';
  end if;

  update private.legal_document_versions d
  set retired_at = p_effective_at
  where d.document_type = p_document_type
    and d.effective_at is not null
    and d.effective_at < p_effective_at
    and d.retired_at is null;

  insert into private.legal_document_versions (
    document_type, version, content_sha256, document_path,
    effective_at, created_by
  ) values (
    p_document_type, p_version, p_content_sha256, p_document_path,
    p_effective_at, p_created_by
  ) returning id into new_id;

  return new_id;
end;
$$;

revoke all on function public.publish_legal_document_version(text,text,text,text,timestamptz,uuid)
  from public, anon, authenticated;
grant execute on function public.publish_legal_document_version(text,text,text,text,timestamptz,uuid)
  to service_role;

create or replace function public.retire_legal_document_version(
  p_document_version_id uuid,
  p_retired_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  changed integer;
  target_document_type text;
  has_successor boolean;
begin
  if p_document_version_id is null or p_retired_at is null
     or p_retired_at < statement_timestamp() then
    raise exception 'invalid_legal_document_retirement_payload';
  end if;

  select document_type into target_document_type
  from private.legal_document_versions
  where id = p_document_version_id
    and effective_at is not null
    and retired_at is null
    and p_retired_at >= effective_at
  for update;

  if target_document_type is null then
    raise exception 'legal_document_version_not_retirable';
  end if;

  if target_document_type in ('terms','privacy_notice') then
    select exists (
      select 1 from private.legal_document_versions successor
      where successor.document_type = target_document_type
        and successor.id <> p_document_version_id
        and successor.effective_at is not null
        and successor.effective_at <= p_retired_at
        and (successor.retired_at is null or successor.retired_at > p_retired_at)
    ) into has_successor;

    if not has_successor then
      raise exception 'legal_document_successor_required';
    end if;
  end if;

  update private.legal_document_versions
  set retired_at = p_retired_at
  where id = p_document_version_id
    and retired_at is null;

  get diagnostics changed = row_count;
  if changed = 0 then
    raise exception 'legal_document_version_not_retirable';
  end if;
  return true;
end;
$$;

revoke all on function public.retire_legal_document_version(uuid,timestamptz)
  from public, anon, authenticated;
grant execute on function public.retire_legal_document_version(uuid,timestamptz)
  to service_role;

     or p_document_path is null or length(btrim(p_document_path)) = 0
     or p_effective_at is null or p_effective_at < statement_timestamp()
     or p_created_by is null then
    raise exception 'invalid_legal_document_publication_payload';
  end if;

  perform pg_advisory_xact_lock(hashtext('ba_labs_legal_doc:' || p_document_type));

  if exists (
    select 1 from private.legal_document_versions d
    where d.document_type = p_document_type
      and d.effective_at is not null
      and (d.retired_at is null or d.retired_at > p_effective_at)
      and d.effective_at >= p_effective_at
  ) then
    raise exception 'legal_document_future_version_conflict';
  end if;

  update private.legal_document_versions d
  set retired_at = p_effective_at
  where d.document_type = p_document_type
    and d.effective_at is not null
    and d.effective_at < p_effective_at
    and d.retired_at is null;

  insert into private.legal_document_versions (
    document_type, version, content_sha256, document_path,
    effective_at, created_by
  ) values (
    p_document_type, p_version, p_content_sha256, p_document_path,
    p_effective_at, p_created_by
  ) returning id into new_id;

  return new_id;
end;
$$;

revoke all on function public.publish_legal_document_version(text,text,text,text,timestamptz,uuid)
  from public, anon, authenticated;
grant execute on function public.publish_legal_document_version(text,text,text,text,timestamptz,uuid)
  to service_role;

create or replace function public.retire_legal_document_version(
  p_document_version_id uuid,
  p_retired_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  changed integer;
begin
  if p_document_version_id is null or p_retired_at is null
     or p_retired_at < statement_timestamp() then
    raise exception 'invalid_legal_document_retirement_payload';
  end if;

  update private.legal_document_versions
  set retired_at = p_retired_at
  where id = p_document_version_id
    and effective_at is not null
    and retired_at is null
    and p_retired_at >= effective_at;

  get diagnostics changed = row_count;
  if changed = 0 then
    raise exception 'legal_document_version_not_retirable';
  end if;
  return true;
end;
$$;

revoke all on function public.retire_legal_document_version(uuid,timestamptz)
  from public, anon, authenticated;
grant execute on function public.retire_legal_document_version(uuid,timestamptz)
  to service_role;
