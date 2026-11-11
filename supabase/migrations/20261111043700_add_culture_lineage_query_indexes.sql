-- Support bounded, tenant-scoped culture and material genealogy queries.
begin;

create index if not exists cultures_org_parent_started_idx
  on public.cultures (organization_id, parent_culture_id, started_at, id);

create index if not exists events_org_culture_occurred_idx
  on public.events (organization_id, culture_id, occurred_at desc, id);

create index if not exists events_org_material_occurred_idx
  on public.events (organization_id, material_id, occurred_at desc, id);

create index if not exists batches_org_culture_created_idx
  on public.batches (organization_id, culture_id, created_at desc);

create index if not exists batches_org_material_created_idx
  on public.batches (organization_id, material_id, created_at desc);

create index if not exists material_relationships_org_parent_idx
  on public.material_relationships (organization_id, parent_material_id, child_material_id);

commit;
