-- Protège le workflow Batch Tracker contre les écritures directes.
--
-- Constat : les politiques RLS de batches / batch_stages / batch_qc_checks ne contrôlent que
-- l'appartenance à l'organisation. Un membre pouvait donc, via l'API, passer un batch à
-- 'released', modifier ses étapes ou supprimer des contrôles QC en échec, sans passer par
-- advance_batch_stage / release_batch. De plus advance_batch_stage pouvait rétrograder un
-- batch déjà libéré à 'completed'.
--
-- Correctifs :
--  1. Les trois RPC du workflow deviennent SECURITY DEFINER (propriétaire postgres). Elles
--     vérifient déjà l'appartenance à l'organisation ; l'existence d'un batch d'une autre
--     organisation n'est plus révélée (même message « batch not found »).
--  2. Des triggers réservent les colonnes de workflow à ces RPC (current_user = postgres) et
--     aux rôles d'administration / service_role. Les membres gardent le droit de modifier les
--     champs non critiques (nom, notes, quantités...) et de saisir les contrôles QC tant que le
--     batch n'est pas clos ; checked_by / checked_at sont posés côté serveur.
--  3. advance_batch_stage refuse un batch clos.
--  4. EXECUTE retiré à anon / PUBLIC sur les trois RPC (authenticated et service_role conservés).
--
-- Rollback (ne supprime aucune donnée) :
--   drop trigger if exists batches_guard on public.batches;
--   drop trigger if exists batch_stages_guard on public.batch_stages;
--   drop trigger if exists batch_qc_checks_guard on public.batch_qc_checks;
--   drop function if exists private.guard_batches(), private.guard_batch_stages(), private.guard_batch_qc_checks();
--   alter function public.create_batch_with_stages(uuid,text,text,text,uuid,uuid,uuid,uuid,uuid,timestamptz,numeric,text,text[]) security invoker set search_path = public;
--   alter function public.advance_batch_stage(uuid,text) security invoker set search_path = public;
--   alter function public.release_batch(uuid) security invoker set search_path = public;
--   grant execute on function public.create_batch_with_stages(uuid,text,text,text,uuid,uuid,uuid,uuid,uuid,timestamptz,numeric,text,text[]), public.advance_batch_stage(uuid,text), public.release_batch(uuid) to anon;
--   (le garde « batch clos » de advance_batch_stage peut rester : il ne fait que refuser un état invalide.)

-- ---------------------------------------------------------------------------
-- 1. Triggers de garde
-- ---------------------------------------------------------------------------

create or replace function private.guard_batches()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if current_user in ('postgres', 'supabase_admin', 'service_role') then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    raise exception 'batches are created through create_batch_with_stages' using errcode = '42501';
  elsif tg_op = 'DELETE' then
    if old.status <> 'planned' then
      raise exception 'only planned batches can be deleted' using errcode = '42501';
    end if;
    return old;
  end if;

  if new.id is distinct from old.id
     or new.organization_id is distinct from old.organization_id
     or new.batch_type is distinct from old.batch_type
     or new.status is distinct from old.status
     or new.current_stage is distinct from old.current_stage
     or new.started_at is distinct from old.started_at
     or new.completed_at is distinct from old.completed_at then
    raise exception 'batch workflow columns are managed by the batch workflow functions' using errcode = '42501';
  end if;
  return new;
end
$$;

create or replace function private.guard_batch_stages()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_status text;
begin
  if current_user in ('postgres', 'supabase_admin', 'service_role') then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    raise exception 'batch stages are created through create_batch_with_stages' using errcode = '42501';
  elsif tg_op = 'DELETE' then
    -- Suppression en cascade d'un batch supprimé : le parent n'existe plus.
    select b.status into v_status from public.batches b
     where b.organization_id = old.organization_id and b.id = old.batch_id;
    if found and v_status <> 'planned' then
      raise exception 'stages of a started batch cannot be deleted' using errcode = '42501';
    end if;
    return old;
  end if;

  if new.id is distinct from old.id
     or new.organization_id is distinct from old.organization_id
     or new.batch_id is distinct from old.batch_id
     or new.stage_code is distinct from old.stage_code
     or new.sequence_no is distinct from old.sequence_no
     or new.status is distinct from old.status
     or new.started_at is distinct from old.started_at
     or new.completed_at is distinct from old.completed_at then
    raise exception 'batch stage workflow columns are managed by the batch workflow functions' using errcode = '42501';
  end if;
  return new;
