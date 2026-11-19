create or replace function public.release_batch(p_batch_id uuid)
returns public.batches
language plpgsql
set search_path = public
as $function$
declare
  v_batch public.batches;
  v_total integer;
  v_pass integer;
  v_fail integer;
  v_pending integer;
  v_waived integer;
begin
  select b.* into v_batch
  from public.batches b
  where b.id=p_batch_id
  for update;

  if not found then
    raise exception 'batch not found';
  end if;

  if not private.is_org_member(v_batch.organization_id) then
    raise exception 'not authorized for organization';
  end if;

  if v_batch.current_stage <> 'qc' then
    raise exception 'batch must be at qc stage';
  end if;

  select
    count(*),
    count(*) filter (where status='pass'),
    count(*) filter (where status='fail'),
    count(*) filter (where status='pending'),
    count(*) filter (where status='waived')
  into v_total,v_pass,v_fail,v_pending,v_waived
  from public.batch_qc_checks
  where organization_id=v_batch.organization_id and batch_id=v_batch.id;

  if v_total=0 then raise exception 'no qc checks recorded'; end if;
  if v_fail>0 then raise exception 'qc contains failed checks'; end if;
  if v_pending>0 then raise exception 'qc contains pending checks'; end if;
  if v_pass + v_waived <> v_total then
    raise exception 'qc is not complete';
  end if;

  update public.batch_stages
  set status='completed', completed_at=coalesce(completed_at,now())
  where organization_id=v_batch.organization_id
    and batch_id=v_batch.id
    and stage_code='qc';

  update public.batch_stages
  set status='completed',
      started_at=coalesce(started_at,now()),
      completed_at=coalesce(completed_at,now())
  where organization_id=v_batch.organization_id
    and batch_id=v_batch.id
    and stage_code='release';

  update public.batches
  set status='released',
      current_stage='release',
      completed_at=coalesce(completed_at,now())
  where organization_id=v_batch.organization_id
    and id=v_batch.id
  returning * into v_batch;

  insert into public.events(organization_id,event_type,occurred_at,batch_id,payload)
  values(
    v_batch.organization_id,'batch_released',now(),v_batch.id,
    jsonb_build_object(
      'qc_checks',v_total,
      'passed',v_pass,
      'waived',v_waived
    )
  );

  return v_batch;
end;
$function$;
