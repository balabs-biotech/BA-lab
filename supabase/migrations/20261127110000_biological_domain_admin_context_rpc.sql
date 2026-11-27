-- Admin-only view of effective biological workspace classifications.
-- Includes audited classifications so the CultureOps panel does not keep presenting
-- already-classified legacy materials as unresolved.

create or replace function public.get_biological_domain_admin_context(
  p_organization_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_cultures jsonb;
  v_materials jsonb;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select om.role::text
    into v_role
    from public.organization_members om
   where om.organization_id = p_organization_id
     and om.user_id = v_user_id;
  if coalesce(v_role,'') not in ('owner','admin') then
    raise exception 'domain_classification_requires_admin' using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(jsonb_build_object(
      'id', c.id,
      'code', coalesce(c.code,'Culture sans code'),
      'detail', coalesce(c.culture_type,'type non précisé'),
      'material_id', c.material_id,
      'metadata_domain', public.resolve_bal_json_domain(
        p_organization_id,c.id,null,null
      )
    ) order by c.created_at desc),
    '[]'::jsonb
  )
    into v_cultures
    from public.cultures c
   where c.organization_id = p_organization_id;

  select coalesce(
    jsonb_agg(jsonb_build_object(
      'id', m.id,
      'code', coalesce(m.material_code,'Matériel sans code'),
      'detail', coalesce(m.material_type,'type non précisé'),
      'metadata_domain', public.resolve_material_biological_domain(
        p_organization_id,m.id
      )
    ) order by m.material_code),
    '[]'::jsonb
  )
    into v_materials
    from public.materials m
   where m.organization_id = p_organization_id;

  return jsonb_build_object(
    'organization_id',p_organization_id,
    'role',v_role,
    'cultures',v_cultures,
    'materials',v_materials
  );
end;
$$;

revoke all on function public.get_biological_domain_admin_context(uuid) from public, anon;
grant execute on function public.get_biological_domain_admin_context(uuid) to authenticated;
