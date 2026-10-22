-- Serialize Notion sync per culture across Edge Function instances.
-- The short lease prevents permanent locks after an interrupted request.
create table if not exists public.notion_sync_locks (
  culture_id uuid primary key,
  organization_id uuid not null,
  foreign key (organization_id, culture_id) references public.cultures(organization_id, id) on delete cascade,
  lock_token uuid not null,
  lease_expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.notion_sync_locks enable row level security;
revoke all on public.notion_sync_locks from public, anon, authenticated;
grant select, insert, update, delete on public.notion_sync_locks to service_role;

create or replace function public.claim_notion_sync_lock(
  p_organization_id uuid,
  p_culture_id uuid,
  p_lock_token uuid,
  p_lease_seconds integer default 300
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_claimed boolean;
begin
  if p_lease_seconds is null or p_lease_seconds < 30 or p_lease_seconds > 900 then
    raise exception 'invalid_notion_sync_lease';
  end if;
  if not exists (
    select 1 from public.cultures
    where id = p_culture_id and organization_id = p_organization_id
  ) then
    raise exception 'culture_not_found_for_organization';
  end if;

  insert into public.notion_sync_locks(culture_id, organization_id, lock_token, lease_expires_at)
  values (p_culture_id, p_organization_id, p_lock_token, now() + make_interval(secs => p_lease_seconds))
  on conflict (culture_id) do update
    set organization_id = excluded.organization_id,
        lock_token = excluded.lock_token,
        lease_expires_at = excluded.lease_expires_at,
        created_at = now()
    where public.notion_sync_locks.lease_expires_at <= now()
  returning true into v_claimed;

  return coalesce(v_claimed, false);
end
$function$;

create or replace function public.release_notion_sync_lock(
  p_organization_id uuid,
  p_culture_id uuid,
  p_lock_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_deleted integer;
begin
  delete from public.notion_sync_locks
  where organization_id = p_organization_id
    and culture_id = p_culture_id
    and lock_token = p_lock_token;
  get diagnostics v_deleted = row_count;
  return v_deleted = 1;
end
$function$;

revoke all on function public.claim_notion_sync_lock(uuid, uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.release_notion_sync_lock(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_notion_sync_lock(uuid, uuid, uuid, integer) to service_role;
grant execute on function public.release_notion_sync_lock(uuid, uuid, uuid) to service_role;
