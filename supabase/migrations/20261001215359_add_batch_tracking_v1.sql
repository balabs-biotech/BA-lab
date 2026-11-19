create table public.batches (
  organization_id uuid not null,
  id uuid not null default gen_random_uuid(),
  batch_code text not null,
  name text not null,
  batch_type text not null,
  status text not null default 'planned',
  current_stage text,
  material_id uuid,
  culture_id uuid,
  protocol_version_id uuid,
  location_id uuid,
  environment_id uuid,
  planned_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  quantity_planned numeric,
  quantity_actual numeric,
  quantity_unit_code text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (organization_id, id),
  constraint batches_code_key unique (organization_id, batch_code),
  constraint batches_status_check check (status in ('planned','active','on_hold','released','rejected','completed','aborted')),
  constraint batches_stage_check check (current_stage is null or current_stage in ('preparation','sterilization','inoculation','incubation','qc','release')),
  constraint batches_quantity_planned_check check (quantity_planned is null or quantity_planned >= 0),
  constraint batches_quantity_actual_check check (quantity_actual is null or quantity_actual >= 0),
  constraint batches_org_fk foreign key (organization_id) references public.organizations(id),
  constraint batches_material_fk foreign key (organization_id, material_id) references public.materials(organization_id, id),
  constraint batches_culture_fk foreign key (organization_id, culture_id) references public.cultures(organization_id, id),
  constraint batches_protocol_version_fk foreign key (organization_id, protocol_version_id) references public.protocol_versions(organization_id, id),
  constraint batches_location_fk foreign key (organization_id, location_id) references public.locations(organization_id, id),
  constraint batches_environment_fk foreign key (organization_id, environment_id) references public.environments(organization_id, id),
  constraint batches_quantity_unit_fk foreign key (quantity_unit_code) references public.units(code)
);

create table public.batch_stages (
  organization_id uuid not null,
  id uuid not null default gen_random_uuid(),
  batch_id uuid not null,
  stage_code text not null,
  sequence_no integer not null,
  status text not null default 'pending',
  planned_start_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (organization_id, id),
  constraint batch_stages_unique_sequence unique (organization_id, batch_id, sequence_no),
  constraint batch_stages_status_check check (status in ('pending','active','completed','skipped','failed')),
  constraint batch_stages_sequence_check check (sequence_no > 0),
  constraint batch_stages_stage_check check (stage_code in ('preparation','sterilization','inoculation','incubation','qc','release')),
  constraint batch_stages_batch_fk foreign key (organization_id, batch_id)
    references public.batches(organization_id, id) on delete cascade
);

alter table public.events
  add column batch_id uuid;

alter table public.events
  add constraint events_batch_fk foreign key (organization_id, batch_id)
  references public.batches(organization_id, id);

create index batches_org_status_idx on public.batches (organization_id, status);
create index batches_org_stage_idx on public.batches (organization_id, current_stage);
create index batches_org_material_idx on public.batches (organization_id, material_id);
create index batches_org_culture_idx on public.batches (organization_id, culture_id);
create index batch_stages_org_batch_idx on public.batch_stages (organization_id, batch_id, sequence_no);
create index events_org_batch_idx on public.events (organization_id, batch_id, occurred_at desc);

alter table public.batches enable row level security;
alter table public.batch_stages enable row level security;

create policy batches_select on public.batches for select using (private.is_org_member(organization_id));
create policy batches_insert on public.batches for insert with check (private.is_org_member(organization_id));
create policy batches_update on public.batches for update using (private.is_org_member(organization_id)) with check (private.is_org_member(organization_id));
create policy batches_delete on public.batches for delete using (private.is_org_member(organization_id));

create policy batch_stages_select on public.batch_stages for select using (private.is_org_member(organization_id));
create policy batch_stages_insert on public.batch_stages for insert with check (private.is_org_member(organization_id));
create policy batch_stages_update on public.batch_stages for update using (private.is_org_member(organization_id)) with check (private.is_org_member(organization_id));
create policy batch_stages_delete on public.batch_stages for delete using (private.is_org_member(organization_id));
