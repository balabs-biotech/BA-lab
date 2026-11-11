-- BAL-JSON ingestion receipt and atomic idempotent write boundary.
-- The receipt and domain write share one PostgreSQL transaction.
create table if not exists private.bal_json_ingestion_receipts (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  record_id uuid not null,
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  record_type text not null check (record_type in ('measurement','observation')),
  event_id uuid,
  created_at timestamptz not null default now(),
  primary key (organization_id, record_id)
);

revoke all on table private.bal_json_ingestion_receipts from public, anon, authenticated;

create or replace function public.ingest_bal_json_record(
  p_record_id uuid,
  p_payload_sha256 text,
  p_record_type text,
  p_event jsonb,
  p_data jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid;
  v_existing private.bal_json_ingestion_receipts%rowtype;
  v_event_id uuid;
begin
  if p_record_id is null or p_record_type is null or p_payload_sha256 is null
     or p_payload_sha256 !~ '^[0-9a-f]{64}$'
     or p_record_type not in ('measurement','observation')
     or p_event is null or p_data is null then
    raise exception 'Invalid BAL-JSON ingestion arguments' using errcode = '22023';
  end if;

  v_org_id := nullif(p_event->>'organization_id','')::uuid;
  if v_org_id is null or not private.is_org_member(v_org_id) then
    raise exception 'Organization access denied' using errcode = '42501';
  end if;

  insert into private.bal_json_ingestion_receipts
    (organization_id, record_id, payload_sha256, record_type)
  values (v_org_id, p_record_id, p_payload_sha256, p_record_type)
  on conflict (organization_id, record_id) do nothing;

  if not found then
    select * into v_existing
      from private.bal_json_ingestion_receipts
     where organization_id = v_org_id and record_id = p_record_id
     for update;
    if v_existing.payload_sha256 <> p_payload_sha256
       or v_existing.record_type <> p_record_type then
      raise exception 'bal_json_record_id_payload_mismatch' using errcode = '23505';
    end if;
    if v_existing.event_id is null then
      raise exception 'bal_json_receipt_incomplete' using errcode = '40001';
    end if;
    return jsonb_build_object(
      'status','duplicate',
      'record_id',p_record_id,
      'event_id',v_existing.event_id
    );
  end if;

  if p_record_type = 'measurement' then
    v_event_id := public.record_manual_measurement(p_event, p_data);
  else
    v_event_id := public.record_manual_observation(p_event, p_data);
  end if;

  update private.bal_json_ingestion_receipts
     set event_id = v_event_id
   where organization_id = v_org_id and record_id = p_record_id;

  return jsonb_build_object(
    'status','inserted',
    'record_id',p_record_id,
    'event_id',v_event_id
  );
end;
$$;

revoke all on function public.ingest_bal_json_record(uuid,text,text,jsonb,jsonb) from public, anon;
grant execute on function public.ingest_bal_json_record(uuid,text,text,jsonb,jsonb) to authenticated;
