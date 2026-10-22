-- IoT device registry and idempotency ledger.
-- This migration is a repository draft until reviewed and applied deliberately.
-- Device tokens are stored as SHA-256 hashes only; never store plaintext tokens.
-- Ingestion is service-side only. No browser/anon/authenticated table access.

create table if not exists public.iot_devices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  environment_id uuid not null,
  device_code text not null,
  device_type text not null,
  token_sha256 text not null,
  enabled boolean not null default true,
  token_rotated_at timestamptz not null default now(),
  last_seen_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, device_code),
  foreign key (organization_id, environment_id)
    references public.environments(organization_id, id) on delete restrict,
  check (length(device_code) between 1 and 100),
  check (length(device_type) between 1 and 80),
  check (token_sha256 ~ '^[0-9a-f]{64}$')
);

create index if not exists iot_devices_environment_idx
  on public.iot_devices (organization_id, environment_id);

create table if not exists public.iot_ingest_receipts (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.iot_devices(id) on delete restrict,
  message_id text not null,
  payload_sha256 text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  status text not null default 'received',
  error_code text,
  metadata jsonb not null default '{}'::jsonb,
  unique (device_id, message_id),
  check (length(message_id) between 1 and 120),
  check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  check (status in ('received', 'processed', 'rejected'))
);

create index if not exists iot_ingest_receipts_received_idx
  on public.iot_ingest_receipts (received_at desc);

alter table public.iot_devices enable row level security;
alter table public.iot_ingest_receipts enable row level security;

revoke all on table public.iot_devices from anon, authenticated;
revoke all on table public.iot_ingest_receipts from anon, authenticated;
grant all on table public.iot_devices to service_role;
grant all on table public.iot_ingest_receipts to service_role;

comment on table public.iot_devices is
  'Server-managed registry of IoT devices. token_sha256 stores only the hash of a revocable device token.';
comment on table public.iot_ingest_receipts is
  'Server-side idempotency ledger for device messages; never directly exposed to clients.';
