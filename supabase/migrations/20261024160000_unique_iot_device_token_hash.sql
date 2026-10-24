-- A device token must identify exactly one device.
-- This prevents ambiguous token lookups across devices or organizations.
create unique index if not exists iot_devices_token_sha256_uidx
  on public.iot_devices (token_sha256);
