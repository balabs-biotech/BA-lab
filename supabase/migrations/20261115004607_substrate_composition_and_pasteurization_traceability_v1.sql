
create table if not exists public.batch_substrate_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  batch_id uuid not null,
  formulation_id uuid,
  substrate_family text not null default 'lignocellulosic',
  substrate_label text,
  target_moisture_pct numeric(6,3),
  measured_moisture_pct numeric(6,3),
  initial_dry_mass_kg numeric(12,3),
  initial_wet_mass_kg numeric(12,3),
  final_wet_mass_kg numeric(12,3),
  ph_value numeric(5,2),
  ec_ms_cm numeric(8,3),
  supplementation jsonb not null default '{}'::jsonb,
  preparation_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint batch_substrate_profiles_batch_unique unique (organization_id,batch_id),
  constraint batch_substrate_profiles_org_id_unique unique (organization_id,id),
  constraint batch_substrate_profiles_batch_fk foreign key (organization_id,batch_id) references public.batches(organization_id,id) on delete cascade,
  constraint batch_substrate_profiles_formulation_fk foreign key (organization_id,formulation_id) references public.formulations(organization_id,id) on delete set null,
  constraint batch_substrate_profiles_moisture_check check ((target_moisture_pct is null or target_moisture_pct between 0 and 100) and (measured_moisture_pct is null or measured_moisture_pct between 0 and 100)),
  constraint batch_substrate_profiles_mass_check check ((initial_dry_mass_kg is null or initial_dry_mass_kg >= 0) and (initial_wet_mass_kg is null or initial_wet_mass_kg >= 0) and (final_wet_mass_kg is null or final_wet_mass_kg >= 0))
);

create table if not exists public.batch_substrate_components (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  substrate_profile_id uuid not null,
  material_id uuid,
  component_code text,
  component_name text not null,
  component_role text not null default 'base',
  quantity numeric(14,4) not null,
  unit_code text not null,
  percentage numeric(7,4),
  percentage_basis text not null default 'dry_mass',
  moisture_pct numeric(6,3),
  supplier_lot text,
  notes text,
  sequence_no integer not null default 1,
  created_at timestamptz not null default now(),
  constraint batch_substrate_components_profile_fk foreign key (organization_id,substrate_profile_id) references public.batch_substrate_profiles(organization_id,id) on delete cascade,
  constraint batch_substrate_components_material_fk foreign key (organization_id,material_id) references public.materials(organization_id,id) on delete set null,
  constraint batch_substrate_components_quantity_check check (quantity >= 0),
  constraint batch_substrate_components_percentage_check check (percentage is null or percentage between 0 and 100),
  constraint batch_substrate_components_moisture_check check (moisture_pct is null or moisture_pct between 0 and 100),
  constraint batch_substrate_components_role_check check (component_role in ('base','supplement','mineral','buffer','structurant','inoculum','other')),
  constraint batch_substrate_components_basis_check check (percentage_basis in ('dry_mass','wet_mass','volume','mass_as_received'))
);

create table if not exists public.substrate_treatment_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  substrate_profile_id uuid not null,
  treatment_method text not null,
  treatment_label text,
  equipment_label text,
  batch_load_mass_kg numeric(12,3),
  water_volume_l numeric(12,3),
  water_to_substrate_ratio numeric(10,4),
  target_temperature_c numeric(6,2),
  measured_core_temperature_c numeric(6,2),
  hold_duration_minutes integer,
  pressure_kpa numeric(8,2),
  ph_solution numeric(5,2),
  started_at timestamptz,
  reached_target_at timestamptz,
  completed_at timestamptz,
  cooled_to_temperature_c numeric(6,2),
  cooling_completed_at timestamptz,
  treatment_status text not null default 'planned',
  operator_notes text,
  deviations jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint substrate_treatment_runs_org_id_unique unique (organization_id,id),
  constraint substrate_treatment_runs_profile_fk foreign key (organization_id,substrate_profile_id) references public.batch_substrate_profiles(organization_id,id) on delete cascade,
  constraint substrate_treatment_runs_method_check check (treatment_method in ('hot_water','atmospheric_steam','pressurized_steam','alkaline_lime','fermentation','cold_pasteurization','other')),
  constraint substrate_treatment_runs_status_check check (treatment_status in ('planned','in_progress','completed','deviation','cancelled')),
  constraint substrate_treatment_runs_time_check check ((completed_at is null or started_at is null or completed_at >= started_at) and (reached_target_at is null or started_at is null or reached_target_at >= started_at) and (cooling_completed_at is null or completed_at is null or cooling_completed_at >= completed_at)),
  constraint substrate_treatment_runs_values_check check ((batch_load_mass_kg is null or batch_load_mass_kg >= 0) and (water_volume_l is null or water_volume_l >= 0) and (hold_duration_minutes is null or hold_duration_minutes >= 0) and (water_to_substrate_ratio is null or water_to_substrate_ratio >= 0))
);

