-- Extend the event's single biological-anchor invariant to Agritech plant cultures.
-- The original events check predates plant_cultures and otherwise rejects events
-- created by the manual plant measurement/observation workflows.
do $$
declare
  v_constraint record;
begin
  for v_constraint in
    select conname
    from pg_constraint
    where conrelid = 'public.events'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%num_nonnulls%'
      and pg_get_constraintdef(oid) ilike '%culture_id%'
  loop
    execute format('alter table public.events drop constraint %I', v_constraint.conname);
  end loop;
end;
$$;

alter table public.events
  add constraint events_single_biological_anchor_check
  check (num_nonnulls(
    culture_id,
    material_id,
    sample_id,
    experimental_unit_id,
    plant_culture_id
  ) = 1);
