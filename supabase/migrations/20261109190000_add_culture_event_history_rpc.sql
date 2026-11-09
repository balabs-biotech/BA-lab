-- Tenant-scoped, paginated event history for a biological culture.
-- The creation operation is linked through descendant_created.payload.operation_event_id.
create index if not exists events_org_culture_time_idx
  on public.events(organization_id, culture_id, occurred_at desc, id desc)
  where culture_id is not null;

create index if not exists events_org_material_time_idx
  on public.events(organization_id, material_id, occurred_at desc, id desc)
  where material_id is not null;

drop function if exists public.get_culture_event_history(uuid, uuid, integer, integer);
create function public.get_culture_event_history(
  p_organization_id uuid,
  p_culture_id uuid,
  p_limit integer default 100,
  p_offset integer default 0
)
returns table (
  event_id uuid,
  event_type text,
  occurred_at timestamptz,
  actor_user_id uuid,
  culture_id uuid,
  material_id uuid,
  batch_id uuid,
  source_relation text,
  payload jsonb,
  total_rows bigint,
  has_more boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 500));
  v_offset integer := greatest(0, least(coalesce(p_offset, 0), 1000000));
begin
  if auth.uid() is null or not private.is_org_member(p_organization_id) then
    raise exception 'organization_access_denied' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.cultures c
     where c.organization_id = p_organization_id
       and c.id = p_culture_id
  ) then
    raise exception 'culture_not_found' using errcode = 'P0002';
  end if;

  return query
  with target as (
    select c.id, c.material_id
      from public.cultures c
     where c.organization_id = p_organization_id
       and c.id = p_culture_id
  ),
  candidates as (
    select e.id, e.event_type, e.occurred_at, e.actor_user_id,
           e.culture_id, e.material_id, e.batch_id, 'culture'::text as source_relation,
           e.payload, 1 as priority
      from target t
      join public.events e
        on e.organization_id = p_organization_id
       and e.culture_id = t.id
    union all
    select e.id, e.event_type, e.occurred_at, e.actor_user_id,
           e.culture_id, e.material_id, e.batch_id, 'material'::text,
           e.payload, 2
      from target t
      join public.events e
        on e.organization_id = p_organization_id
       and e.material_id = t.material_id
    union all
    select operation.id, operation.event_type, operation.occurred_at,
           operation.actor_user_id, operation.culture_id, operation.material_id,
           operation.batch_id, 'creation_operation'::text, operation.payload, 3
      from target t
      join public.events child_event
        on child_event.organization_id = p_organization_id
       and child_event.culture_id = t.id
       and child_event.event_type = 'descendant_created'
      join public.events operation
        on operation.organization_id = p_organization_id
       and operation.id::text = child_event.payload ->> 'operation_event_id'
    union all
    select e.id, e.event_type, e.occurred_at, e.actor_user_id,
           e.culture_id, e.material_id, e.batch_id, 'batch'::text,
           e.payload, 4
      from public.batches b
      join public.events e
        on e.organization_id = p_organization_id
       and e.batch_id = b.id
     where b.organization_id = p_organization_id
       and b.culture_id = p_culture_id
  ),
  unique_events as (
    select distinct on (c.id)
           c.id, c.event_type, c.occurred_at, c.actor_user_id,
           c.culture_id, c.material_id, c.batch_id, c.source_relation, c.payload
      from candidates c
     order by c.id, c.priority
  ),
  ranked as (
    select u.*,
           row_number() over (order by u.occurred_at desc, u.id desc) as row_no
      from unique_events u
  ),
  stats as (
    select count(*)::bigint as total_rows from unique_events
  )
  select r.id, r.event_type, r.occurred_at, r.actor_user_id,
         r.culture_id, r.material_id, r.batch_id, r.source_relation, r.payload,
         stats.total_rows, stats.total_rows > (v_offset + v_limit)
    from ranked r
    cross join stats
   where r.row_no > v_offset
     and r.row_no <= (v_offset + v_limit)
   order by r.occurred_at desc, r.id desc;
end;
$function$;

revoke all on function public.get_culture_event_history(uuid, uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.get_culture_event_history(uuid, uuid, integer, integer)
  to authenticated;
