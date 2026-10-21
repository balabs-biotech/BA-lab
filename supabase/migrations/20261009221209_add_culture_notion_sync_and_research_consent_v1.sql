alter table public.cultures
  add column if not exists notion_page_id text,
  add column if not exists notion_sync_status text not null default 'pending'
    check (notion_sync_status in ('pending','synced','error')),
  add column if not exists notion_synced_at timestamptz,
  add column if not exists notion_sync_error text;

create table if not exists public.culture_data_consents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  terms_version text not null,
  terms_accepted_at timestamptz not null default now(),
  research_statistics_opt_in boolean not null default false,
  research_opt_in_at timestamptz,
  created_at timestamptz not null default now(),
  constraint culture_data_consents_org_user_version_unique unique (organization_id, user_id, terms_version),
  constraint culture_data_consents_optin_timestamp_check check (
    (research_statistics_opt_in = false) or research_opt_in_at is not null
  )
);

alter table public.culture_data_consents enable row level security;

drop policy if exists culture_data_consents_select_own on public.culture_data_consents;
create policy culture_data_consents_select_own on public.culture_data_consents
  for select to authenticated
  using (user_id = auth.uid() and private.is_org_member(organization_id));

drop policy if exists culture_data_consents_insert_own on public.culture_data_consents;
create policy culture_data_consents_insert_own on public.culture_data_consents
  for insert to authenticated
  with check (user_id = auth.uid() and private.is_org_member(organization_id));

drop policy if exists culture_data_consents_update_own on public.culture_data_consents;
create policy culture_data_consents_update_own on public.culture_data_consents
  for update to authenticated
  using (user_id = auth.uid() and private.is_org_member(organization_id))
  with check (user_id = auth.uid() and private.is_org_member(organization_id));

grant select, insert, update on public.culture_data_consents to authenticated;
