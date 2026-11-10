-- Support bounded, tenant-scoped culture genealogy and its operation timeline.
begin;

create index if not exists cultures_org_parent_started_idx
  on public.cultures (organization_id, parent_culture_id, started_at, id);

create index if not exists events_org_culture_occurred_idx
  on public.events (organization_id, culture_id, occurred_at desc, id);

commit;