create table if not exists public.substrate_treatment_readings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  treatment_run_id uuid not null,
  measured_at timestamptz not null,
  measurement_point text not null default 'core',
  temperature_c numeric(6,2),
  pressure_kpa numeric(8,2),
  ph_value numeric(5,2),
  note text,
  created_at timestamptz not null default now(),
  constraint substrate_treatment_readings_run_fk foreign key (organization_id,treatment_run_id) references public.substrate_treatment_runs(organization_id,id) on delete cascade
);

create index if not exists batch_substrate_components_profile_idx on public.batch_substrate_components(organization_id,substrate_profile_id,sequence_no);
create index if not exists substrate_treatment_runs_profile_idx on public.substrate_treatment_runs(organization_id,substrate_profile_id,started_at desc);
create index if not exists substrate_treatment_readings_run_time_idx on public.substrate_treatment_readings(organization_id,treatment_run_id,measured_at);

alter table public.batch_substrate_profiles enable row level security;
alter table public.batch_substrate_components enable row level security;
alter table public.substrate_treatment_runs enable row level security;
alter table public.substrate_treatment_readings enable row level security;

create policy batch_substrate_profiles_select on public.batch_substrate_profiles for select to authenticated using (private.is_org_member(organization_id));
create policy batch_substrate_profiles_insert on public.batch_substrate_profiles for insert to authenticated with check (private.is_org_writer(organization_id));
create policy batch_substrate_profiles_update on public.batch_substrate_profiles for update to authenticated using (private.is_org_writer(organization_id)) with check (private.is_org_writer(organization_id));
create policy batch_substrate_profiles_delete on public.batch_substrate_profiles for delete to authenticated using (private.is_org_writer(organization_id));
create policy batch_substrate_components_select on public.batch_substrate_components for select to authenticated using (private.is_org_member(organization_id));
create policy batch_substrate_components_insert on public.batch_substrate_components for insert to authenticated with check (private.is_org_writer(organization_id));
create policy batch_substrate_components_update on public.batch_substrate_components for update to authenticated using (private.is_org_writer(organization_id)) with check (private.is_org_writer(organization_id));
create policy batch_substrate_components_delete on public.batch_substrate_components for delete to authenticated using (private.is_org_writer(organization_id));
create policy substrate_treatment_runs_select on public.substrate_treatment_runs for select to authenticated using (private.is_org_member(organization_id));
create policy substrate_treatment_runs_insert on public.substrate_treatment_runs for insert to authenticated with check (private.is_org_writer(organization_id));
create policy substrate_treatment_runs_update on public.substrate_treatment_runs for update to authenticated using (private.is_org_writer(organization_id)) with check (private.is_org_writer(organization_id));
create policy substrate_treatment_runs_delete on public.substrate_treatment_runs for delete to authenticated using (private.is_org_writer(organization_id));
create policy substrate_treatment_readings_select on public.substrate_treatment_readings for select to authenticated using (private.is_org_member(organization_id));
create policy substrate_treatment_readings_insert on public.substrate_treatment_readings for insert to authenticated with check (private.is_org_writer(organization_id));
create policy substrate_treatment_readings_update on public.substrate_treatment_readings for update to authenticated using (private.is_org_writer(organization_id)) with check (private.is_org_writer(organization_id));
create policy substrate_treatment_readings_delete on public.substrate_treatment_readings for delete to authenticated using (private.is_org_writer(organization_id));

grant select,insert,update,delete on public.batch_substrate_profiles, public.batch_substrate_components, public.substrate_treatment_runs, public.substrate_treatment_readings to authenticated, service_role;
;
