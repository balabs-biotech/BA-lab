-- Permit only the reviewed, category-specific stage sequences used by CultureOps.
-- Unknown/legacy batch types retain the historical universal sequence.
-- This migration is additive and is not applied to production by this change.

create or replace function public.create_batch_with_stages(
  p_organization_id uuid,
  p_batch_code text,
  p_name text,
  p_batch_type text,
  p_protocol_version_id uuid DEFAULT NULL::uuid,
  p_material_id uuid DEFAULT NULL::uuid,
  p_culture_id uuid DEFAULT NULL::uuid,
  p_location_id uuid DEFAULT NULL::uuid,
  p_environment_id uuid DEFAULT NULL::uuid,
  p_planned_at timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_quantity_planned numeric DEFAULT NULL::numeric,
  p_quantity_unit_code text DEFAULT NULL::text,
  p_stages text[] DEFAULT ARRAY['preparation'::text, 'sterilization'::text, 'inoculation'::text, 'incubation'::text, 'cultivation'::text, 'harvest'::text, 'formulation'::text, 'packaging'::text, 'qc'::text, 'release'::text]
)
returns public.batches
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_batch public.batches;
  v_stage text;
  v_seq integer := 0;
  v_template record;
  v_expected_stages text[] := array[
    'preparation','sterilization','inoculation','cultivation',
    'harvest','formulation','packaging','qc','release'
  ];
begin
  if not private.is_org_member(p_organization_id) then
    raise exception 'not authorized for organization';
  end if;

  v_expected_stages := case p_batch_type
    when 'CULTURE' then array['preparation','sterilization','inoculation','incubation','cultivation','qc','release']::text[]
    when 'TRICHODERMA' then array['preparation','sterilization','inoculation','incubation','cultivation','formulation','packaging','qc','release']::text[]
    when 'PLEUROTUS_SPAWN' then array['preparation','sterilization','inoculation','incubation','packaging','qc','release']::text[]
    when 'MUSHROOM_PRODUCT' then array['harvest','packaging','qc','release']::text[]
    when 'BIOSTIMULANT' then array['preparation','sterilization','inoculation','incubation','cultivation','formulation','packaging','qc','release']::text[]
    when 'FORMULATION' then array['preparation','formulation','packaging','qc','release']::text[]
    else array['preparation','sterilization','inoculation','incubation','cultivation','harvest','formulation','packaging','qc','release']::text[]
  end;

  if p_stages is distinct from v_expected_stages then
    raise exception 'invalid stage workflow for batch type %', p_batch_type
      using errcode = '22023';
  end if;

  -- Validate every referenced resource at the RPC boundary; client-side
  -- organization filters are not an authorization control.
  if p_location_id is not null and not exists (
    select 1 from public.locations l
    where l.id=p_location_id and l.organization_id=p_organization_id
  ) then
    raise exception 'location_not_found_or_forbidden' using errcode = '23503';
  end if;

  if p_environment_id is not null and not exists (
    select 1 from public.environments e
    where e.id=p_environment_id
      and e.organization_id=p_organization_id
      and (e.location_id is null or e.location_id=p_location_id)
  ) then
    raise exception 'environment_not_found_or_incompatible' using errcode = '23503';
  end if;

  if p_culture_id is not null and not exists (
    select 1 from public.cultures c
    where c.id=p_culture_id and c.organization_id=p_organization_id
  ) then
    raise exception 'culture_not_found_or_forbidden' using errcode = '23503';
  end if;

  if p_material_id is not null and not exists (
    select 1 from public.materials m
    where m.id=p_material_id and m.organization_id=p_organization_id
  ) then
    raise exception 'material_not_found_or_forbidden' using errcode = '23503';
  end if;

  if p_culture_id is null and p_material_id is null then
    raise exception 'biological_traceability_anchor_required' using errcode = '23514';
  end if;

  if p_protocol_version_id is not null and not exists (
    select 1 from public.protocol_versions pv
    where pv.id=p_protocol_version_id and pv.organization_id=p_organization_id
  ) then
    raise exception 'protocol_version_not_found_or_forbidden' using errcode = '23503';
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
$$;
