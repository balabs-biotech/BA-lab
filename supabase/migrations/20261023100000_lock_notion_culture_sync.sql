-- Serialize Notion synchronization per culture to prevent concurrent duplicate pages.
-- Locks are short-lived leases: abandoned locks become claimable after expiration.
create schema if not exists private;

create table if not exists private.culture_notion_sync_locks (
  culture_id uuid primary key,
  organization_id uuid not null,
  lock_token uuid not null,
  lease_until timestamptz not null,
  created_at timestamptz not null default now()
);

revoke all on private.culture_notion_sync_locks from public, anon, authenticated;
grant select, insert, update, delete on private.culture_notion_sync_locks to service_role;

create or replace function public.acquire_culture_notion_sync_lock(
  p_culture_id uuid,
  p_organization_id uuid,
  p_lock_token uuid,
  p_lease_seconds integer default 180
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_rows integer;
begin
  if p_lease_seconds < 30 or p_lease_seconds > 600 then
    raise exception 'lease duration must be between 30 and 600 seconds';
  end if;

  if not exists (
    select 1 from public.cultures c
    where c.id = p_culture_id and c.organization_id = p_organization_id
  ) then
    raise exception 'culture not found';
  end if;

  insert into private.culture_notion_sync_locks
    (culture_id, organization_id, lock_token, lease_until, created_at)
  values
    (p_culture_id, p_organization_id, p_lock_token,
     now() + make_interval(secs => p_lease_seconds), now())
  on conflict (culture_id) do update
    set organization_id = excluded.organization_id,
        lock_token = excluded.lock_token,
        lease_until = excluded.lease_until,
        created_at = now()
    where private.culture_notion_sync_locks.lease_until <= now();

  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

create or replace function public.release_culture_notion_sync_lock(
  p_culture_id uuid,
  p_lock_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_rows integer;
begin
  delete from private.culture_notion_sync_locks
  where culture_id = p_culture_id and lock_token = p_lock_token;
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

revoke all on function public.acquire_culture_notion_sync_lock(uuid, uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.release_culture_notion_sync_lock(uuid, uuid) from public, anon, authenticated;
grant execute on function public.acquire_culture_notion_sync_lock(uuid, uuid, uuid, integer) to service_role;
grant execute on function public.release_culture_notion_sync_lock(uuid, uuid) to service_role;
