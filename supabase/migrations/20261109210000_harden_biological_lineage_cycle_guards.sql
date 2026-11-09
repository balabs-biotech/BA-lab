-- Serialize parent-pointer mutations per organization and make recursive
-- cycle checks terminate even if legacy/corrupt data already contains a loop.
-- The canonical graph remains materials.parent_material_id and
-- cultures.parent_culture_id; typed material_relationships are a projection.

create or replace function private.prevent_material_cycle()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  if new.parent_material_id is null then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('material-lineage:' || new.organization_id::text, 0)
  );

  if exists (
    with recursive chain(id, path, cycle) as (
      select new.parent_material_id,
             array[new.parent_material_id]::uuid[],
             false
      union all
      select m.parent_material_id,
             chain.path || m.parent_material_id,
             m.parent_material_id = any(chain.path)
        from chain
        join public.materials m
          on m.organization_id = new.organization_id
         and m.id = chain.id
       where m.parent_material_id is not null
         and not chain.cycle
    )
    select 1 from chain where id = new.id
  ) then
    raise exception 'material_lineage_cycle_detected' using errcode = '23514';
  end if;

  return new;
end;
$function$;

create or replace function private.prevent_culture_cycle()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  if new.parent_culture_id is null then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('culture-lineage:' || new.organization_id::text, 0)
  );

  if exists (
    with recursive chain(id, path, cycle) as (
      select new.parent_culture_id,
             array[new.parent_culture_id]::uuid[],
             false
      union all
      select c.parent_culture_id,
             chain.path || c.parent_culture_id,
             c.parent_culture_id = any(chain.path)
        from chain
        join public.cultures c
          on c.organization_id = new.organization_id
         and c.id = chain.id
       where c.parent_culture_id is not null
         and not chain.cycle
    )
    select 1 from chain where id = new.id
  ) then
    raise exception 'culture_lineage_cycle_detected' using errcode = '23514';
  end if;

  return new;
end;
$function$;

revoke all on function private.prevent_material_cycle() from public, anon, authenticated;
revoke all on function private.prevent_culture_cycle() from public, anon, authenticated;

drop trigger if exists materials_no_cycle on public.materials;
create trigger materials_no_cycle
before insert or update of parent_material_id on public.materials
for each row execute function private.prevent_material_cycle();

drop trigger if exists cultures_no_cycle on public.cultures;
create trigger cultures_no_cycle
before insert or update of parent_culture_id on public.cultures
for each row execute function private.prevent_culture_cycle();
