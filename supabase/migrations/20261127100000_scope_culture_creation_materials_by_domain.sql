-- Expose only classified parent materials to the active biological workspace.
-- The resolver reads audited classifications without exposing private classification tables.

create or replace function public.resolve_material_biological_domain(
  p_organization_id uuid,
  p_material_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_metadata_domain text;
begin
  if p_organization_id is null or p_material_id is null
     or not private.is_org_member(p_organization_id) then
    raise exception 'organization_access_denied' using errcode = '42501';
  end if;

  select m.metadata ->> 'domain'
    into v_metadata_domain
    from public.materials m
   where m.organization_id = p_organization_id
     and m.id = p_material_id;
  if not found then
    raise exception 'material_not_found_or_access_denied' using errcode = '42501';
  end if;

  return private.get_biological_domain(
    p_organization_id, 'material', p_material_id, v_metadata_domain
  );
end;
$$;

revoke all on function public.resolve_material_biological_domain(uuid,uuid) from public, anon;
grant execute on function public.resolve_material_biological_domain(uuid,uuid) to authenticated;

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
  o.common_name,
  public.resolve_material_biological_domain(m.organization_id,m.id) as biological_domain
from public.materials m
join public.strains s
  on s.organization_id=m.organization_id
 and s.id=m.strain_id
join public.organisms o
  on o.id=s.organism_id
where m.state='active';

grant select on public.v_culture_creation_options to authenticated;
revoke all on public.v_culture_creation_options from anon;
