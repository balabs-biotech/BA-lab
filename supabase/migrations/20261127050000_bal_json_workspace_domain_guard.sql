-- BAL-JSON workspace/domain integrity boundary.
-- Domain is resolved from persisted biological anchors, never from LLM payload fields.

create or replace function private.prevent_biological_domain_rewrite()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.metadata ? 'domain'
     and new.metadata ->> 'domain' is distinct from old.metadata ->> 'domain' then
    raise exception 'biological_domain_is_immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists cultures_domain_immutable on public.cultures;
create trigger cultures_domain_immutable
before update of metadata on public.cultures
for each row execute function private.prevent_biological_domain_rewrite();

drop trigger if exists materials_domain_immutable on public.materials;
create trigger materials_domain_immutable
before update of metadata on public.materials
for each row execute function private.prevent_biological_domain_rewrite();

drop trigger if exists plant_cultures_domain_immutable on public.plant_cultures;
create trigger plant_cultures_domain_immutable
before update of metadata on public.plant_cultures
for each row execute function private.prevent_biological_domain_rewrite();

create or replace function public.resolve_bal_json_domain(
  p_organization_id uuid,
  p_culture_id uuid default null,
  p_plant_culture_id uuid default null,
  p_batch_id uuid default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_domain text;
  v_culture_domain text;
  v_material_domain text;
  v_batch_culture_id uuid;
  v_batch_material_id uuid;
  v_material_id uuid;
begin
  if not private.is_org_member(p_organization_id) then
    raise exception 'organization_access_denied';
  end if;

  if p_plant_culture_id is not null and
     (p_culture_id is not null or p_batch_id is not null) then
    raise exception 'conflicting_biological_context';
  end if;

  if p_batch_id is not null then
    select b.culture_id, b.material_id
      into v_batch_culture_id, v_batch_material_id
      from public.batches b
     where b.organization_id = p_organization_id
       and b.id = p_batch_id;

    if not found then
      raise exception 'batch_not_found_or_access_denied';
    end if;

    if p_culture_id is not null and p_culture_id is distinct from v_batch_culture_id then
      raise exception 'batch_culture_mismatch';
    end if;

    p_culture_id := coalesce(p_culture_id, v_batch_culture_id);
    v_material_id := v_batch_material_id;
  end if;

  if p_plant_culture_id is not null then
    select pc.metadata ->> 'domain'
      into v_domain
      from public.plant_cultures pc
     where pc.organization_id = p_organization_id
       and pc.id = p_plant_culture_id;

    if not found then
      raise exception 'plant_culture_not_found_or_access_denied';
    end if;
    if v_domain is distinct from 'agronomy' then
      return null;
    end if;
    return v_domain;
  end if;

  if p_culture_id is not null then
    select c.metadata ->> 'domain', c.material_id
      into v_culture_domain, v_material_id
      from public.cultures c
     where c.organization_id = p_organization_id
       and c.id = p_culture_id;

    if not found then
      raise exception 'culture_not_found_or_access_denied';
    end if;

    if v_material_id is not null then
      select m.metadata ->> 'domain'
        into v_material_domain
        from public.materials m
       where m.organization_id = p_organization_id
         and m.id = v_material_id;
    end if;

    if v_culture_domain is not null and v_material_domain is not null
       and v_culture_domain is distinct from v_material_domain then
      return null;
    end if;

    v_domain := coalesce(v_culture_domain, v_material_domain);

    if p_batch_id is not null and v_batch_material_id is not null
       and v_batch_material_id is distinct from v_material_id then
      select m.metadata ->> 'domain'
        into v_material_domain
        from public.materials m
       where m.organization_id = p_organization_id
         and m.id = v_batch_material_id;
      if v_material_domain is not null and v_domain is not null
         and v_material_domain is distinct from v_domain then
        return null;
      end if;
      if v_material_domain is not null and v_domain is null then
        v_domain := v_material_domain;
      end if;
    end if;

    if v_domain in ('mycology', 'laboratory') then
      return v_domain;
    end if;
    return null;
  end if;

  -- A batch without a culture can only be classified by its own linked material.
  if p_batch_id is not null and v_material_id is not null then
    select m.metadata ->> 'domain'
      into v_domain
      from public.materials m
     where m.organization_id = p_organization_id
       and m.id = v_material_id;
    if v_domain in ('mycology', 'laboratory') then
      return v_domain;
    end if;
  end if;

  return null;
end;
$$;

create or replace function public.is_bal_json_variable_allowed(
  p_domain text,
  p_variable_code text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_domain = 'laboratory' then exists (
      select 1 from public.variables v where v.code = p_variable_code
    )
    when p_domain = 'agronomy' then p_variable_code = any(array[
      'co2_concentration','electrical_conductivity','illuminance','ph',
      'relative_humidity','root_length','shoot_length','substrate_moisture',
      'temperature','fresh_mass','dry_mass','wet_biomass','volume'
    ]::text[])
    when p_domain = 'mycology' then p_variable_code = any(array[
      'cfu','cfu_per_ml','co2_concentration','colony_count','dry_biomass',
      'electrical_conductivity','fresh_mass','generation_time','growth_rate',
      'incubation_time','od600','ph','relative_humidity','temperature',
      'viability','volume','wet_biomass'
    ]::text[])
    else false
  end
$$;

revoke all on function public.resolve_bal_json_domain(uuid,uuid,uuid,uuid) from public, anon;
grant execute on function public.resolve_bal_json_domain(uuid,uuid,uuid,uuid) to authenticated;
revoke all on function public.is_bal_json_variable_allowed(text,text) from public, anon;
grant execute on function public.is_bal_json_variable_allowed(text,text) to authenticated;
