
alter table public.biological_strain_profiles
  add column if not exists strain_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='biological_strain_profiles_strain_org_fk'
      and conrelid='public.biological_strain_profiles'::regclass
  ) then
    alter table public.biological_strain_profiles
      add constraint biological_strain_profiles_strain_org_fk
      foreign key (organization_id,strain_id)
      references public.strains(organization_id,id)
      on delete set null (strain_id);
  end if;
end $$;

create index if not exists biological_strain_profiles_strain_idx
on public.biological_strain_profiles(organization_id,strain_id)
where strain_id is not null;

insert into public.biological_strain_profiles
 (organization_id,strain_id,profile_code,profile_version,scientific_name,strain_code,strain_name,
  lifecycle_stage,parameter_ranges,evidence,validation_status,validation_notes)
select s.organization_id,s.id,
       'strain.'||lower(regexp_replace(s.strain_code,'[^a-zA-Z0-9]+','-','g'))||'.reference-pending',
       '0.1.0',o.scientific_name,s.strain_code,s.designation,
       'reference_pending','{}'::jsonb,'[]'::jsonb,'draft',
       'Identity linked to the strain registry. Biological ranges and stage-specific evidence not yet reviewed; not eligible for automated threshold comparison.'
from public.strains s
join public.organisms o on o.id=s.organism_id
where s.organization_id='9fe4000d-7ca9-477a-90fd-6f3f0af96cca'
on conflict (organization_id,profile_code,profile_version) do nothing;
;
