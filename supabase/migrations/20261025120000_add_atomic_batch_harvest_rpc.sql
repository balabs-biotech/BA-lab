-- Record harvest events through a server-validated atomic RPC.
-- Keep harvest out of arbitrary client writes and bind the audit actor to auth.uid().
alter table public.batches
  drop constraint if exists batches_stage_check;

alter table public.batches
  add constraint batches_stage_check
  check (current_stage is null or current_stage in (
    'preparation','sterilization','inoculation','incubation',
    'cultivation','harvest','formulation','packaging','qc','release'
  ));

create or replace function public.record_batch_harvest(
  p_batch_id uuid,
  p_quantity numeric,
  p_unit_code text,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_batch public.batches%rowtype;
  v_event_id uuid;
  v_unit_code text := nullif(btrim(coalesce(p_unit_code, '')), '');
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_anchor_culture_id uuid;
  v_anchor_material_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  if p_batch_id is null or p_quantity is null or p_quantity <= 0 or v_unit_code is null then
    raise exception 'invalid_harvest_payload' using errcode = '22023';
  end if;

  select b.* into v_batch
    from public.batches b
   where b.id = p_batch_id
   for update;

  if not found or not private.is_org_member(v_batch.organization_id) then
    raise exception 'batch_not_found_or_forbidden' using errcode = '42501';
  end if;

  if v_batch.current_stage is distinct from 'harvest'
     or v_batch.status in ('released','rejected','aborted','completed') then
    raise exception 'harvest_stage_required_for_open_batch' using errcode = '23514';
  end if;

  if not exists (select 1 from public.units u where u.code = v_unit_code) then
    raise exception 'unknown_unit_code' using errcode = '22023';
  end if;

  if v_batch.culture_id is null and v_batch.material_id is null then
    raise exception 'biological_traceability_anchor_required' using errcode = '23514';
  end if;

  v_anchor_culture_id := v_batch.culture_id;
  v_anchor_material_id := case when v_batch.culture_id is null then v_batch.material_id else null end;

  insert into public.events (
    organization_id, event_type, occurred_at, actor_user_id,
    culture_id, material_id, batch_id, location_id, environment_id, payload
  ) values (
    v_batch.organization_id, 'harvest_recorded', now(), auth.uid(),
    v_anchor_culture_id, v_anchor_material_id, v_batch.id,
    v_batch.location_id, v_batch.environment_id,
    jsonb_build_object(
      'quantity', p_quantity,
      'unit_code', v_unit_code,
      'note', v_note,
      'source', 'batch-tracker-harvest-entry',
      'schema_version', 1
    )
  ) returning id into v_event_id;

  return v_event_id;
end;
$function$;

revoke all on function public.record_batch_harvest(uuid, numeric, text, text) from public, anon;
grant execute on function public.record_batch_harvest(uuid, numeric, text, text) to authenticated;
