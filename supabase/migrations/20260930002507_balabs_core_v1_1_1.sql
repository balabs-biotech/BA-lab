create extension if not exists pgcrypto;
create schema if not exists private;

create type public.member_role as enum ('owner','admin','member','viewer');
create type public.material_state as enum ('active','archived','depleted','discarded');
create type public.quality_state as enum ('raw','controlled','validated','excluded');
create type public.evidence_level as enum ('L0','L1','L2','L3','L4','L5');
create type public.sharing_state as enum ('private','shareable','consented','withdrawn');
create type public.migration_status as enum ('pending','validated','migrated','merged','derived','deprecated','split','error');

create table public.organizations (id uuid primary key default gen_random_uuid(), code text not null unique, name text not null, created_at timestamptz not null default now());
create table public.organization_members (organization_id uuid not null references public.organizations(id) on delete cascade, user_id uuid not null references auth.users(id) on delete cascade, role public.member_role not null default 'member', created_at timestamptz not null default now(), primary key (organization_id,user_id));

create table public.organisms (id uuid primary key default gen_random_uuid(), scientific_name text not null unique, common_name text, taxonomy_source text, taxonomy_id text, created_at timestamptz not null default now());

create table public.strains (organization_id uuid not null references public.organizations(id) on delete cascade, id uuid not null default gen_random_uuid(), organism_id uuid not null references public.organisms(id), strain_code text not null, designation text, origin text, supplier text, source_description text, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), primary key (organization_id,id), unique(organization_id,strain_code));

create table public.material_types (code text primary key, label text not null, parent_code text references public.material_types(code));
create table public.culture_types (code text primary key, label text not null, parent_code text references public.culture_types(code));

create table public.locations (organization_id uuid not null references public.organizations(id) on delete cascade, id uuid not null default gen_random_uuid(), code text not null, name text not null, location_type text, parent_location_id uuid, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), primary key (organization_id,id), unique(organization_id,code), unique(organization_id,id), foreign key (organization_id,parent_location_id) references public.locations(organization_id,id) on delete restrict);
create table public.environments (organization_id uuid not null references public.organizations(id) on delete cascade, id uuid not null default gen_random_uuid(), location_id uuid, name text not null, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), primary key (organization_id,id), unique(organization_id,id), foreign key (organization_id,location_id) references public.locations(organization_id,id) on delete set null);

create table public.materials (organization_id uuid not null references public.organizations(id) on delete cascade, id uuid not null default gen_random_uuid(), material_code text not null, material_type text not null references public.material_types(code), strain_id uuid, parent_material_id uuid, state public.material_state not null default 'active', generation integer, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), primary key (organization_id,id), unique(organization_id,material_code), unique(organization_id,id), foreign key (organization_id,strain_id) references public.strains(organization_id,id) on delete restrict, foreign key (organization_id,parent_material_id) references public.materials(organization_id,id) on delete restrict, check (generation is null or generation >= 0), check (parent_material_id is null or parent_material_id <> id));

create table public.material_relationships (organization_id uuid not null references public.organizations(id) on delete cascade, id uuid not null default gen_random_uuid(), parent_material_id uuid not null, child_material_id uuid not null, relationship_type text not null, created_at timestamptz not null default now(), primary key (organization_id,id), foreign key (organization_id,parent_material_id) references public.materials(organization_id,id) on delete restrict, foreign key (organization_id,child_material_id) references public.materials(organization_id,id) on delete restrict, check (parent_material_id <> child_material_id), unique(organization_id,parent_material_id,child_material_id,relationship_type));

