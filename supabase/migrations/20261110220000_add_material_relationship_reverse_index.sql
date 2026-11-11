-- Index the reverse side of the tenant-scoped material graph.
-- Supports bounded lineage expansion from child material IDs.
create index if not exists material_relationships_org_child_idx
  on public.material_relationships (organization_id, child_material_id, parent_material_id);
