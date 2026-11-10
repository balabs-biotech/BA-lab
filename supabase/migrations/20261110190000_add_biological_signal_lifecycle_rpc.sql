-- Add a narrow, authenticated workflow transition for engine-generated signals.
-- Signal content/provenance stays server-owned; organization writers only triage state.

alter table public.biological_signals
  add column dismissed_at timestamptz;

alter table public.biological_signals
  drop constraint biological_signals_acknowledgement_state_check;

alter table public.biological_signals
  add constraint biological_signals_lifecycle_timestamp_check
  check (
    (signal_status <> 'acknowledged' or acknowledged_at is not null)
    and (signal_status <> 'resolved' or resolved_at is not null)
    and (signal_status <> 'dismissed' or dismissed_at is not null)
  );

create or replace function public.set_biological_signal_status(
  p_organization_id uuid,
  p_signal_id uuid,
  p_status text
)
returns table (
  signal_id uuid,
  signal_status text,
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  dismissed_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_current_status text;
begin
  if p_status is null or p_status not in ('open', 'acknowledged', 'resolved', 'dismissed') then
    raise exception 'invalid_biological_signal_status'
      using errcode = '23514';
  end if;

  if auth.uid() is null or not private.is_org_writer(p_organization_id) then
    raise exception 'biological_signal_write_forbidden'
      using errcode = '42501';
  end if;

  select bs.signal_status
    into v_current_status
    from public.biological_signals bs
   where bs.organization_id = p_organization_id
     and bs.signal_id = p_signal_id
   for update;

  if not found then
    raise exception 'biological_signal_not_found'
      using errcode = 'P0002';
  end if;

  if v_current_status = p_status then
    return query
      select bs.signal_id, bs.signal_status, bs.acknowledged_at,
             bs.resolved_at, bs.dismissed_at
        from public.biological_signals bs
       where bs.organization_id = p_organization_id
         and bs.signal_id = p_signal_id;
    return;
  end if;

  if not (
    (v_current_status = 'open' and p_status in ('acknowledged', 'resolved', 'dismissed'))
    or (v_current_status = 'acknowledged' and p_status in ('open', 'resolved', 'dismissed'))
    or (v_current_status in ('resolved', 'dismissed') and p_status = 'open')
  ) then
    raise exception 'invalid_biological_signal_transition'
      using errcode = '23514';
  end if;

  return query
    update public.biological_signals bs
       set signal_status = p_status,
           acknowledged_at = case
             when p_status = 'acknowledged' then coalesce(bs.acknowledged_at, now())
             else null
           end,
           resolved_at = case when p_status = 'resolved' then now() else null end,
           dismissed_at = case when p_status = 'dismissed' then now() else null end
     where bs.organization_id = p_organization_id
       and bs.signal_id = p_signal_id
    returning bs.signal_id, bs.signal_status, bs.acknowledged_at,
              bs.resolved_at, bs.dismissed_at;
end;
$$;

revoke all on function public.set_biological_signal_status(uuid, uuid, text)
  from public, anon;
grant execute on function public.set_biological_signal_status(uuid, uuid, text)
  to authenticated;

comment on function public.set_biological_signal_status(uuid, uuid, text) is
  'Allows organization writers to acknowledge, resolve, dismiss, or reopen an engine-generated biological signal without modifying its scientific provenance.';