create table public.protocols (organization_id uuid not null references public.organizations(id) on delete cascade, id uuid not null default gen_random_uuid(), code text not null, name text not null, protocol_type text, description text, created_at timestamptz not null default now(), primary key (organization_id,id), unique(organization_id,code), unique(organization_id,id));
create table public.protocol_versions (organization_id uuid not null references public.organizations(id) on delete cascade, id uuid not null default gen_random_uuid(), protocol_id uuid not null, version text not null, content text, parameters jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), primary key (organization_id,id), unique(organization_id,protocol_id,version), foreign key (organization_id,protocol_id) references public.protocols(organization_id,id) on delete cascade);
create table public.formulations (organization_id uuid not null references public.organizations(id) on delete cascade, id uuid not null default gen_random_uuid(), code text not null, name text not null, components jsonb not null default '[]'::jsonb, created_at timestamptz not null default now(), primary key (organization_id,id), unique(organization_id,code), unique(organization_id,id));
create table public.media (organization_id uuid not null references public.organizations(id) on delete cascade, id uuid not null default gen_random_uuid(), code text not null, name text not null, formulation_id uuid, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), primary key (organization_id,id), unique(organization_id,code), unique(organization_id,id), foreign key (organization_id,formulation_id) references public.formulations(organization_id,id) on delete set null);

create table public.projects (organization_id uuid not null references public.organizations(id) on delete cascade, id uuid not null default gen_random_uuid(), code text not null, name text not null, description text, created_at timestamptz not null default now(), primary key (organization_id,id), unique(organization_id,code), unique(organization_id,id));
create table public.experiments (organization_id uuid not null references public.organizations(id) on delete cascade, id uuid not null default gen_random_uuid(), project_id uuid, code text not null, name text not null, design jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), primary key (organization_id,id), unique(organization_id,code), unique(organization_id,id), foreign key (organization_id,project_id) references public.projects(organization_id,id) on delete set null);
create table public.experimental_units (organization_id uuid not null references public.organizations(id) on delete cascade, id uuid not null default gen_random_uuid(), experiment_id uuid not null, unit_code text not null, replicate_no integer, treatment_code text, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), primary key (organization_id,id), unique(organization_id,experiment_id,unit_code), unique(organization_id,id), foreign key (organization_id,experiment_id) references public.experiments(organization_id,id) on delete cascade, check (replicate_no is null or replicate_no > 0));

create table public.cultures (organization_id uuid not null references public.organizations(id) on delete cascade, id uuid not null default gen_random_uuid(), code text not null, culture_type text not null references public.culture_types(code), material_id uuid not null, parent_culture_id uuid, experiment_id uuid, experimental_unit_id uuid, protocol_version_id uuid, environment_id uuid, started_at timestamptz, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), primary key (organization_id,id), unique(organization_id,code), unique(organization_id,id), foreign key (organization_id,material_id) references public.materials(organization_id,id) on delete restrict, foreign key (organization_id,parent_culture_id) references public.cultures(organization_id,id) on delete restrict, foreign key (organization_id,experiment_id) references public.experiments(organization_id,id) on delete set null, foreign key (organization_id,experimental_unit_id) references public.experimental_units(organization_id,id) on delete set null, foreign key (organization_id,protocol_version_id) references public.protocol_versions(organization_id,id) on delete set null, foreign key (organization_id,environment_id) references public.environments(organization_id,id) on delete set null, check (parent_culture_id is null or parent_culture_id <> id));

create table public.variables (code text primary key, label text not null, dimension text not null, canonical_unit_code text, description text);
create table public.units (code text primary key, label text not null, dimension text not null, factor numeric, offset_value numeric not null default 0, is_linear boolean not null default true);
alter table public.variables add constraint variables_canonical_unit_fk foreign key (canonical_unit_code) references public.units(code);

create table public.samples (organization_id uuid not null references public.organizations(id) on delete cascade, id uuid not null default gen_random_uuid(), code text not null, culture_id uuid, parent_sample_id uuid, collected_at timestamptz, material_id uuid, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), primary key (organization_id,id), unique(organization_id,code), unique(organization_id,id), foreign key (organization_id,culture_id) references public.cultures(organization_id,id) on delete set null, foreign key (organization_id,parent_sample_id) references public.samples(organization_id,id) on delete restrict, foreign key (organization_id,material_id) references public.materials(organization_id,id) on delete set null, check (parent_sample_id is null or parent_sample_id <> id));

