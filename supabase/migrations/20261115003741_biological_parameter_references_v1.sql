
create table if not exists public.biological_parameter_references (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 biological_profile_id uuid not null,
 parameter_code text not null,
 parameter_label text,
 minimum_value numeric,
 maximum_value numeric,
 unit_code text not null,
 severity text not null default 'warning',
 evidence jsonb not null default '[]'::jsonb,
 validation_status text not null default 'draft',
 valid_from date not null default current_date,
 valid_to date,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint biological_parameter_references_profile_fk
   foreign key (organization_id,biological_profile_id)
   references public.biological_strain_profiles(organization_id,id) on delete cascade,
 constraint biological_parameter_references_bounds_check
   check (minimum_value is not null or maximum_value is not null),
 constraint biological_parameter_references_order_check
   check (minimum_value is null or maximum_value is null or minimum_value <= maximum_value),
 constraint biological_parameter_references_severity_check
   check (severity in ('information','warning','critical')),
 constraint biological_parameter_references_evidence_check
   check (jsonb_typeof(evidence)='array'),
 constraint biological_parameter_references_status_check
   check (validation_status in ('draft','review','validated','retired')),
 constraint biological_parameter_references_validity_check
   check (valid_to is null or valid_to >= valid_from)
);
create index if not exists biological_parameter_references_lookup_idx
 on public.biological_parameter_references
 (organization_id,biological_profile_id,parameter_code,validation_status,valid_from,valid_to);
alter table public.biological_parameter_references enable row level security;
drop policy if exists biological_parameter_references_select on public.biological_parameter_references;
create policy biological_parameter_references_select on public.biological_parameter_references
 for select to authenticated using (private.is_org_member(organization_id));
drop policy if exists biological_parameter_references_insert on public.biological_parameter_references;
create policy biological_parameter_references_insert on public.biological_parameter_references
 for insert to authenticated with check (private.is_org_writer(organization_id));
drop policy if exists biological_parameter_references_update on public.biological_parameter_references;
create policy biological_parameter_references_update on public.biological_parameter_references
 for update to authenticated using (private.is_org_writer(organization_id))
 with check (private.is_org_writer(organization_id));
drop policy if exists biological_parameter_references_delete on public.biological_parameter_references;
create policy biological_parameter_references_delete on public.biological_parameter_references
 for delete to authenticated using (private.is_org_writer(organization_id));
grant select,insert,update,delete on public.biological_parameter_references to authenticated;
;
