-- BAL-JSON workspace/domain integrity boundary.
-- Domain is resolved from persisted biological anchors, never from LLM payload fields.

create or replace function private.prevent_biological_domain_rewrite()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_domain text;
begin
  v_domain := new.metadata ->> 'domain';
  if new.metadata ? 'domain' and (
       (tg_table_name = 'plant_cultures' and v_domain is distinct from 'agronomy')
       or
       (tg_table_name <> 'plant_cultures' and (v_domain is null or v_domain not in ('mycology', 'laboratory')))
     ) then
    raise exception 'invalid_biological_domain';
  end if;

  if tg_op = 'UPDATE' then
    if new.metadata ->> 'domain' is distinct from old.metadata ->> 'domain' then
      raise exception 'biological_domain_is_immutable';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists cultures_domain_insert_guard on public.cultures;
create trigger cultures_domain_insert_guard
before insert on public.cultures
for each row execute function private.prevent_biological_domain_rewrite();

drop trigger if exists materials_domain_insert_guard on public.materials;
create trigger materials_domain_insert_guard
before insert on public.materials
for each row execute function private.prevent_biological_domain_rewrite();

drop trigger if exists plant_cultures_domain_insert_guard on public.plant_cultures;
create trigger plant_cultures_domain_insert_guard
before insert on public.plant_cultures
for each row execute function private.prevent_biological_domain_rewrite();

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
    perform 1
      from public.plant_cultures pc
     where pc.organization_id = p_organization_id
       and pc.id = p_plant_culture_id;

    if not found then
      raise exception 'plant_culture_not_found_or_access_denied';
    end if;
    -- Table identity is authoritative for the agronomy workspace.
    return 'agronomy';
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
      'cfu','cfu_per_ml','co2_concentration',
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


-- Enforce workspace-domain policy again inside the atomic RPC so direct RPC callers cannot bypass the Edge Function.
create or replace function public.ingest_bal_json_record(
  p_record_id uuid,
  p_payload_sha256 text,
  p_record_type text,
  p_event jsonb,
  p_data jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid;
  v_domain text;
  v_existing private.bal_json_ingestion_receipts%rowtype;
  v_event_id uuid;
  v_culture_id uuid;
  v_plant_culture_id uuid;
  v_batch_id uuid;
  v_variable_code text;
begin
  if p_record_id is null or p_record_type is null or p_payload_sha256 is null
     or p_payload_sha256 !~ '^[0-9a-f]{64}$'
     or p_record_type not in ('measurement','observation')
     or p_event is null or p_data is null then
    raise exception 'Invalid BAL-JSON ingestion arguments' using errcode = '22023';
  end if;

  v_org_id := nullif(p_event->>'organization_id','')::uuid;
  if v_org_id is null or not private.is_org_member(v_org_id) then
    raise exception 'Organization access denied' using errcode = '42501';
  end if;

  v_culture_id := nullif(p_data->>'culture_id','')::uuid;
  v_plant_culture_id := nullif(p_data->>'plant_culture_id','')::uuid;
  v_batch_id := nullif(p_event->>'batch_id','')::uuid;
  v_variable_code := nullif(p_data->>'variable_code','');

  if nullif(p_event->>'culture_id','')::uuid is distinct from v_culture_id
     or nullif(p_event->>'plant_culture_id','')::uuid is distinct from v_plant_culture_id then
    raise exception 'BAL-JSON event and data biological anchors do not match' using errcode = '22023';
  end if;

  if v_variable_code is null then
    raise exception 'BAL-JSON variable code is required' using errcode = '22023';
  end if;

  v_domain := public.resolve_bal_json_domain(
    v_org_id, v_culture_id, v_plant_culture_id, v_batch_id
  );
  if v_domain is null then
    raise exception 'BAL-JSON biological workspace domain is unresolved' using errcode = '22023';
  end if;

  if not public.is_bal_json_variable_allowed(v_domain, v_variable_code) then
    raise exception 'BAL-JSON variable is not allowed for workspace domain %: %',
      v_domain, v_variable_code using errcode = '22023';
  end if;

  insert into private.bal_json_ingestion_receipts
    (organization_id, record_id, payload_sha256, record_type)
  values (v_org_id, p_record_id, p_payload_sha256, p_record_type)
  on conflict (organization_id, record_id) do nothing;

  if not found then
    select * into v_existing
      from private.bal_json_ingestion_receipts
     where organization_id = v_org_id and record_id = p_record_id
     for update;
    if v_existing.payload_sha256 <> p_payload_sha256
       or v_existing.record_type <> p_record_type then
      raise exception 'bal_json_record_id_payload_mismatch' using errcode = '23505';
    end if;
    if v_existing.event_id is null then
      raise exception 'bal_json_receipt_incomplete' using errcode = '40001';
    end if;
    return jsonb_build_object(
      'status','duplicate',
      'record_id',p_record_id,
      'event_id',v_existing.event_id
    );
  end if;

  if p_record_type = 'measurement' then
    v_event_id := public.record_manual_measurement(p_event, p_data);
  else
    v_event_id := public.record_manual_observation(p_event, p_data);
  end if;

  update private.bal_json_ingestion_receipts
     set event_id = v_event_id
   where organization_id = v_org_id and record_id = p_record_id;

  return jsonb_build_object(
    'status','inserted',
    'record_id',p_record_id,
    'event_id',v_event_id
  );
end;
$$;

revoke all on function public.ingest_bal_json_record(uuid,text,text,jsonb,jsonb) from public, anon;
grant execute on function public.ingest_bal_json_record(uuid,text,text,jsonb,jsonb) to authenticated;
