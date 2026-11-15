
alter table public.batch_substrate_profiles
  drop constraint if exists batch_substrate_profiles_formulation_fk;
alter table public.batch_substrate_profiles
  add constraint batch_substrate_profiles_formulation_fk
  foreign key (organization_id,formulation_id)
  references public.formulations(organization_id,id) on delete restrict;

alter table public.batch_substrate_components
  drop constraint if exists batch_substrate_components_material_fk;
alter table public.batch_substrate_components
  add constraint batch_substrate_components_material_fk
  foreign key (organization_id,material_id)
  references public.materials(organization_id,id) on delete restrict;
;
