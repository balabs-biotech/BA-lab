drop function if exists public.advance_batch_stage(uuid, text);

create function public.advance_batch_stage(p_batch_id uuid, p_expected_stage text)
returns table(batch_id uuid, status text, current_stage text, completed_stage text, next_stage text)
language plpgsql
set search_path = public
as $function$
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

  if v_batch.current_stage = 'qc' then
    raise exception 'qc stage requires release_batch after all QC checks pass or are waived';
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
$function$;
