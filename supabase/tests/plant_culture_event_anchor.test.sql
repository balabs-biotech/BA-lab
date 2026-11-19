-- Contract test: plant culture is a supported biological event anchor,
-- while exactly-one-anchor semantics remain enforced.
do $$
declare
  v_definition text;
begin
  select pg_get_constraintdef(oid)
    into v_definition
  from pg_constraint
  where conrelid = 'public.events'::regclass
    and conname = 'events_single_biological_anchor_check'
    and contype = 'c';

  if v_definition is null then
    raise exception 'events_single_biological_anchor_check is missing';
  end if;

  if v_definition not ilike '%plant_culture_id%'
     or v_definition not ilike '%num_nonnulls%'
     or v_definition not ilike '%= 1%' then
    raise exception 'event biological-anchor invariant does not include plant cultures: %', v_definition;
  end if;
end;
$$;