end
$$;

create or replace function private.guard_batch_qc_checks()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_status text;
begin
  if current_user in ('postgres', 'supabase_admin', 'service_role') then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    raise exception 'qc checks are created through create_batch_with_stages' using errcode = '42501';
  end if;

  select b.status into v_status from public.batches b
   where b.organization_id = old.organization_id and b.id = old.batch_id;

  if tg_op = 'DELETE' then
    if found and v_status <> 'planned' then
      raise exception 'qc checks of a started batch cannot be deleted' using errcode = '42501';
    end if;
    return old;
  end if;

  if new.id is distinct from old.id
     or new.organization_id is distinct from old.organization_id
     or new.batch_id is distinct from old.batch_id
     or new.check_code is distinct from old.check_code
     or new.label is distinct from old.label then
    raise exception 'qc check identity columns cannot be changed' using errcode = '42501';
  end if;

  if v_status in ('released', 'rejected', 'aborted', 'completed') then
    raise exception 'qc checks of a closed batch are read-only' using errcode = '42501';
  end if;

  -- Traçabilité : l'auteur et la date d'un résultat sont posés côté serveur.
  if new.status is distinct from old.status
     or new.measured_value is distinct from old.measured_value
     or new.value_text is distinct from old.value_text then
    if new.status = 'pending' then
      new.checked_by := null;
      new.checked_at := null;
    else
      new.checked_by := auth.uid();
      new.checked_at := now();
    end if;
  else
    -- Les clients ne peuvent pas falsifier l'auteur/la date sans changer le résultat.
    new.checked_by := old.checked_by;
    new.checked_at := old.checked_at;
  end if;
  return new;
end
$$;

drop trigger if exists batches_guard on public.batches;
create trigger batches_guard
  before insert or update or delete on public.batches
  for each row execute function private.guard_batches();

drop trigger if exists batch_stages_guard on public.batch_stages;
create trigger batch_stages_guard
  before insert or update or delete on public.batch_stages
  for each row execute function private.guard_batch_stages();

drop trigger if exists batch_qc_checks_guard on public.batch_qc_checks;
create trigger batch_qc_checks_guard
  before insert or update or delete on public.batch_qc_checks
  for each row execute function private.guard_batch_qc_checks();

-- ---------------------------------------------------------------------------
-- 2. RPC du workflow : SECURITY DEFINER, contrôle d'organisation conservé
-- ---------------------------------------------------------------------------

create or replace function public.create_batch_with_stages(
  p_organization_id uuid,
  p_batch_code text,
  p_name text,
  p_batch_type text,
  p_protocol_version_id uuid DEFAULT NULL::uuid,
  p_material_id uuid DEFAULT NULL::uuid,
  p_culture_id uuid DEFAULT NULL::uuid,
  p_location_id uuid DEFAULT NULL::uuid,
  p_environment_id uuid DEFAULT NULL::uuid,
  p_planned_at timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_quantity_planned numeric DEFAULT NULL::numeric,
  p_quantity_unit_code text DEFAULT NULL::text,
  p_stages text[] DEFAULT ARRAY['preparation'::text, 'sterilization'::text, 'inoculation'::text, 'incubation'::text, 'cultivation'::text, 'harvest'::text, 'formulation'::text, 'packaging'::text, 'qc'::text, 'release'::text]
)
returns public.batches
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_batch public.batches;
  v_stage text;
  v_seq integer := 0;
  v_template record;
  v_expected_stages constant text[] := array[
    'preparation','sterilization','inoculation','incubation',
    'cultivation','harvest','formulation','packaging','qc','release'
  ];
