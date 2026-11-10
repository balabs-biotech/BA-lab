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

The route returns sensor diagnostics and descriptive statistics. An optional
causal temporal screen can also be requested by supplying all three explicit
settings: `temporal_window_seconds`, `temporal_minimum_history`, and
`temporal_threshold`. The gateway retrieves a bounded historical guard band,
then excludes readings outside the selected profile's local-calendar validity.
The screen returns assessments only inside the requested analysis dates.

The gateway does not yet resolve a persisted biological context or call the
domain interpretation service. That remains the next integration layer; it
must be non-fatal and source-aware. The route has not been deployed, and the
PostgREST relationship names still require verification against a live schema.

## Optional biological interpretation

A caller may supply `subject_id` to request interpretation against persisted
CultureOps context. The gateway then resolves exactly one
`biological_contexts` record matching tenant, physical environment, typed
subject FK (culture or plant culture), and the complete date interval. It
resolves exactly one active/retired `domain_interpretation_profiles` version
for that context's domain and period.

The Edge Function constructs the typed biological context, environment
context, and domain profile payload from those database records. The private
engine validates domain, tenant, location, environment, date validity and
sensor membership before emitting domain signals. The browser never submits
thresholds or rule definitions. If no `subject_id` is supplied, interpretation
is skipped and descriptive sensor analysis still runs.

The separate numeric `SensorEventProfile` detector is not yet persisted or
wired into this route. It remains a pure, explicitly configured Python layer.
