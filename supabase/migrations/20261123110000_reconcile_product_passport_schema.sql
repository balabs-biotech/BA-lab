-- Canonical, reproducible reconstruction of the BA Labs product-passport schema.
-- Reconstructed from the active database catalog on 2026-11-23.
-- Safe on the existing project: CREATE IF NOT EXISTS preserves current tables and data.
-- Direct client access is intentionally denied; privileged operations go through Edge Functions.

create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9][A-Z0-9_-]{1,31}$'),
  name_fr text not null check (length(btrim(name_fr)) between 1 and 120),
  name_en text, name_pt text, name_ar text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.product_categories(id) on delete restrict,
  code text not null unique check (code ~ '^[A-Z0-9][A-Z0-9._-]{1,47}$'),
  name_fr text not null check (length(btrim(name_fr)) between 1 and 160),
  name_en text, name_pt text, name_ar text,
  internal_description text,
  public_description_fr text check (public_description_fr is null or length(public_description_fr) <= 1500),
  public_usage_fr text check (public_usage_fr is null or length(public_usage_fr) <= 2500),
  lifecycle_status text not null default 'active' check (lifecycle_status in ('active','paused','discontinued')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lots (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  lot_code text not null unique check (length(btrim(lot_code)) between 2 and 80),
  status text not null default 'draft' check (status in ('draft','in_production','awaiting_checks','investigation','released','under_surveillance','withdrawn','archived')),
  manufactured_on date, expires_on date,
  quantity numeric check (quantity is null or quantity >= 0),
  quantity_unit text,
  internal_notes text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((quantity is null) = (quantity_unit is null)),
  check (expires_on is null or manufactured_on is null or expires_on >= manufactured_on)
);

create table if not exists public.passports (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null unique references public.lots(id) on delete restrict,
  qr_token_hash text not null unique check (qr_token_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'draft' check (status in ('draft','published','revoked')),
  current_version integer not null default 0 check (current_version >= 0),
  published_by uuid references auth.users(id) on delete restrict,
  published_at timestamptz,
  revoked_by uuid references auth.users(id) on delete restrict,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((published_by is null) = (published_at is null)),
  check ((revoked_by is null) = (revoked_at is null)),
  check (status <> 'published' or (current_version > 0 and published_at is not null)),
  check (status <> 'revoked' or revoked_at is not null)
);

create table if not exists public.passport_versions (
  id uuid primary key default gen_random_uuid(),
  passport_id uuid not null references public.passports(id) on delete restrict,
  version integer not null check (version > 0),
  snapshot jsonb not null check (
    jsonb_typeof(snapshot) = 'object'
    and (snapshot - array['schema_version','passport_code','product','lot','quality','status','published_at','alerts','documents']) = '{}'::jsonb
  ),
  published_by uuid not null references auth.users(id) on delete restrict,
  published_at timestamptz not null default now(),
  unique (passport_id, version)
);

create table if not exists public.quality_checks (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.lots(id) on delete restrict,
  check_type text not null check (length(btrim(check_type)) between 2 and 80),
  result text not null check (result in ('pending','pass','fail','inconclusive')),
  internal_notes text,
  checked_by uuid not null references auth.users(id) on delete restrict,
  checked_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete restrict,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check ((reviewed_by is null) = (reviewed_at is null))
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid references public.lots(id) on delete restrict,
  product_id uuid references public.products(id) on delete restrict,
  title text not null default 'Document' check (length(btrim(title)) between 1 and 160),
  description text check (description is null or length(description) <= 1200),
  original_filename text not null check (length(btrim(original_filename)) between 1 and 255),
  mime_type text not null,
  byte_size bigint not null check (byte_size between 1 and 52428800),
  storage_path text not null unique check (storage_path !~ '(^/|\\.\\.|\\\\)'),
  classification text not null default 'internal' check (classification in ('internal','quality','public')),
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  published_by uuid references auth.users(id) on delete restrict,
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  check (num_nonnulls(lot_id, product_id) = 1),
  check ((published_by is null) = (published_at is null)),
  check (classification <> 'public' or published_at is not null)
);

create table if not exists public.incidents (
  id uuid primary key default gen_random_uuid(),
  scope_type text not null check (scope_type in ('lot','product','family')),
  lot_id uuid references public.lots(id) on delete restrict,
  product_id uuid references public.products(id) on delete restrict,
  category_id uuid references public.product_categories(id) on delete restrict,
  title text not null check (length(btrim(title)) between 2 and 160),
  internal_description text,
  severity text not null check (severity in ('low','medium','high','critical')),
  status text not null default 'open' check (status in ('open','investigating','corrective_action','resolved','closed')),
  root_cause text,
  corrective_actions text,
  created_by uuid not null references auth.users(id) on delete restrict,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((scope_type='lot' and lot_id is not null and product_id is null and category_id is null)
      or (scope_type='product' and lot_id is null and product_id is not null and category_id is null)
      or (scope_type='family' and lot_id is null and product_id is null and category_id is not null))
);

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id) on delete restrict,
  scope_type text not null check (scope_type in ('lot','product','family')),
  lot_id uuid references public.lots(id) on delete restrict,
  product_id uuid references public.products(id) on delete restrict,
  category_id uuid references public.product_categories(id) on delete restrict,
  public_title text not null check (length(btrim(public_title)) between 2 and 160),
  public_summary text not null check (length(btrim(public_summary)) between 2 and 1200),
  status text not null default 'draft' check (status in ('draft','approved','published','suspended','withdrawn')),
  prepared_by uuid not null references auth.users(id) on delete restrict,
  approved_by uuid references auth.users(id) on delete restrict,
  approved_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((scope_type='lot' and lot_id is not null and product_id is null and category_id is null)
      or (scope_type='product' and lot_id is null and product_id is not null and category_id is null)
      or (scope_type='family' and lot_id is null and product_id is null and category_id is not null)),
  check ((approved_by is null) = (approved_at is null)),
  check (status not in ('approved','published') or approved_at is not null)
);

