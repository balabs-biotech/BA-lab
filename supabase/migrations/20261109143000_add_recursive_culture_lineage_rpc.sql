-- Recursive, tenant-scoped lineage reads. Existing culture/material links remain canonical.
-- Supports organization-scoped child lookups during recursive descendant traversal.
create index if not exists cultures_org_parent_idx
  on public.cultures(organization_id, parent_culture_id);

drop function if exists public.get_culture_lineage(uuid, uuid, integer);
drop function if exists public.get_culture_lineage(uuid, uuid, integer, integer);

create function public.get_culture_lineage(
  p_organization_id uuid,
  p_culture_id uuid,
  p_limit integer default 200,
  p_offset integer default 0
)
returns table (
  relation text,
  depth integer,
  culture_id uuid,
  culture_code text,
  culture_type text,
  material_id uuid,
  material_code text,
  material_type text,
  material_generation integer,
  material_state text,
  material_relationship_type text,
  parent_culture_id uuid,
  parent_material_id uuid,
  started_at timestamptz,
  truncated boolean,
  descendant_total bigint,
  has_more boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 200), 5000));
  v_offset integer := greatest(0, least(coalesce(p_offset, 0), 1000000));
begin
  if auth.uid() is null or not private.is_org_member(p_organization_id) then
    raise exception 'organization_access_denied' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.cultures c
     where c.organization_id = p_organization_id
       and c.id = p_culture_id
  ) then
    raise exception 'culture_not_found' using errcode = 'P0002';
  end if;

  return query
  with recursive
  target as (
    select c.id, c.organization_id, c.code, c.culture_type, c.material_id,
           c.parent_culture_id, c.started_at
      from public.cultures c
     where c.organization_id = p_organization_id
       and c.id = p_culture_id
  ),
  ancestors as (
    select p.id, p.code, p.culture_type, p.material_id, p.parent_culture_id,
           p.started_at, 1::integer as depth, array[t.id, p.id]::uuid[] as path
      from target t
      join public.cultures p
        on p.organization_id = t.organization_id
       and p.id = t.parent_culture_id
    union all
    select p.id, p.code, p.culture_type, p.material_id, p.parent_culture_id,
           p.started_at, a.depth + 1, a.path || p.id
      from ancestors a
      join public.cultures p
        on p.organization_id = p_organization_id
       and p.id = a.parent_culture_id
     where a.depth < 250
       and not p.id = any(a.path)
  ),
  descendants as (
    select c.id, c.code, c.culture_type, c.material_id, c.parent_culture_id,
           c.started_at, 1::integer as depth, array[t.id, c.id]::uuid[] as path
      from target t
      join public.cultures c
        on c.organization_id = t.organization_id
       and c.parent_culture_id = t.id
    union all
    select c.id, c.code, c.culture_type, c.material_id, c.parent_culture_id,
           c.started_at, d.depth + 1, d.path || c.id
      from descendants d
      join public.cultures c
        on c.organization_id = p_organization_id
       and c.parent_culture_id = d.id
     where d.depth < 250
       and not c.id = any(d.path)
  ),
  ranked_descendants as (
    select d.*,
           row_number() over (order by d.depth, d.id) as row_number
      from descendants d
  ),
  descendant_stats as (
    select count(*)::bigint as total_count from descendants
  ),
  material_ancestors as (
    select m.id, m.material_code, m.material_type, m.parent_material_id,
           m.generation, m.state, rel.relationship_type, 1::integer as depth,
           array[current_material.id, m.id]::uuid[] as path
      from target t
      join public.materials current_material
        on current_material.organization_id = t.organization_id
       and current_material.id = t.material_id
      join public.materials m
        on m.organization_id = t.organization_id
       and m.id = current_material.parent_material_id
      left join lateral (
        select string_agg(distinct rel.relationship_type, ', ' order by rel.relationship_type) as relationship_type
          from public.material_relationships rel
         where rel.organization_id = t.organization_id
           and rel.parent_material_id = m.id
           and rel.child_material_id = current_material.id
      ) rel on true
    union all
    select parent.id, parent.material_code, parent.material_type,
           parent.parent_material_id, parent.generation, parent.state,
           rel.relationship_type, ma.depth + 1, ma.path || parent.id
      from material_ancestors ma
      join public.materials parent
        on parent.organization_id = p_organization_id
       and parent.id = ma.parent_material_id
      left join lateral (
        select string_agg(distinct rel.relationship_type, ', ' order by rel.relationship_type) as relationship_type
          from public.material_relationships rel
         where rel.organization_id = p_organization_id
           and rel.parent_material_id = parent.id
           and rel.child_material_id = ma.id
      ) rel on true
     where ma.depth < 250
       and not parent.id = any(ma.path)
  ),
  result_rows as (
    select 1 as sort_group, 'ancestor'::text as relation, a.depth,
           a.id as culture_id, a.code as culture_code, a.culture_type,
           a.material_id, m.material_code, m.material_type, m.generation as material_generation,
           m.state as material_state, null::text as material_relationship_type,
           a.parent_culture_id, m.parent_material_id,
           a.started_at, false as truncated, 0::bigint as descendant_total, false as has_more
      from ancestors a
      left join public.materials m
        on m.organization_id = p_organization_id and m.id = a.material_id
    union all
    select 2, 'current'::text, 0,
           t.id, t.code, t.culture_type, t.material_id,
           m.material_code, m.material_type, m.generation, m.state, null::text,
           t.parent_culture_id, m.parent_material_id, t.started_at, false,
           stats.total_count, stats.total_count > (v_offset + v_limit)
      from target t
      cross join descendant_stats stats
      left join public.materials m
        on m.organization_id = t.organization_id and m.id = t.material_id
    union all
    select 3, 'descendant'::text, d.depth,
           d.id, d.code, d.culture_type, d.material_id,
           m.material_code, m.material_type, m.generation, m.state, null::text,
           d.parent_culture_id, m.parent_material_id, d.started_at,
           false, stats.total_count, stats.total_count > (v_offset + v_limit)
      from ranked_descendants d
      cross join descendant_stats stats
      left join public.materials m
        on m.organization_id = p_organization_id and m.id = d.material_id
     where d.row_number > v_offset and d.row_number <= (v_offset + v_limit)
    union all
    select 4, 'material_ancestor'::text, ma.depth,
           null::uuid, null::text, null::text, ma.id,
           ma.material_code, ma.material_type, ma.generation, ma.state, ma.relationship_type,
           null::uuid, ma.parent_material_id, null::timestamptz, false, 0::bigint, false
      from material_ancestors ma
    union all
    select 5, 'ancestor_truncated'::text, 250,
           null::uuid, null::text, null::text, null::uuid,
           null::text, null::text, null::integer, null, null::text,
           null::uuid, null::uuid, null::timestamptz, true, 0::bigint, false
     where exists (
       select 1 from ancestors a
        where a.depth = 250
          and a.parent_culture_id is not null
          and exists (
            select 1 from public.cultures parent
             where parent.organization_id = p_organization_id
               and parent.id = a.parent_culture_id
          )
     )
    union all
    select 6, 'material_ancestor_truncated'::text, 250,
           null::uuid, null::text, null::text, null::uuid,
           null::text, null::text, null::integer, null, null::text,
           null::uuid, null::uuid, null::timestamptz, true, 0::bigint, false
     where exists (
       select 1 from material_ancestors ma
        where ma.depth = 250
          and ma.parent_material_id is not null
          and exists (
            select 1 from public.materials parent
             where parent.organization_id = p_organization_id
               and parent.id = ma.parent_material_id
          )
     )
  )
  select r.relation, r.depth, r.culture_id, r.culture_code, r.culture_type,
         r.material_id, r.material_code, r.material_type, r.material_generation,
         r.material_state, r.material_relationship_type,
         r.parent_culture_id, r.parent_material_id,
         r.started_at, r.truncated, r.descendant_total, r.has_more
    from result_rows r
   order by r.sort_group, r.depth, r.culture_code nulls last;
end;
$function$;

revoke all on function public.get_culture_lineage(uuid, uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.get_culture_lineage(uuid, uuid, integer, integer) to authenticated;