begin
  if not private.is_org_member(p_organization_id) then
    raise exception 'not authorized for organization';
  end if;

  if p_stages is distinct from v_expected_stages then
    raise exception 'custom stage workflows are disabled; use the standard batch workflow';
  end if;

  insert into public.batches(
    organization_id,batch_code,name,batch_type,protocol_version_id,
    material_id,culture_id,location_id,environment_id,planned_at,
    quantity_planned,quantity_unit_code,current_stage,status
  )
  values (
    p_organization_id,p_batch_code,p_name,p_batch_type,p_protocol_version_id,
    p_material_id,p_culture_id,p_location_id,p_environment_id,p_planned_at,
    p_quantity_planned,p_quantity_unit_code,p_stages[1],'planned'
  )
  returning * into v_batch;

  foreach v_stage in array p_stages loop
    v_seq := v_seq + 1;
    insert into public.batch_stages(
      organization_id,batch_id,stage_code,sequence_no,status
    )
    values (
      p_organization_id,v_batch.id,v_stage,v_seq,'pending'
    );
  end loop;

  for v_template in
    select check_code,label,default_unit_code
    from public.batch_qc_templates
    where organization_id=p_organization_id
      and batch_type=p_batch_type
      and required=true
    order by sequence_no
  loop
    insert into public.batch_qc_checks(
      organization_id,batch_id,check_code,label,status,unit_code
    )
    values(
      p_organization_id,v_batch.id,v_template.check_code,v_template.label,
      'pending',v_template.default_unit_code
    );
  end loop;

  insert into public.events(
    organization_id,event_type,occurred_at,batch_id,payload
  )
  values (
    p_organization_id,'batch_created',now(),v_batch.id,
    jsonb_build_object(
      'batch_code',p_batch_code,
      'batch_type',p_batch_type,
      'qc_template_applied',true
    )
  );

  return v_batch;
end;
$$;