create table if not exists public.lot_events (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.lots(id) on delete restrict,
  event_type text not null check (event_type in ('created','production_started','production_updated','transfer','sampling','packaging','storage','status_changed','note')),
  occurred_at timestamptz not null default now(),
  actor_id uuid not null references auth.users(id) on delete restrict,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details)='object'),
  created_at timestamptz not null default now()
);

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  role text not null check (role in ('operator','quality','approver','administrator','principal_admin')),
  assigned_by uuid not null references auth.users(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  revoked_at timestamptz,
  check (revoked_at is null or revoked_at >= assigned_at)
);

create index if not exists products_category_id_idx on public.products(category_id);
create index if not exists products_created_by_idx on public.products(created_by);
create index if not exists lots_product_idx on public.lots(product_id);
create index if not exists lots_created_by_idx on public.lots(created_by);
create index if not exists lots_status_idx on public.lots(status);
create index if not exists passports_status_idx on public.passports(status);
create index if not exists passports_published_by_idx on public.passports(published_by);
create index if not exists passports_revoked_by_idx on public.passports(revoked_by);
create index if not exists passport_versions_latest_idx on public.passport_versions(passport_id,version desc);
create index if not exists passport_versions_published_by_idx on public.passport_versions(published_by);
create index if not exists quality_checks_lot_time_idx on public.quality_checks(lot_id,checked_at desc);
create index if not exists quality_checks_checked_by_idx on public.quality_checks(checked_by);
create index if not exists quality_checks_reviewed_by_idx on public.quality_checks(reviewed_by);
create index if not exists documents_lot_idx on public.documents(lot_id) where lot_id is not null;
create index if not exists documents_product_idx on public.documents(product_id) where product_id is not null;
create index if not exists documents_uploaded_by_idx on public.documents(uploaded_by);
create index if not exists documents_published_by_idx on public.documents(published_by);
create index if not exists incidents_created_by_idx on public.incidents(created_by);
create index if not exists incidents_lot_status_idx on public.incidents(lot_id,status) where lot_id is not null;
create index if not exists incidents_product_status_idx on public.incidents(product_id,status) where product_id is not null;
create index if not exists incidents_category_status_idx on public.incidents(category_id,status) where category_id is not null;
create index if not exists alerts_incident_id_idx on public.alerts(incident_id);
create index if not exists alerts_prepared_by_idx on public.alerts(prepared_by);
create index if not exists alerts_approved_by_idx on public.alerts(approved_by);
create index if not exists alerts_lot_status_idx on public.alerts(lot_id,status) where lot_id is not null;
create index if not exists alerts_product_status_idx on public.alerts(product_id,status) where product_id is not null;
create index if not exists alerts_category_status_idx on public.alerts(category_id,status) where category_id is not null;
create index if not exists lot_events_lot_time_idx on public.lot_events(lot_id,occurred_at desc);
create index if not exists lot_events_actor_id_idx on public.lot_events(actor_id);
create unique index if not exists user_roles_one_active_assignment on public.user_roles(user_id,role) where revoked_at is null;
create index if not exists user_roles_user_active_idx on public.user_roles(user_id) where revoked_at is null;
create index if not exists user_roles_assigned_by_idx on public.user_roles(assigned_by);

create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin new.updated_at := now(); return new; end; $$;

create or replace function public.reject_immutable_row_change() returns trigger
language plpgsql set search_path = pg_catalog as $$
begin raise exception 'This record is append-only and cannot be changed' using errcode='55000'; end; $$;

create or replace function public.enforce_lot_quality_release() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin
  if new.status='released' and old.status is distinct from 'released' then
    if not exists(select 1 from public.quality_checks q where q.lot_id=new.id and q.result='pass' and q.reviewed_by is not null and q.reviewed_at is not null) then
      raise exception 'A lot needs at least one reviewed passing quality check before release' using errcode='23514';
    end if;
    if exists(select 1 from public.quality_checks q where q.lot_id=new.id and (q.result in ('fail','pending','inconclusive') or q.reviewed_by is null)) then
      raise exception 'A lot cannot be released while quality checks are failed, pending, inconclusive or unreviewed' using errcode='23514';
    end if;
  end if;
  return new;
