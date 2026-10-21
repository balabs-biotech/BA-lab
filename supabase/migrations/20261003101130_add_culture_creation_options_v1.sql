
create or replace view public.v_culture_creation_options
with (security_invoker = true)
as
select
  m.organization_id,
  m.id as material_id,
  m.material_code,
  m.generation,
  m.state as material_state,
  s.id as strain_id,
  s.strain_code,
  s.designation as strain_designation,
  o.id as organism_id,
  o.scientific_name,
  o.common_name
from public.materials m
join public.strains s
  on s.organization_id=m.organization_id
 and s.id=m.strain_id
join public.organisms o
  on o.id=s.organism_id
where m.state='active';

create or replace view public.v_culture_creation_reference
with (security_invoker = true)
as
select
  'culture_type'::text as reference_type,
  ct.code,
  ct.label,
  ct.parent_code,
  null::text as extra_code
from public.culture_types ct
union all
select
  'protocol'::text,
  p.code,
  p.name,
  null::text,
  p.protocol_type
from public.protocols p
where p.organization_id=(select id from public.organizations where code='BA-LABS');

grant select on public.v_culture_creation_options to authenticated;
grant select on public.v_culture_creation_reference to authenticated;

revoke all on public.v_culture_creation_options from anon;
revoke all on public.v_culture_creation_reference from anon;