create or replace function public.advance_batch_stage(
  p_batch_id uuid,
  p_expected_stage text
)
returns table(batch_id uuid, status text, current_stage text, completed_stage text, next_stage text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_batch public.batches;
  v_current public.batch_stages;
  v_next public.batch_stages;
begin
  select b.* into v_batch
  from public.batches b
  where b.id = p_batch_id
  for update;

  -- Même message pour « inexistant » et « autre organisation » : pas de fuite d'existence.
  if not found or not private.is_org_member(v_batch.organization_id) then
    raise exception 'batch not found';
  end if;

  if v_batch.status in ('released', 'rejected', 'aborted', 'completed') then
    raise exception 'batch is closed (status %)', v_batch.status;
  end if;

  if v_batch.current_stage is distinct from p_expected_stage then
    raise exception 'stage conflict: expected %, actual %', p_expected_stage, v_batch.current_stage;
  end if;

  if v_batch.current_stage = 'qc' then
    raise exception 'qc stage requires release_batch after all QC checks pass or are waived';
  end if;

  select bs.* into v_current
  from public.batch_stages bs
  where bs.organization_id = v_batch.organization_id
    and bs.batch_id = v_batch.id
    and bs.stage_code = v_batch.current_stage
  order by bs.sequence_no
  limit 1
  for update;

  if not found then
    raise exception 'current stage row not found';
  end if;

  update public.batch_stages
  set status='completed', completed_at=coalesce(completed_at,now())
  where organization_id=v_batch.organization_id and id=v_current.id;

  select bs.* into v_next
  from public.batch_stages bs
  where bs.organization_id = v_batch.organization_id
    and bs.batch_id = v_batch.id
    and bs.sequence_no > v_current.sequence_no
    and bs.status = 'pending'
  order by bs.sequence_no
  limit 1
  for update;

  if found then
    update public.batch_stages
    set status='active', started_at=coalesce(started_at,now())
    where organization_id=v_batch.organization_id and id=v_next.id;

    update public.batches
    set status='active', current_stage=v_next.stage_code,
        started_at=coalesce(started_at,now())
    where organization_id=v_batch.organization_id and id=v_batch.id;

    insert into public.events(
      organization_id,event_type,occurred_at,batch_id,payload
    )
    values (
      v_batch.organization_id,'batch_stage_advanced',now(),v_batch.id,
      jsonb_build_object('from',v_current.stage_code,'to',v_next.stage_code)
    );

    return query select v_batch.id,'active'::text,v_next.stage_code,
      v_current.stage_code,v_next.stage_code;
  else
    update public.batches
    set status='completed', current_stage='release',
        completed_at=coalesce(completed_at,now())
    where organization_id=v_batch.organization_id and id=v_batch.id;

    insert into public.events(
      organization_id,event_type,occurred_at,batch_id,payload
    )
    values (
      v_batch.organization_id,'batch_completed',now(),v_batch.id,
      jsonb_build_object('final_stage',v_current.stage_code)
    );

    return query select v_batch.id,'completed'::text,'release'::text,
      v_current.stage_code,null::text;
  end if;
end;
$$;

create or replace function public.release_batch(p_batch_id uuid)
returns public.batches
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_batch public.batches;
  v_total integer;
  v_pass integer;
  v_fail integer;
  v_pending integer;
  v_waived integer;
begin
  select b.* into v_batch
  from public.batches b
  where b.id=p_batch_id
  for update;

  if not found or not private.is_org_member(v_batch.organization_id) then
    raise exception 'batch not found';
  end if;

  if v_batch.current_stage <> 'qc' then
    raise exception 'batch must be at qc stage';
  end if;

  select
    count(*),
    count(*) filter (where status='pass'),
    count(*) filter (where status='fail'),
    count(*) filter (where status='pending'),
    count(*) filter (where status='waived')
  into v_total,v_pass,v_fail,v_pending,v_waived
  from public.batch_qc_checks
  where organization_id=v_batch.organization_id and batch_id=v_batch.id;

  if v_total=0 then raise exception 'no qc checks recorded'; end if;
  if v_fail>0 then raise exception 'qc contains failed checks'; end if;
  if v_pending>0 then raise exception 'qc contains pending checks'; end if;
  if v_pass + v_waived <> v_total then
    raise exception 'qc is not complete';
  end if;

  update public.batch_stages
  set status='completed', completed_at=coalesce(completed_at,now())
  where organization_id=v_batch.organization_id
    and batch_id=v_batch.id
    and stage_code='qc';

  update public.batch_stages
  set status='completed',
      started_at=coalesce(started_at,now()),
      completed_at=coalesce(completed_at,now())
  where organization_id=v_batch.organization_id
    and batch_id=v_batch.id
    and stage_code='release';

  update public.batches
  set status='released',
      current_stage='release',
      completed_at=coalesce(completed_at,now())
  where organization_id=v_batch.organization_id
    and id=v_batch.id
  returning * into v_batch;

  insert into public.events(organization_id,event_type,occurred_at,batch_id,payload)
  values(
    v_batch.organization_id,'batch_released',now(),v_batch.id,
    jsonb_build_object(
      'qc_checks',v_total,
      'passed',v_pass,
      'waived',v_waived
    )
  );

  return v_batch;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Droits d'exécution : plus d'accès anonyme ni PUBLIC
-- ---------------------------------------------------------------------------

revoke all on function public.create_batch_with_stages(uuid,text,text,text,uuid,uuid,uuid,uuid,uuid,timestamptz,numeric,text,text[]) from public, anon;
revoke all on function public.advance_batch_stage(uuid,text) from public, anon;
revoke all on function public.release_batch(uuid) from public, anon;
grant execute on function public.create_batch_with_stages(uuid,text,text,text,uuid,uuid,uuid,uuid,uuid,timestamptz,numeric,text,text[]) to authenticated, service_role;
grant execute on function public.advance_batch_stage(uuid,text) to authenticated, service_role;
grant execute on function public.release_batch(uuid) to authenticated, service_role;
