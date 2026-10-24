# IoT device token lifecycle — operational security

Status: **procedure only; no provisioning endpoint is implemented**.

This document defines the minimum safe manual procedure for the current v1 registry. It does not authorize production changes. Perform database changes only through an approved, authenticated operator session; never expose the Supabase service-role key to an ESP32 or browser.

## Security invariants

- Generate each device token from a cryptographically secure random source. Use at least 32 random bytes (256 bits), encoded as URL-safe text.
- Store only the lowercase SHA-256 hex digest in `public.iot_devices.token_sha256`. The plaintext token must never be committed, placed in a ticket, printed to application logs, or written into a firmware repository.
- Keep `organization_id`, `environment_id`, and `device_code` bound to the intended device. The database composite foreign key protects organization/environment consistency.
- Keep the device disabled until provisioning has been checked. A disabled device must not ingest measurements.
- Treat the token as a bearer credential: anyone who obtains it can impersonate that device until it is revoked or rotated.
- Do not assume the ESP32 flash is confidential. Use device-specific credentials, restrict physical access where practical, and do not reuse tokens between devices.

## Initial provisioning — controlled operator procedure

1. Assign a unique device code and confirm the target organization and environment.
2. Generate the token on a trusted operator workstation using a cryptographically secure generator. Do not generate it with a timestamp, device MAC address, counter, or ordinary pseudorandom generator.
3. Compute SHA-256 over the exact UTF-8 token string and encode the digest as 64 lowercase hexadecimal characters.
4. Insert the registry row using the digest only; do not place the plaintext token in SQL history or a saved query. Keep the device disabled during the registry preparation.
5. Deliver the plaintext token to the device through a trusted local provisioning path. Do not place it in source control, serial logs, screenshots, chat, or a shared spreadsheet.
6. Enable the device only after its organization/environment association and token hash have been independently checked.
7. Send a small test reading and verify the expected device/environment, timestamp, and measurement. Confirm that a retry with the identical request is a duplicate and that reuse of the message ID with changed content returns HTTP 409.
8. Record the device code, operator, time, and test result — never the token itself.

The current repository does not provide a token-generation or provisioning endpoint. Do not invent one by exposing service-role credentials to a client. Manual SQL should be performed only through a trusted administrative channel, with access logging and review.

## Rotation — important current limitation

The current schema stores **one active token hash per device**. It does not support a dual-token overlap window or a remote rotation handshake.

For a device that can be accessed locally:

1. Arrange a maintenance window and ensure the device can be physically reconfigured.
2. Generate a fresh independent token and digest.
3. Securely install the new token on the device without logging it.
4. Update `token_sha256` in the trusted administrative session. The database trigger updates `token_rotated_at` when the digest changes.
5. Test ingestion with the new token; verify the old token is rejected.
6. If the test fails, disable the device and recover locally rather than weakening authentication.

Because the registry accepts only one hash, the device may be unable to ingest during the transition. **Do not attempt unattended remote rotation until a separately reviewed dual-token or staged-rotation design exists.** The trigger tracks a hash change; it does not itself rotate credentials or deliver secrets.

## Revocation and recovery

- To revoke a token, set the corresponding device's `enabled` flag to false through the trusted administrative channel. Verify that the old token receives HTTP 401.
- If a token is suspected to be exposed, disable the device first, investigate access/logs, then provision a new token through a controlled local process.
- If the physical device is lost, stolen, or cannot be trusted, keep it disabled; do not reactivate it merely because the token was rotated.
- Never return the plaintext token from a database function or API. The database is designed to retain only its digest.

## Pre-deployment checklist

- [ ] Confirm whether the target database already contains duplicate token hashes before applying the unique-index migration:
  `SELECT token_sha256, count(*) FROM public.iot_devices GROUP BY token_sha256 HAVING count(*) > 1;`
- [ ] Resolve any duplicate rows deliberately before adding a unique index; do not delete or disable devices automatically.
- [ ] Review RLS, table grants, and RPC grants in the actual target environment.
- [ ] Confirm secrets are configured only as server-side Edge Function secrets.
- [ ] Test invalid/revoked tokens, identical retries, changed-payload conflicts, cross-organization isolation, rate limiting, and rollback on a disposable database.
- [ ] Validate network recovery and actual firmware behavior on a physical ESP32.
- [ ] Have an independent reviewer inspect the final diff and migration sequence.
- [ ] Apply migrations only as a deliberate, backed-up deployment step. CI success is not production approval.

## Known limitations

- The per-device limiter uses a fixed 60-second window and runs after token authentication but before the request body is read or parsed. Authenticated malformed requests consume budget, which prevents malformed payloads from bypassing the per-device limit. This is not a network-level DDoS control and does not protect the endpoint before a valid device token is identified.
- The single-token schema does not provide a safe unattended rotation window.
- No provisioning, secure-enrollment, remote rotation, or actuator-control endpoint is implemented by this document.