create table public.events (organization_id uuid not null references public.organizations(id) on delete cascade, id uuid not null default gen_random_uuid(), event_type text not null, occurred_at timestamptz not null default now(), actor_user_id uuid references auth.users(id) on delete set null, culture_id uuid, material_id uuid, sample_id uuid, experimental_unit_id uuid, location_id uuid, environment_id uuid, payload jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), primary key (organization_id,id), unique(organization_id,id), foreign key (organization_id,culture_id) references public.cultures(organization_id,id) on delete cascade, foreign key (organization_id,material_id) references public.materials(organization_id,id) on delete cascade, foreign key (organization_id,sample_id) references public.samples(organization_id,id) on delete cascade, foreign key (organization_id,experimental_unit_id) references public.experimental_units(organization_id,id) on delete cascade, foreign key (organization_id,location_id) references public.locations(organization_id,id) on delete set null, foreign key (organization_id,environment_id) references public.environments(organization_id,id) on delete set null, check (num_nonnulls(culture_id,material_id,sample_id,experimental_unit_id) = 1));

create table public.results (organization_id uuid not null references public.organizations(id) on delete cascade, id uuid not null default gen_random_uuid(), experiment_id uuid, experimental_unit_id uuid, code text not null, result_type text, value jsonb not null default '{}'::jsonb, quality_state public.quality_state not null default 'raw', created_at timestamptz not null default now(), primary key (organization_id,id), unique(organization_id,code), unique(organization_id,id), foreign key (organization_id,experiment_id) references public.experiments(organization_id,id) on delete cascade, foreign key (organization_id,experimental_unit_id) references public.experimental_units(organization_id,id) on delete cascade);

create table public.measurements (organization_id uuid not null references public.organizations(id) on delete cascade, id uuid not null default gen_random_uuid(), variable_code text not null references public.variables(code), raw_value numeric not null, raw_unit_code text not null references public.units(code), normalized_value numeric, normalized_unit_code text references public.units(code), measured_at timestamptz not null default now(), method text, instrument text, quality_state public.quality_state not null default 'raw', exclusion_reason text, culture_id uuid, sample_id uuid, experimental_unit_id uuid, event_id uuid, result_id uuid, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), primary key (organization_id,id), unique(organization_id,id), foreign key (organization_id,culture_id) references public.cultures(organization_id,id) on delete cascade, foreign key (organization_id,sample_id) references public.samples(organization_id,id) on delete cascade, foreign key (organization_id,experimental_unit_id) references public.experimental_units(organization_id,id) on delete cascade, foreign key (organization_id,event_id) references public.events(organization_id,id) on delete set null, foreign key (organization_id,result_id) references public.results(organization_id,id) on delete set null, check (quality_state <> 'excluded' or exclusion_reason is not null), check (normalized_value is null or normalized_unit_code is not null));

create table public.observations (organization_id uuid not null references public.organizations(id) on delete cascade, id uuid not null default gen_random_uuid(), variable_code text not null references public.variables(code), value_text text not null, observed_at timestamptz not null default now(), culture_id uuid, sample_id uuid, experimental_unit_id uuid, event_id uuid, quality_state public.quality_state not null default 'raw', metadata jsonb not null default '{}'::jsonb, primary key (organization_id,id), unique(organization_id,id), foreign key (organization_id,culture_id) references public.cultures(organization_id,id) on delete cascade, foreign key (organization_id,sample_id) references public.samples(organization_id,id) on delete cascade, foreign key (organization_id,experimental_unit_id) references public.experimental_units(organization_id,id) on delete cascade, foreign key (organization_id,event_id) references public.events(organization_id,id) on delete set null);

