alter table public.batches drop constraint batches_stage_check;
alter table public.batches add constraint batches_stage_check check (
  current_stage is null or current_stage in (
    'preparation','sterilization','inoculation','incubation',
    'cultivation','harvest','formulation','packaging','qc','release'
  )
);

alter table public.batch_stages drop constraint batch_stages_stage_check;
alter table public.batch_stages add constraint batch_stages_stage_check check (
  stage_code in (
    'preparation','sterilization','inoculation','incubation',
    'cultivation','harvest','formulation','packaging','qc','release'
  )
);

create index batches_org_protocol_idx on public.batches (organization_id, protocol_version_id);
create index batches_org_location_idx on public.batches (organization_id, location_id);
create index batches_org_environment_idx on public.batches (organization_id, environment_id);
create index batches_quantity_unit_idx on public.batches (quantity_unit_code);
