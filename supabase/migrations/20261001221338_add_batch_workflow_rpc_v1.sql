
create or replace function public.create_batch_with_stages(
  p_organization_id uuid,
  p_batch_code text,
  p_name text,
  p_batch_type text,
  p_protocol_version_id uuid default null,
  p_material_id uuid default null,
  p_culture_id uuid default null,
  p_location_id uuid default null,
  p_environment_id uuid default null,
  p_planned_at timestamptz default null,
  p_quantity_planned numeric default null,
  p_quantity_unit_code text default null,
  p_stages text[] default array['preparation','sterilization','inoculation','incubation','cultivation','harvest','formulation','packaging','qc','release']
)
returns public.batches
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_batch public.batches;
  v_stage text;
  v_seq integer := 0;
begin
  if not private.is_org_member(p_organization_id) then
    raise exception 'not authorized for organization';
  end if;

  if coalesce(array_length(p_stages,1),0) = 0 then
    raise exception 'at least one stage is required';
  end if;

  insert into public.batches(
    organization_id,batch_code,name,batch_type,protocol_version_id,
    material_id,culture_id,location_id,environment_id,planned_at,
    quantity_planned,quantity_unit_code,current_stage,status
  )
  values (
    p_organization_id,p_batch_code,p_name,p_batch_type,p_protocol_version_id,
    p_material_id,p_culture_id,p_location_id,p_environment_id,p_planned_at,
    p_quantity_planned,p_quantity_unit_code,p_stages[1],'planned'
  )
  returning * into v_batch;

  foreach v_stage in array p_stages loop
    v_seq := v_seq + 1;
    insert into public.batch_stages(
      organization_id,batch_id,stage_code,sequence_no,status
    )
    values (
      p_organization_id,v_batch.id,v_stage,v_seq,'pending'
    );
  end loop;

  insert into public.events(
    organization_id,event_type,occurred_at,batch_id,payload
  )
  values (
    p_organization_id,'batch_created',now(),v_batch.id,
    jsonb_build_object('batch_code',p_batch_code,'batch_type',p_batch_type)
  );

  return v_batch;
end;
$$;

create or replace function public.advance_batch_stage(
  p_batch_id uuid,
  p_expected_stage text
)
returns table(
  batch_id uuid,
  status text,
  current_stage text,
  completed_stage text,
  next_stage text
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_batch public.batches;
  v_current public.batch_stages;
  v_next public.batch_stages;
begin
  select b.* into v_batch
  from public.batches b
  where b.id = p_batch_id
  for update;

  if not found then
    raise exception 'batch not found';
  end if;

  if not private.is_org_member(v_batch.organization_id) then
    raise exception 'not authorized for organization';
  end if;

  if v_batch.current_stage is distinct from p_expected_stage then
    raise exception 'stage conflict: expected %, actual %', p_expected_stage, v_batch.current_stage;
  end if;

  select bs.* into v_current
  from public.batch_stages bs
  where bs.organization_id = v_batch.organization_id
    and bs.batch_id = v_batch.id
    and bs.stage_code = v_batch.current_stage
  order by bs.sequence_no
  limit 1
  for update;

  if not found then
    raise exception 'current stage row not found';
  end if;

  update public.batch_stages
  set status='completed', completed_at=coalesce(completed_at,now())
  where organization_id=v_batch.organization_id and id=v_current.id;

  select bs.* into v_next
  from public.batch_stages bs
  where bs.organization_id = v_batch.organization_id
    and bs.batch_id = v_batch.id
    and bs.sequence_no > v_current.sequence_no
    and bs.status = 'pending'
  order by bs.sequence_no
  limit 1
  for update;

  if found then
    update public.batch_stages
    set status='active', started_at=coalesce(started_at,now())
    where organization_id=v_batch.organization_id and id=v_next.id;

    update public.batches
    set status='active', current_stage=v_next.stage_code,
        started_at=coalesce(started_at,now())
    where organization_id=v_batch.organization_id and id=v_batch.id;

    insert into public.events(
      organization_id,event_type,occurred_at,batch_id,payload
    )
    values (
      v_batch.organization_id,'batch_stage_advanced',now(),v_batch.id,
      jsonb_build_object('from',v_current.stage_code,'to',v_next.stage_code)
    );

    return query select v_batch.id,'active'::text,v_next.stage_code,
      v_current.stage_code,v_next.stage_code;
  else
    update public.batches
    set status='completed', current_stage='release',
        completed_at=coalesce(completed_at,now())
    where organization_id=v_batch.organization_id and id=v_batch.id;

    insert into public.events(
      organization_id,event_type,occurred_at,batch_id,payload
    )
    values (
      v_batch.organization_id,'batch_completed',now(),v_batch.id,
      jsonb_build_object('final_stage',v_current.stage_code)
    );

    return query select v_batch.id,'completed'::text,'release'::text,
      v_current.stage_code,null::text;
  end if;
end;
$$;

revoke all on function public.create_batch_with_stages(uuid,text,text,text,uuid,uuid,uuid,uuid,uuid,timestamptz,numeric,text,text[]) from public;
grant execute on function public.create_batch_with_stages(uuid,text,text,text,uuid,uuid,uuid,uuid,uuid,timestamptz,numeric,text,text[]) to authenticated;

revoke all on function public.advance_batch_stage(uuid,text) from public;
grant execute on function public.advance_batch_stage(uuid,text) to authenticated;
