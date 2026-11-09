-- Keep typed material edges synchronized with the canonical parent pointer.
-- The parent_material_id column remains the source of truth. This trigger mirrors
-- that relation into material_relationships for typed lineage reads.

create or replace function private.sync_material_parent_relationship()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_relationship_type text;
begin
  if tg_op = 'UPDATE' then
    if old.parent_material_id is distinct from new.parent_material_id
       or coalesce(nullif(pg_catalog.btrim(old.metadata ->> 'generation_method'), ''), 'derived_from')
          is distinct from
          coalesce(nullif(pg_catalog.btrim(new.metadata ->> 'generation_method'), ''), 'derived_from') then
      delete from public.material_relationships
       where organization_id = old.organization_id
         and parent_material_id = old.parent_material_id
         and child_material_id = old.id
         and relationship_type =
             coalesce(nullif(pg_catalog.btrim(old.metadata ->> 'generation_method'), ''), 'derived_from');
    end if;
  end if;

  if new.parent_material_id is not null then
    v_relationship_type :=
      coalesce(nullif(pg_catalog.btrim(new.metadata ->> 'generation_method'), ''), 'derived_from');

    insert into public.material_relationships(
      organization_id, parent_material_id, child_material_id, relationship_type
    )
    values (
      new.organization_id, new.parent_material_id, new.id, v_relationship_type
    )
    on conflict (organization_id, parent_material_id, child_material_id, relationship_type)
    do nothing;
  end if;

  return new;
end;
$function$;

revoke all on function private.sync_material_parent_relationship() from public, anon, authenticated;

drop trigger if exists materials_sync_parent_relationship_insert on public.materials;
create trigger materials_sync_parent_relationship_insert
after insert on public.materials
for each row execute function private.sync_material_parent_relationship();

drop trigger if exists materials_sync_parent_relationship_update on public.materials;
create trigger materials_sync_parent_relationship_update
after update of parent_material_id, metadata on public.materials
for each row execute function private.sync_material_parent_relationship();

-- Backfill legacy material parent links. Existing explicitly typed edges are preserved.
insert into public.material_relationships(
  organization_id, parent_material_id, child_material_id, relationship_type
)
select m.organization_id, m.parent_material_id, m.id,
       coalesce(nullif(pg_catalog.btrim(m.metadata ->> 'generation_method'), ''), 'derived_from')
  from public.materials m
 where m.parent_material_id is not null
on conflict (organization_id, parent_material_id, child_material_id, relationship_type)
do nothing;