create table public.analyses (organization_id uuid not null references public.organizations(id) on delete cascade, id uuid not null default gen_random_uuid(), experiment_id uuid, name text not null, method text, parameters jsonb not null default '{}'::jsonb, output jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), primary key (organization_id,id), unique(organization_id,id), foreign key (organization_id,experiment_id) references public.experiments(organization_id,id) on delete cascade);
create table public.claims (organization_id uuid not null references public.organizations(id) on delete cascade, id uuid not null default gen_random_uuid(), claim_text text not null, evidence_level public.evidence_level not null, subject_type text not null, subject_id uuid not null, created_at timestamptz not null default now(), primary key (organization_id,id), unique(organization_id,id));
create table public.evidence (organization_id uuid not null references public.organizations(id) on delete cascade, id uuid not null default gen_random_uuid(), claim_id uuid not null, evidence_type text not null, source_type text, source_id uuid, strength text, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), primary key (organization_id,id), unique(organization_id,id), foreign key (organization_id,claim_id) references public.claims(organization_id,id) on delete cascade);
create table public.provenance (organization_id uuid not null references public.organizations(id) on delete cascade, id uuid not null default gen_random_uuid(), target_type text not null, target_id uuid not null, action text not null, actor_user_id uuid references auth.users(id) on delete set null, occurred_at timestamptz not null default now(), source_type text, source_id text, method text, context jsonb not null default '{}'::jsonb, primary key (organization_id,id));
create table public.sharing_consents (organization_id uuid not null references public.organizations(id) on delete cascade, id uuid not null default gen_random_uuid(), scope_type text not null, scope_id uuid not null, state public.sharing_state not null default 'private', consented_by uuid references auth.users(id) on delete set null, consented_at timestamptz, withdrawn_at timestamptz, deidentification_profile text, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), primary key (organization_id,id));
create table public.commons_datasets (id uuid primary key default gen_random_uuid(), code text not null unique, name text not null, version text not null, status text not null default 'draft', description text, source_policy jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
create table public.notion_migration_rows (id uuid primary key default gen_random_uuid(), source_database text not null, notion_page_id text not null, source_last_edited_at timestamptz, target_table text, target_id uuid, status public.migration_status not null default 'pending', error_code text, error_detail text, migrated_at timestamptz, source_snapshot jsonb not null default '{}'::jsonb, unique(source_database,notion_page_id));

create index strains_org_organism_idx on public.strains(organization_id,organism_id);
create index materials_org_strain_idx on public.materials(organization_id,strain_id);
create index materials_org_parent_idx on public.materials(organization_id,parent_material_id);
create index cultures_org_material_idx on public.cultures(organization_id,material_id);
create index cultures_org_experiment_idx on public.cultures(organization_id,experiment_id);
create index events_org_occurred_idx on public.events(organization_id,occurred_at desc);
create index measurements_org_variable_time_idx on public.measurements(organization_id,variable_code,measured_at desc);
create index measurements_org_culture_idx on public.measurements(organization_id,culture_id);
create index measurements_org_sample_idx on public.measurements(organization_id,sample_id);
create index claims_org_subject_idx on public.claims(organization_id,subject_type,subject_id);
create index provenance_org_target_idx on public.provenance(organization_id,target_type,target_id);

create or replace function private.is_org_member(p_org uuid) returns boolean language sql stable security definer set search_path = pg_catalog, public as $$ select exists (select 1 from public.organization_members om where om.organization_id=p_org and om.user_id=auth.uid()); $$;
create or replace function private.is_org_admin(p_org uuid) returns boolean language sql stable security definer set search_path = pg_catalog, public as $$ select exists (select 1 from public.organization_members om where om.organization_id=p_org and om.user_id=auth.uid() and om.role in ('owner','admin')); $$;
revoke all on function private.is_org_member(uuid) from public;
revoke all on function private.is_org_admin(uuid) from public;
grant execute on function private.is_org_member(uuid) to authenticated;
grant execute on function private.is_org_admin(uuid) to authenticated;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
create policy organizations_select on public.organizations for select to authenticated using (private.is_org_member(id));
create policy organizations_insert on public.organizations for insert to authenticated with check (true);
create policy organizations_update on public.organizations for update to authenticated using (private.is_org_admin(id)) with check (private.is_org_admin(id));
create policy members_select on public.organization_members for select to authenticated using (private.is_org_member(organization_id));
create policy members_insert on public.organization_members for insert to authenticated with check (private.is_org_admin(organization_id));
create policy members_update on public.organization_members for update to authenticated using (private.is_org_admin(organization_id)) with check (private.is_org_admin(organization_id));
create policy members_delete on public.organization_members for delete to authenticated using (private.is_org_admin(organization_id));

do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname='public' and tablename not in ('organizations','organization_members','organisms','material_types','culture_types','variables','units','commons_datasets','notion_migration_rows')
  loop
    execute format('alter table public.%I enable row level security', r.tablename);
    execute format('create policy %I_select on public.%I for select to authenticated using (private.is_org_member(organization_id))', r.tablename, r.tablename);
    execute format('create policy %I_insert on public.%I for insert to authenticated with check (private.is_org_member(organization_id))', r.tablename, r.tablename);
    execute format('create policy %I_update on public.%I for update to authenticated using (private.is_org_member(organization_id)) with check (private.is_org_member(organization_id))', r.tablename, r.tablename);
    execute format('create policy %I_delete on public.%I for delete to authenticated using (private.is_org_member(organization_id))', r.tablename, r.tablename);
  end loop;
end $$;

alter table public.organisms enable row level security;
alter table public.material_types enable row level security;
alter table public.culture_types enable row level security;
alter table public.variables enable row level security;
alter table public.units enable row level security;
alter table public.commons_datasets enable row level security;
alter table public.notion_migration_rows enable row level security;
create policy organisms_select on public.organisms for select to authenticated using (true);
create policy material_types_select on public.material_types for select to authenticated using (true);
create policy culture_types_select on public.culture_types for select to authenticated using (true);
create policy variables_select on public.variables for select to authenticated using (true);
create policy units_select on public.units for select to authenticated using (true);
create policy commons_select on public.commons_datasets for select to authenticated using (true);
create policy migration_select on public.notion_migration_rows for select to authenticated using (false);
create policy migration_insert on public.notion_migration_rows for insert to authenticated with check (false);

insert into public.units(code,label,dimension,factor,offset_value,is_linear) values
('degC','degree Celsius','temperature',1,0,true),('K','kelvin','temperature',1,0,true),('pH','pH','pH',1,0,false),('dimensionless','dimensionless','dimensionless',1,0,true),('1/h','per hour','inverse_time',1,0,true),('1/min','per minute','inverse_time',1,0,true),('%','percent','fraction',0.01,0,true),('g','gram','mass',1,0,true),('mg','milligram','mass',0.001,0,true),('ug','microgram','mass',0.000001,0,true),('kg','kilogram','mass',1000,0,true),('uL','microliter','volume',0.001,0,true),('mL','milliliter','volume',1,0,true),('L','liter','volume',1000,0,true),('s','second','time',0.000277777777777778,0,true),('min','minute','time',0.0166666666666667,0,true),('h','hour','time',1,0,true),('mm','millimeter','length',1,0,true),('cm','centimeter','length',10,0,true),('count','count','count',1,0,true),('CFU','colony forming unit','count',1,0,true),('cells','cells','count',1,0,true),('CFU/mL','CFU per mL','count_concentration',1,0,true),('cells/mL','cells per mL','count_concentration',1,0,true)
on conflict (code) do nothing;
insert into public.variables(code,label,dimension,canonical_unit_code,description) values
('temperature','Temperature','temperature','degC','Thermal measurement'),('ph','pH','pH','pH','Acidity/alkalinity; non-linear scale'),('od600','Optical density at 600 nm','dimensionless','dimensionless','Instrumental optical density'),('growth_rate','Growth rate','inverse_time','1/h','Specific growth rate'),('viability','Viability','fraction','%','Viability percentage'),('volume','Volume','volume','mL','Liquid volume'),('fresh_mass','Fresh mass','mass','g','Fresh mass'),('dry_mass','Dry mass','mass','g','Dry mass'),('wet_biomass','Wet biomass','mass','g','Wet biomass'),('dry_biomass','Dry biomass','mass','g','Dry biomass'),('incubation_time','Incubation time','time','h','Incubation duration'),('generation_time','Generation time','time','h','Generation duration'),('root_length','Root length','length','mm','Root length'),('shoot_length','Shoot length','length','mm','Shoot length'),('colony_count','Colony count','count','count','Colonies counted'),('cell_count','Cell count','count','cells','Cells counted'),('cell_count_per_ml','Cell concentration','count_concentration','cells/mL','Cells per milliliter'),('cfu','CFU count','count','CFU','Colony forming units'),('cfu_per_ml','CFU concentration','count_concentration','CFU/mL','Colony forming units per milliliter')
on conflict (code) do nothing;
insert into public.material_types(code,label,parent_code) values
('biological_entity','Biological entity',null),('organism','Organism','biological_entity'),('strain','Strain','biological_entity'),('isolate','Isolate','biological_entity'),('cell_line','Cell line','biological_entity'),('tissue','Tissue','biological_entity'),('plant','Plant','biological_entity'),('population','Population','biological_entity'),('culture_derived','Culture-derived',null),('biomass','Biomass','culture_derived'),('colony','Colony','culture_derived'),('mycelium','Mycelium','culture_derived'),('supernatant','Supernatant','culture_derived'),('pellet','Pellet','culture_derived'),('analytical','Analytical',null),('sample','Sample','analytical'),('extract','Extract','analytical'),('dna','DNA','analytical'),('rna','RNA','analytical'),('lysate','Lysate','analytical'),('other','Other',null)
on conflict (code) do nothing;
insert into public.culture_types(code,label,parent_code) values
('solid','Solid',null),('agar','Agar','solid'),('plate','Plate','solid'),('slant','Slant','solid'),('liquid','Liquid',null),('broth','Broth','liquid'),('flask','Flask','liquid'),('bioreactor','Bioreactor','liquid'),('other_liquid','Other liquid','liquid'),('tissue','Tissue',null),('explant','Explant','tissue'),('callus','Callus','tissue'),('organ_culture','Organ culture','tissue'),('micropropagation','Micropropagation','tissue'),('cellular','Cellular',null),('2d','2D','cellular'),('3d','3D','cellular'),('suspension','Suspension','cellular'),('organoid','Organoid','cellular'),('fermentation','Fermentation',null),('other','Other',null)
on conflict (code) do nothing;

create or replace function private.validate_measurement() returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare vdim text; udim text; cdim text;
begin
  select dimension into vdim from public.variables where code=new.variable_code;
  select dimension into udim from public.units where code=new.raw_unit_code;
  if vdim is null or udim is null or vdim <> udim then raise exception 'Measurement dimension mismatch: variable %, unit %',new.variable_code,new.raw_unit_code; end if;
  if new.normalized_unit_code is not null then
    select dimension into cdim from public.units where code=new.normalized_unit_code;
    if cdim is null or cdim <> vdim then raise exception 'Normalized unit dimension mismatch'; end if;
  end if;
  if new.quality_state='excluded' and new.exclusion_reason is null then raise exception 'Excluded measurements require exclusion_reason'; end if;
  return new;
end $$;
create trigger measurements_validate before insert or update on public.measurements for each row execute function private.validate_measurement();

create or replace function private.prevent_material_cycle() returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if new.parent_material_id is null then return new; end if;
  if exists (with recursive chain(id) as (select new.parent_material_id union all select m.parent_material_id from public.materials m join chain c on m.organization_id=new.organization_id and m.id=c.id where m.parent_material_id is not null) select 1 from chain where id=new.id) then raise exception 'Material lineage cycle detected'; end if;
  return new;
end $$;
create trigger materials_no_cycle before insert or update of parent_material_id on public.materials for each row execute function private.prevent_material_cycle();

create or replace function private.prevent_culture_cycle() returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if new.parent_culture_id is null then return new; end if;
  if exists (with recursive chain(id) as (select new.parent_culture_id union all select c.parent_culture_id from public.cultures c join chain x on c.organization_id=new.organization_id and c.id=x.id where c.parent_culture_id is not null) select 1 from chain where id=new.id) then raise exception 'Culture lineage cycle detected'; end if;
  return new;
end $$;
create trigger cultures_no_cycle before insert or update of parent_culture_id on public.cultures for each row execute function private.prevent_culture_cycle();

create or replace function private.enforce_measurement_context() returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin if num_nonnulls(new.culture_id,new.sample_id,new.experimental_unit_id,new.event_id) < 1 then raise exception 'Measurement must reference at least one context object'; end if; return new; end $$;
create trigger measurements_context before insert or update on public.measurements for each row execute function private.enforce_measurement_context();

create or replace function private.enforce_event_actor() returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin if new.actor_user_id is not null and not exists (select 1 from public.organization_members om where om.organization_id=new.organization_id and om.user_id=new.actor_user_id) then raise exception 'Event actor is not a member of the organization'; end if; return new; end $$;
create trigger events_actor before insert or update on public.events for each row execute function private.enforce_event_actor();
