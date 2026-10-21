
create table if not exists public.batch_qc_checks (
  organization_id uuid not null,
  id uuid not null default gen_random_uuid(),
  batch_id uuid not null,
  check_code text not null,
  label text not null,
  status text not null default 'pending',
  value_text text,
  measured_value numeric,
  unit_code text,
  notes text,
  checked_at timestamptz,
  checked_by uuid,
  created_at timestamptz not null default now(),
  primary key (organization_id,id),
  constraint batch_qc_checks_status_chk check (status in ('pending','pass','fail','waived')),
  constraint batch_qc_checks_batch_fk foreign key (organization_id,batch_id)
    references public.batches(organization_id,id) on delete cascade,
  constraint batch_qc_checks_unit_fk foreign key (unit_code) references public.units(code),
  constraint batch_qc_checks_unique_code unique (organization_id,batch_id,check_code)
);

create index if not exists batch_qc_checks_org_batch_idx
on public.batch_qc_checks(organization_id,batch_id);

alter table public.batch_qc_checks enable row level security;

create policy batch_qc_checks_select on public.batch_qc_checks
for select using (private.is_org_member(organization_id));

create policy batch_qc_checks_insert on public.batch_qc_checks
for insert with check (private.is_org_member(organization_id));

create policy batch_qc_checks_update on public.batch_qc_checks
for update using (private.is_org_member(organization_id))
with check (private.is_org_member(organization_id));

create policy batch_qc_checks_delete on public.batch_qc_checks
for delete using (private.is_org_member(organization_id));

create or replace function public.release_batch(p_batch_id uuid)
returns public.batches
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_batch public.batches;
  v_total integer;
  v_pass integer;
  v_fail integer;
  v_pending integer;
begin
  select b.* into v_batch
  from public.batches b
  where b.id=p_batch_id
  for update;

  if not found then raise exception 'batch not found'; end if;
  if not private.is_org_member(v_batch.organization_id) then raise exception 'not authorized for organization'; end if;
  if v_batch.current_stage <> 'qc' then raise exception 'batch must be at qc stage'; end if;

  select count(*),
         count(*) filter (where status='pass'),
         count(*) filter (where status='fail'),
         count(*) filter (where status='pending')
    into v_total,v_pass,v_fail,v_pending
  from public.batch_qc_checks
  where organization_id=v_batch.organization_id and batch_id=v_batch.id;

  if v_total=0 then raise exception 'no qc checks recorded'; end if;
  if v_fail>0 then raise exception 'qc contains failed checks'; end if;
  if v_pending>0 then raise exception 'qc contains pending checks'; end if;
  if v_pass + (select count(*) filter (where status='waived') from public.batch_qc_checks where organization_id=v_batch.organization_id and batch_id=v_batch.id) <> v_total then
    raise exception 'qc is not complete';
  end if;

  update public.batch_stages
  set status='completed', completed_at=coalesce(completed_at,now())
  where organization_id=v_batch.organization_id and batch_id=v_batch.id and stage_code='qc';

  update public.batches
  set status='released', current_stage='release'
  where organization_id=v_batch.organization_id and id=v_batch.id
  returning * into v_batch;

  insert into public.events(organization_id,event_type,occurred_at,batch_id,payload)
  values(v_batch.organization_id,'batch_released',now(),v_batch.id,
         jsonb_build_object('qc_checks',v_total,'passed',v_pass));

  return v_batch;
end;
$$;

revoke all on function public.release_batch(uuid) from public;
grant execute on function public.release_batch(uuid) to authenticated;