end; $$;

create or replace function public.prevent_quality_check_change_after_release() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
declare target_lot_id uuid; target_status text;
begin
  target_lot_id := case when tg_op='DELETE' then old.lot_id else new.lot_id end;
  select status into target_status from public.lots where id=target_lot_id;
  if target_status='released' then raise exception 'Move the lot to under_surveillance before recording or changing further quality checks' using errcode='23514'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end; $$;

create or replace function public.enforce_passport_publication() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
declare current_version integer; lot_status text;
begin
  select p.current_version,l.status into current_version,lot_status
  from public.passports p join public.lots l on l.id=p.lot_id where p.id=new.passport_id for update of p;
  if not found then raise exception 'Passport not found' using errcode='23503'; end if;
  if lot_status <> 'released' then raise exception 'A lot must be quality-released before passport publication' using errcode='23514'; end if;
  if new.version <> current_version+1 then raise exception 'Passport version must be the next sequential version' using errcode='23514'; end if;
  update public.passports set current_version=new.version,status='published',published_by=new.published_by,published_at=new.published_at,revoked_by=null,revoked_at=null where id=new.passport_id;
  return new;
end; $$;

create or replace function public.prevent_incident_scope_change_after_alert() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin
  if (new.scope_type,new.lot_id,new.product_id,new.category_id) is distinct from (old.scope_type,old.lot_id,old.product_id,old.category_id)
     and exists(select 1 from public.alerts a where a.incident_id=old.id) then
    raise exception 'Incident scope cannot change after an alert has been created' using errcode='23514';
  end if;
  return new;
end; $$;

create or replace function public.enforce_alert_scope_matches_incident() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
declare v_scope text; v_lot uuid; v_product uuid; v_category uuid;
begin
  select i.scope_type,i.lot_id,i.product_id,i.category_id into v_scope,v_lot,v_product,v_category from public.incidents i where i.id=new.incident_id;
  if not found then raise exception 'Incident not found' using errcode='23503'; end if;
  if new.scope_type is distinct from v_scope or new.lot_id is distinct from v_lot or new.product_id is distinct from v_product or new.category_id is distinct from v_category then
    raise exception 'Alert scope must exactly match its source incident scope' using errcode='23514';
  end if;
  if new.status='published' and new.published_at is null then raise exception 'A published alert requires a publication timestamp' using errcode='23514'; end if;
  return new;
end; $$;

drop trigger if exists product_categories_set_updated_at on public.product_categories;
create trigger product_categories_set_updated_at before update on public.product_categories for each row execute function public.set_updated_at();
drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at before update on public.products for each row execute function public.set_updated_at();
drop trigger if exists lots_set_updated_at on public.lots;
create trigger lots_set_updated_at before update on public.lots for each row execute function public.set_updated_at();
drop trigger if exists lots_quality_release_guard on public.lots;
create trigger lots_quality_release_guard before update on public.lots for each row execute function public.enforce_lot_quality_release();
drop trigger if exists passports_set_updated_at on public.passports;
create trigger passports_set_updated_at before update on public.passports for each row execute function public.set_updated_at();
drop trigger if exists passport_version_publication_guard on public.passport_versions;
create trigger passport_version_publication_guard before insert on public.passport_versions for each row execute function public.enforce_passport_publication();
drop trigger if exists passport_versions_immutable on public.passport_versions;
create trigger passport_versions_immutable before update or delete on public.passport_versions for each row execute function public.reject_immutable_row_change();
drop trigger if exists quality_checks_released_lot_guard on public.quality_checks;
create trigger quality_checks_released_lot_guard before insert or update or delete on public.quality_checks for each row execute function public.prevent_quality_check_change_after_release();
drop trigger if exists documents_set_updated_at on public.documents;
create trigger documents_set_updated_at before update on public.documents for each row execute function public.set_updated_at();
drop trigger if exists incidents_scope_immutable_after_alert on public.incidents;
create trigger incidents_scope_immutable_after_alert before update on public.incidents for each row execute function public.prevent_incident_scope_change_after_alert();
drop trigger if exists incidents_set_updated_at on public.incidents;
create trigger incidents_set_updated_at before update on public.incidents for each row execute function public.set_updated_at();
drop trigger if exists alerts_scope_guard on public.alerts;
create trigger alerts_scope_guard before insert or update on public.alerts for each row execute function public.enforce_alert_scope_matches_incident();
drop trigger if exists alerts_set_updated_at on public.alerts;
create trigger alerts_set_updated_at before update on public.alerts for each row execute function public.set_updated_at();

-- No browser-facing policies are created for these tables. RLS + explicit revokes
-- keep operational data inaccessible to anon/authenticated; Edge Functions use service_role.
do $$
declare t text;
begin
  foreach t in array array['product_categories','products','lots','passports','passport_versions','quality_checks','documents','incidents','alerts','lot_events','user_roles'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on table public.%I from anon, authenticated',t);
    execute format('grant all on table public.%I to service_role',t);
  end loop;
end $$;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('ba-labs-documents','ba-labs-documents',false,4194304,array['application/pdf'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
