-- Controlled, auditable classification for legacy biological records that predate metadata.domain.
-- Classification is an explicit owner/admin decision, not inferred from an LLM payload.

create table if not exists private.biological_domain_classifications (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  target_type text not null check (target_type in ('culture','material')),
  target_id uuid not null,
  domain text not null check (domain in ('mycology','laboratory')),
  classified_by uuid not null references auth.users(id),
  classified_at timestamptz not null default now(),
  reason text not null check (length(btrim(reason)) between 8 and 500),
  primary key (organization_id, target_type, target_id)
);

create table if not exists private.biological_domain_classification_audit (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  target_type text not null check (target_type in ('culture','material')),
  target_id uuid not null,
  domain text not null check (domain in ('mycology','laboratory')),
  classified_by uuid not null references auth.users(id),
  classified_at timestamptz not null default now(),
  reason text not null check (length(btrim(reason)) between 8 and 500)
);

revoke all on private.biological_domain_classifications from public, anon, authenticated;
revoke all on private.biological_domain_classification_audit from public, anon, authenticated;

create or replace function private.get_biological_domain(
  p_organization_id uuid,
  p_target_type text,
  p_target_id uuid,
  p_metadata_domain text
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select c.domain
        from private.biological_domain_classifications c
       where c.organization_id = p_organization_id
         and c.target_type = p_target_type
         and c.target_id = p_target_id
    ),
    p_metadata_domain
  )
$$;

revoke all on function private.get_biological_domain(uuid,text,uuid,text) from public, anon, authenticated;

