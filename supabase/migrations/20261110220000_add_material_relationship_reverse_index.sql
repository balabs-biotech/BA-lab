-- Support bounded reverse traversal of the multi-parent material graph.
begin;

create index if not exists material_relationships_org_child_idx
  on public.material_relationships (organization_id, child_material_id, parent_material_id);

commit;
