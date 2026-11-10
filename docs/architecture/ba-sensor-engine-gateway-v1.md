# Sensor Engine — authenticated execution gateway v1

## Request path

`POST /functions/v1/sensor-analysis` is the user-facing Supabase Edge Function.
It accepts an environment UUID, a local-calendar date range and an optional
expected sampling interval. It does not accept arbitrary SQL, device IDs or
tenant IDs from the browser.

1. Verify the caller's Supabase JWT explicitly.
2. Resolve the physical environment through the caller-scoped Supabase client
   (RLS), then verify organization membership.
3. Only after membership authorization, use the service-role client to resolve
   one sensor-origin profile covering the complete requested date range.
4. Confirm the profile's tenant and physical location match the RLS-authorized
   environment, and obtain its bound device IDs.
5. Read existing `measurements` rows for that tenant, environment, bound
   devices and IoT provenance. The query uses a UTC guard band; exact local
   calendar boundaries are applied by the engine using the profile timezone.
6. Flatten the joined device, environment and variable records into the
   adapter's explicit evidence fields.
7. Call the private FastAPI route
   `POST /v1/analyses/sensors` using the server-only engine key.

## Private API contract

The FastAPI route requires `X-BA-Engine-Key`. It validates the requested
organization/environment against every row, normalizes each row through
`normalize_iot_measurement_row`, and invokes the independent
`run_sensor_analysis` use case.

The result is labelled `iot_sensor` and contains a descriptive sensor analysis.
It does not run FAO-56, reinterpret the data as NASA POWER, or mutate the
weather-analysis endpoint.

## Security properties

- JWT validation and RLS environment visibility precede privileged reads.
- Organization membership is required before service-role profile or
  measurement queries.
- The profile must be sensor-origin, active/retired, and valid for the complete
  requested period.
- The selected devices must be bound to that profile.
- Measurement queries are constrained by tenant, physical environment, device
  IDs, IoT source metadata and bounded time range.
- Request body, date range, row count and upstream timeout are bounded.
- CORS is allowlist-based; wildcard origins are not accepted.
- Service-role and engine credentials remain server-side.

## Current limitation

This first operational route returns sensor diagnostics and descriptive
statistics only. It does not yet resolve a biological context or call the
domain interpretation service. That is the next integration layer; it must
remain non-fatal and source-aware. The route has not been deployed, and the
PostgREST relationship names still require verification against a live schema.