create or replace function public.classify_legacy_biological_domain(
  p_organization_id uuid,
  p_target_type text,
  p_target_id uuid,
  p_domain text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_metadata_domain text;
  v_related_domain text;
  v_existing_domain text;
  v_rows integer;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_target_type not in ('culture','material')
     or p_domain not in ('mycology','laboratory')
     or p_target_id is null
     or p_reason is null
     or length(btrim(p_reason)) not between 8 and 500 then
    raise exception 'invalid_domain_classification' using errcode = '22023';
  end if;

  select om.role::text into v_role
    from public.organization_members om
   where om.organization_id = p_organization_id
     and om.user_id = v_user_id;
  if v_role not in ('owner','admin') then
    raise exception 'domain_classification_requires_admin' using errcode = '42501';
  end if;

  if p_target_type = 'culture' then
    select c.metadata ->> 'domain' into v_metadata_domain
      from public.cultures c
     where c.organization_id = p_organization_id and c.id = p_target_id;
    if not found then raise exception 'culture_not_found_or_access_denied'; end if;

    select private.get_biological_domain(p_organization_id,'material',c.material_id,m.metadata ->> 'domain')
      into v_related_domain
      from public.cultures c
      left join public.materials m
        on m.organization_id = c.organization_id and m.id = c.material_id
     where c.organization_id = p_organization_id and c.id = p_target_id;
  else
    select m.metadata ->> 'domain' into v_metadata_domain
      from public.materials m
     where m.organization_id = p_organization_id and m.id = p_target_id;
    if not found then raise exception 'material_not_found_or_access_denied'; end if;

    select private.get_biological_domain(p_organization_id,'culture',c.id,c.metadata ->> 'domain')
      into v_related_domain
      from public.cultures c
     where c.organization_id = p_organization_id and c.material_id = p_target_id
       and c.metadata ? 'domain'
     order by c.created_at
     limit 1;
  end if;

  if v_metadata_domain is not null and v_metadata_domain is distinct from p_domain then
    raise exception 'domain_classification_conflicts_with_record_metadata';
  end if;
  if v_related_domain is not null and v_related_domain is distinct from p_domain then
    raise exception 'domain_classification_conflicts_with_related_record';
  end if;

  insert into private.biological_domain_classifications
    (organization_id,target_type,target_id,domain,classified_by,reason)
  values (p_organization_id,p_target_type,p_target_id,p_domain,v_user_id,btrim(p_reason))
  on conflict (organization_id,target_type,target_id) do nothing;
  get diagnostics v_rows = row_count;

  select c.domain into v_existing_domain
    from private.biological_domain_classifications c
   where c.organization_id = p_organization_id
     and c.target_type = p_target_type
     and c.target_id = p_target_id;
  if v_existing_domain is distinct from p_domain then
    raise exception 'biological_domain_classification_already_set';
  end if;

  if v_rows = 1 then
    insert into private.biological_domain_classification_audit
      (organization_id,target_type,target_id,domain,classified_by,reason)
    values (p_organization_id,p_target_type,p_target_id,p_domain,v_user_id,btrim(p_reason));
  end if;

  return jsonb_build_object(
    'status', case when v_rows = 1 then 'classified' else 'already_classified' end,
    'target_type', p_target_type,
    'target_id', p_target_id,
    'domain', p_domain
  );
end;
$$;

revoke all on function public.classify_legacy_biological_domain(uuid,text,uuid,text,text) from public, anon;
grant execute on function public.classify_legacy_biological_domain(uuid,text,uuid,text,text) to authenticated;

-- Make the auditable classification the first-choice source for legacy rows.
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
     where b.organization_id = p_organization_id and b.id = p_batch_id;
    if not found then raise exception 'batch_not_found_or_access_denied'; end if;
    if p_culture_id is not null and p_culture_id is distinct from v_batch_culture_id then
      raise exception 'batch_culture_mismatch';
    end if;
    p_culture_id := coalesce(p_culture_id, v_batch_culture_id);
    v_material_id := v_batch_material_id;
  end if;

  if p_plant_culture_id is not null then
    perform 1 from public.plant_cultures pc
     where pc.organization_id = p_organization_id and pc.id = p_plant_culture_id;
    if not found then raise exception 'plant_culture_not_found_or_access_denied'; end if;
    return 'agronomy';
  end if;

  if p_culture_id is not null then
    select private.get_biological_domain(
             p_organization_id,'culture',c.id,c.metadata ->> 'domain'
           ), c.material_id
      into v_culture_domain, v_material_id
      from public.cultures c
     where c.organization_id = p_organization_id and c.id = p_culture_id;
    if not found then raise exception 'culture_not_found_or_access_denied'; end if;

    if v_material_id is not null then
      select private.get_biological_domain(
               p_organization_id,'material',m.id,m.metadata ->> 'domain'
             )
        into v_material_domain
        from public.materials m
       where m.organization_id = p_organization_id and m.id = v_material_id;
    end if;

    if v_culture_domain is not null and v_material_domain is not null
       and v_culture_domain is distinct from v_material_domain then
      return null;
    end if;
    v_domain := coalesce(v_culture_domain,v_material_domain);

    if p_batch_id is not null and v_batch_material_id is not null
       and v_batch_material_id is distinct from v_material_id then
      select private.get_biological_domain(
               p_organization_id,'material',m.id,m.metadata ->> 'domain'
             )
        into v_material_domain
        from public.materials m
       where m.organization_id = p_organization_id and m.id = v_batch_material_id;
      if v_material_domain is not null and v_domain is not null
         and v_material_domain is distinct from v_domain then
        return null;
      end if;
      if v_material_domain is not null and v_domain is null then
        v_domain := v_material_domain;
      end if;
    end if;

    if v_domain in ('mycology','laboratory') then return v_domain; end if;
    return null;
  end if;

  if p_batch_id is not null and v_material_id is not null then
    select private.get_biological_domain(
             p_organization_id,'material',m.id,m.metadata ->> 'domain'
           )
      into v_domain
      from public.materials m
     where m.organization_id = p_organization_id and m.id = v_material_id;
    if v_domain in ('mycology','laboratory') then return v_domain; end if;
  end if;
  return null;
end;
$$;

revoke all on function public.resolve_bal_json_domain(uuid,uuid,uuid,uuid) from public, anon;
grant execute on function public.resolve_bal_json_domain(uuid,uuid,uuid,uuid) to authenticated;
