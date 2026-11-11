-- Structural and privilege contract for persisted biological signals.
\set ON_ERROR_STOP on

do $$
declare
  v_signal_table oid := to_regclass('public.biological_signals');
  v_context_table oid := to_regclass('public.biological_contexts');
  v_evidence_table oid := to_regclass('public.biological_signal_evidence');
  v_constraint text;
  v_evidence_trigger_definition text;
begin
  if v_signal_table is null or v_context_table is null then
    raise exception 'FAIL: biological signal/context tables are missing';
  end if;

  if not (
    select relrowsecurity
      from pg_class
     where oid = v_signal_table
  ) then
    raise exception 'FAIL: biological_signals must have RLS enabled';
  end if;

  if not exists (
    select 1
      from pg_index i
     where i.indrelid = v_context_table
       and i.indisunique
       and pg_get_indexdef(i.indexrelid) like
         '%(organization_id, id, environment_id, domain)%'
  ) then
    raise exception 'FAIL: tenant/context/environment/domain key is missing';
  end if;

  select pg_get_constraintdef(c.oid)
    into v_constraint
    from pg_constraint c
   where c.conrelid = v_signal_table
     and c.conname = 'biological_signals_context_fk';

  if v_constraint is null or v_constraint not like
    '%FOREIGN KEY (organization_id, biological_context_id, environment_id, domain)%' then
    raise exception 'FAIL: biological signal context FK does not bind tenant, context, environment and domain';
  end if;

  select pg_get_constraintdef(c.oid)
    into v_constraint
    from pg_constraint c
   where c.conrelid = v_signal_table
     and c.conname = 'biological_signals_source_analysis_fk';

  if v_constraint is null or v_constraint not like
    '%FOREIGN KEY (organization_id, source_analysis_id)%' then
    raise exception 'FAIL: biological signal source analysis FK is missing';
  end if;

  if not has_table_privilege('authenticated', 'public.biological_signals', 'SELECT')
     or has_table_privilege('authenticated', 'public.biological_signals', 'INSERT')
     or has_table_privilege('authenticated', 'public.biological_signals', 'UPDATE')
     or has_table_privilege('authenticated', 'public.biological_signals', 'DELETE') then
    raise exception 'FAIL: authenticated signal grants must remain read-only';
  end if;

  if has_table_privilege('anon', 'public.biological_signals', 'SELECT')
     or has_table_privilege('anon', 'public.biological_signals', 'INSERT') then
    raise exception 'FAIL: anonymous signal access must be denied';
  end if;

  if not has_table_privilege('service_role', 'public.biological_signals', 'INSERT')
     or not has_table_privilege('service_role', 'public.biological_signals', 'UPDATE') then
    raise exception 'FAIL: trusted engine persistence grants are missing';
  end if;

  if v_evidence_table is null or not (
    select relrowsecurity
      from pg_class
     where oid = v_evidence_table
  ) then
    raise exception 'FAIL: normalized signal-observation evidence table or RLS is missing';
  end if;

  select pg_get_constraintdef(c.oid)
    into v_constraint
    from pg_constraint c
   where c.conrelid = v_evidence_table
     and c.conname = 'biological_signal_evidence_environmental_observation_fk';

  if v_constraint is null or v_constraint not like
    '%FOREIGN KEY (organization_id, environmental_observation_id) REFERENCES public.environmental_observations(organization_id, id)%' then
    raise exception 'FAIL: climate signal evidence must enforce tenant-scoped environmental observation references';
  end if;

  select pg_get_constraintdef(c.oid)
    into v_constraint
    from pg_constraint c
   where c.conrelid = v_evidence_table
     and c.conname = 'biological_signal_evidence_measurement_fk';

  if v_constraint is null or v_constraint not like
    '%FOREIGN KEY (organization_id, measurement_id) REFERENCES public.measurements(organization_id, id)%' then
    raise exception 'FAIL: IoT signal evidence must enforce tenant-scoped measurement references';
  end if;

  if not has_table_privilege('authenticated', 'public.biological_signal_evidence', 'SELECT')
     or has_table_privilege('authenticated', 'public.biological_signal_evidence', 'INSERT')
     or has_table_privilege('authenticated', 'public.biological_signal_evidence', 'DELETE') then
    raise exception 'FAIL: normalized signal evidence must be read-only to authenticated users';
  end if;

  if not has_table_privilege('service_role', 'public.biological_signal_evidence', 'INSERT') then
    raise exception 'FAIL: trusted signal evidence insertion grant is missing';
  end if;

  if not exists (
    select 1
      from pg_trigger
     where tgrelid = v_signal_table
       and tgname = 'biological_signals_link_evidence'
       and not tgisinternal
  ) then
    raise exception 'FAIL: signal observation provenance trigger is missing';
  end if;

  select pg_get_functiondef(tg.tgfoid)
    into v_evidence_trigger_definition
    from pg_trigger tg
   where tg.tgrelid = v_signal_table
     and tg.tgname = 'biological_signals_link_evidence'
     and not tg.tgisinternal;

  if position('environmental_daily' in v_evidence_trigger_definition) = 0
     or position('sensor_series' in v_evidence_trigger_definition) = 0
     or position('sensor_temporal' in v_evidence_trigger_definition) = 0
     or position('environmental_observation_id' in v_evidence_trigger_definition) = 0
     or position('measurement_id' in v_evidence_trigger_definition) = 0 then
    raise exception 'FAIL: signal evidence trigger must route climate and IoT evidence to their correct source tables';
  end if;
end
$$;

select 'PASS: biological signal persistence structure and grants' as result;
