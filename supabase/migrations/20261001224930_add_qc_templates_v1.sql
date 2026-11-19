
create table if not exists public.batch_qc_templates (
  organization_id uuid not null,
  id uuid not null default gen_random_uuid(),
  batch_type text not null,
  check_code text not null,
  label text not null,
  required boolean not null default true,
  sequence_no integer not null default 1,
  default_unit_code text,
  description text,
  created_at timestamptz not null default now(),
  primary key (organization_id,id),
  constraint batch_qc_templates_unit_fk foreign key (default_unit_code) references public.units(code),
  constraint batch_qc_templates_seq_chk check (sequence_no > 0),
  constraint batch_qc_templates_unique unique (organization_id,batch_type,check_code)
);

create index if not exists batch_qc_templates_org_type_idx
on public.batch_qc_templates(organization_id,batch_type);

alter table public.batch_qc_templates enable row level security;

create policy batch_qc_templates_select on public.batch_qc_templates
for select using (private.is_org_member(organization_id));
create policy batch_qc_templates_insert on public.batch_qc_templates
for insert with check (private.is_org_member(organization_id));
create policy batch_qc_templates_update on public.batch_qc_templates
for update using (private.is_org_member(organization_id))
with check (private.is_org_member(organization_id));
create policy batch_qc_templates_delete on public.batch_qc_templates
for delete using (private.is_org_member(organization_id));

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
  v_template record;
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
      p_organization_id,v_batch.id,v_template.check_code,
      v_template.label,'pending',v_template.default_unit_code
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

revoke all on function public.create_batch_with_stages(uuid,text,text,text,uuid,uuid,uuid,uuid,uuid,timestamptz,numeric,text,text[]) from public;
grant execute on function public.create_batch_with_stages(uuid,text,text,text,uuid,uuid,uuid,uuid,uuid,timestamptz,numeric,text,text[]) to authenticated;
