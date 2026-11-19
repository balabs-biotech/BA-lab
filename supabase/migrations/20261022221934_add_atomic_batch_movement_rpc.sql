-- Atomic batch relocation with an immutable audit event.
-- This migration is intentionally additive; it is not applied to any live database here.

create or replace function public.move_batch_to_location(
  p_batch_id uuid,
  p_location_id uuid,
  p_environment_id uuid default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_batch public.batches%rowtype;
  v_old_location_id uuid;
  v_old_environment_id uuid;
  v_event_id uuid;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select b.* into v_batch
  from public.batches b
  where b.id = p_batch_id
  for update;

  -- Avoid revealing whether a batch exists in another organization.
  if not found or not private.is_org_member(v_batch.organization_id) then
    raise exception 'batch_not_found_or_forbidden' using errcode = '42501';
  end if;

  if v_batch.status in ('released', 'rejected', 'aborted', 'completed') then
    raise exception 'batch_is_closed' using errcode = '23514';
  end if;

  if p_location_id is not null and not exists (
    select 1 from public.locations l
    where l.organization_id = v_batch.organization_id and l.id = p_location_id
  ) then
    raise exception 'location_not_found_or_forbidden' using errcode = '23503';
  end if;

  if p_environment_id is not null and not exists (
    select 1 from public.environments e
    where e.organization_id = v_batch.organization_id
      and e.id = p_environment_id
      and (e.location_id is null or e.location_id is not distinct from p_location_id)
  ) then
    raise exception 'environment_not_found_or_incompatible' using errcode = '23503';
  end if;

  if v_batch.location_id is not distinct from p_location_id
     and v_batch.environment_id is not distinct from p_environment_id then
    raise exception 'batch_location_unchanged';
  end if;

  -- events requires exactly one biological anchor. A batch without culture/material
  -- cannot produce a valid traceability event and must not be moved silently.
  if v_batch.culture_id is null and v_batch.material_id is null then
    raise exception 'batch_requires_culture_or_material_anchor';
  end if;

  v_old_location_id := v_batch.location_id;
  v_old_environment_id := v_batch.environment_id;

  update public.batches
  set location_id = p_location_id,
      environment_id = p_environment_id
  where organization_id = v_batch.organization_id
    and id = v_batch.id;

  if v_batch.culture_id is not null then
    insert into public.events(
      organization_id, event_type, occurred_at, actor_user_id,
      culture_id, batch_id, location_id, environment_id, payload
    )
    values (
      v_batch.organization_id, 'batch_moved', now(), auth.uid(),
      v_batch.culture_id, v_batch.id, p_location_id, p_environment_id,
      jsonb_build_object(
        'old_location_id', v_old_location_id,
        'new_location_id', p_location_id,
        'old_environment_id', v_old_environment_id,
        'new_environment_id', p_environment_id,
        'note', v_note
      )
    )
    returning id into v_event_id;
  else
    insert into public.events(
      organization_id, event_type, occurred_at, actor_user_id,
      material_id, batch_id, location_id, environment_id, payload
    )
    values (
      v_batch.organization_id, 'batch_moved', now(), auth.uid(),
      v_batch.material_id, v_batch.id, p_location_id, p_environment_id,
      jsonb_build_object(
        'old_location_id', v_old_location_id,
        'new_location_id', p_location_id,
        'old_environment_id', v_old_environment_id,
        'new_environment_id', p_environment_id,
        'note', v_note
      )
    )
    returning id into v_event_id;
  end if;

  return jsonb_build_object(
    'batch_id', v_batch.id,
    'event_id', v_event_id,
    'old_location_id', v_old_location_id,
    'new_location_id', p_location_id,
    'old_environment_id', v_old_environment_id,
    'new_environment_id', p_environment_id
  );
end;
$function$;

revoke all on function public.move_batch_to_location(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.move_batch_to_location(uuid, uuid, uuid, text) to authenticated, service_role;
