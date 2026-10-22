-- Server-side serialization for Notion culture sync.
-- This migration is versioned only; it is NOT applied to any hosted database by this change.
create schema if not exists private;

create table if not exists private.notion_sync_claims (
  culture_id uuid primary key,
  organization_id uuid not null,
  claim_token uuid not null,
  expires_at timestamptz not null,
  foreign key (organization_id, culture_id)
    references public.cultures (organization_id, id) on delete cascade
);

alter table private.notion_sync_claims enable row level security;
revoke all on table private.notion_sync_claims from public, anon, authenticated;
grant all on table private.notion_sync_claims to service_role;

create or replace function public.claim_notion_sync(
  p_organization_id uuid,
  p_culture_id uuid,
  p_claim_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_claimed boolean := false;
begin
  if not exists (
    select 1 from public.cultures c
    where c.organization_id = p_organization_id and c.id = p_culture_id
  ) then
    raise exception 'Culture does not belong to the supplied organization'
      using errcode = '23503';
  end if;

  insert into private.notion_sync_claims (culture_id, organization_id, claim_token, expires_at)
  values (p_culture_id, p_organization_id, p_claim_token, clock_timestamp() + interval '3 minutes')
  on conflict (culture_id) do update
    set organization_id = excluded.organization_id,
        claim_token = excluded.claim_token,
        expires_at = excluded.expires_at
    where private.notion_sync_claims.expires_at <= clock_timestamp()
  returning true into v_claimed;

  return coalesce(v_claimed, false);
end;
$$;

create or replace function public.release_notion_sync_claim(
  p_organization_id uuid,
  p_culture_id uuid,
  p_claim_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_released boolean := false;
begin
  delete from private.notion_sync_claims
  where organization_id = p_organization_id
    and culture_id = p_culture_id
    and claim_token = p_claim_token
  returning true into v_released;
  return coalesce(v_released, false);
end;
$$;

revoke all on function public.claim_notion_sync(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.release_notion_sync_claim(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_notion_sync(uuid, uuid, uuid) to service_role;
grant execute on function public.release_notion_sync_claim(uuid, uuid, uuid) to service_role;

comment on table private.notion_sync_claims is
  'Short-lived per-culture claim to serialize Notion sync requests; service-role functions only.';
