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
  p_stages text[] default array[
    'preparation','sterilization','inoculation','incubation',
    'cultivation','harvest','formulation','packaging','qc','release'
  ]
)
returns public.batches
language plpgsql
set search_path = public
as $function$
declare
  v_batch public.batches;
  v_stage text;
  v_seq integer := 0;
  v_template record;
  v_expected_stages constant text[] := array[
    'preparation','sterilization','inoculation','incubation',
    'cultivation','harvest','formulation','packaging','qc','release'
  ];
begin
  if not private.is_org_member(p_organization_id) then
    raise exception 'not authorized for organization';
  end if;

  if p_stages is distinct from v_expected_stages then
    raise exception 'custom stage workflows are disabled; use the standard batch workflow';
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

  for v_template in
    select check_code,label,default_unit_code
    from public.batch_qc_templates
    where organization_id=p_organization_id
      and batch_type=p_batch_type
      and required=true
    order by sequence_no
  loop
    insert into public.batch_qc_checks(
      organization_id,batch_id,check_code,label,status,unit_code
    )
    values(
      p_organization_id,v_batch.id,v_template.check_code,v_template.label,
      'pending',v_template.default_unit_code
    );
  end loop;

  insert into public.events(
    organization_id,event_type,occurred_at,batch_id,payload
  )
  values (
    p_organization_id,'batch_created',now(),v_batch.id,
    jsonb_build_object(
      'batch_code',p_batch_code,
      'batch_type',p_batch_type,
      'qc_template_applied',true
    )
  );

  return v_batch;
end;
$function$;
