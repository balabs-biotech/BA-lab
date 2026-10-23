# Free/open environmental data integration

## Product objective

Add environmental context to a user's own locations and Agritech units without mixing external estimates with manual measurements or IoT readings. Every imported value must keep its provider, dataset, observation time, retrieval time, unit, spatial/temporal resolution, quality flags and source URL.

## Provider decisions

### Phase 1 — NASA POWER (historical agroclimate)

Use the public REST API first for daily historical agroclimate context. It requires latitude/longitude and does not require a user API key. It provides analysis-ready solar and meteorological variables, with daily history from 1981 to near-real-time. It is not a live weather-station feed or a short-term forecast. NASA documents meteorological source resolution around 0.5 x 0.625 degrees (roughly 50 km) and solar data around 1 degree (roughly 100 km); recent data may be revised as higher-quality products replace near-real-time data.

Start with daily variables selected from the NASA POWER parameter dictionary, for example daily mean/min/max air temperature, precipitation and solar radiation. Confirm the exact parameter names, units and community before mapping values into BA Labs' canonical variable/unit vocabulary. Store UTC timestamps or explicit source time standard, not an unlabelled local date.

Official docs:
- https://power.larc.nasa.gov/docs/services/api/
- https://power.larc.nasa.gov/docs/services/api/temporal/daily/
- https://power.larc.nasa.gov/docs/faqs/data/

### Phase 2 — Sentinel-2 through Copernicus Data Space Ecosystem (satellite)

Use Sentinel-2 Level-2A surface reflectance to calculate a first vegetation index (NDVI) for a georeferenced field or a point/plot. The underlying Copernicus data is free and open, but API access, account authentication, processing quotas and monthly limits still apply. The theoretical revisit is not a guarantee of a usable observation: clouds, shadows, acquisition timing and processing availability must be reflected in quality metadata.

Prefer catalog discovery and on-demand processing over downloading full scenes. Keep acquisition date, product identifier, cloud percentage, pixel/aggregation method, spatial resolution and the processing algorithm/version. Do not present NDVI as a direct yield measurement or a substitute for ground observations.

Official docs:
- https://dataspace.copernicus.eu/analyse/apis
- https://documentation.dataspace.copernicus.eu/Quotas.html
- https://eu-space.europa.eu/copernicus-data-access

### Forecasts and commercial licensing

Do not build BA Labs' commercial service on Open-Meteo's no-cost API without obtaining permission/a suitable licence: its current free tier is explicitly non-commercial; commercial use requires a paid licence. Its underlying data being open does not automatically make that API service free for a commercial application. Reassess a commercial forecast provider or a self-hosted open-data model pipeline separately; self-hosting still has infrastructure and operations costs.

Reference:
- https://open-meteo.com/en/terms
- https://open-meteo.com/en/pricing

## Data model

- Coordinates belong to `locations`, not only to a plant record, because several units may share one site. Latitude/longitude are optional until a user explicitly enters or confirms a location. Never silently infer a precise farm coordinate from the user's browser location.
- `environmental_observations` stores imported numeric values independently from `measurements`. This keeps external gridded estimates distinct from manual measurements and IoT telemetry.
- The organization-scoped foreign key and row-level security bind every environmental record to a location owned by the same organization.
- Authenticated clients can read their own organization's data, but cannot insert or forge provider-sourced observations. Server-side ingestion is responsible for writes and deduplication.
- Keep source and quality metadata with each record. Re-fetching must be idempotent and must not overwrite manual/IoT records.

## Recommended user workflow

1. User selects an existing location and enters/validates its latitude and longitude (decimal degrees), with a visible source and accuracy note.
2. User chooses **Historical weather context**; the server fetches a bounded date range from NASA POWER and caches the response.
3. The interface labels the result as **gridded estimate**, shows provider and approximate resolution, and offers a date range.
4. Only after this works end-to-end, add a **Satellite vegetation index** workflow that lets a user specify the plot boundary or deliberately use a point/centroid.
5. Compare external context with the user's measurements/IoT series in a shared timeline, but preserve each series' provenance and do not merge them into one undifferentiated dataset.

## Operational constraints

- Cache per provider, dataset, location/grid cell and date; avoid repeated identical API requests.
- Use bounded backfills, retry with backoff, explicit timeouts and provider error states.
- Do not make the browser call providers directly for bulk imports. Use a server-side Edge Function with organization membership checks and a bounded request window.
- Do not expose service-role credentials in the static GitHub Pages client.
- Do not schedule automatic refresh until the deployment has a verified scheduler (e.g. Supabase Cron/pg_cron or an external GitHub Actions schedule) and its costs/limits are understood.
- Free data does not mean unlimited processing, guaranteed availability or zero operational cost.


## First implementation — NASA POWER daily import

The first connector is implemented as the Supabase Edge Function `nasa-power-agroclimate` and the Green Tech panel loaded by `batch-tracker/environmental-data.js`.

- A signed-in organization member selects an existing location and explicitly enters or confirms its latitude/longitude. The interface does not infer the user's precise location.
- The browser calls the Edge Function; it does not call NASA POWER directly or hold server credentials.
- The function validates the location through the caller's RLS-scoped session, accepts a maximum 366-day date window, calls NASA POWER's daily point endpoint and upserts values into `environmental_observations`.
- Imported variables: daily mean/minimum/maximum 2 m air temperature, corrected precipitation and all-sky surface shortwave radiation.
- Idempotency uses the organization/location/provider/dataset/variable/observation-time unique key. Recently retrieved complete-enough ranges may be served from the database cache; a subsequent manual refresh control can be added if operational testing shows it is needed.
- Each record retains the NASA parameter name, source date/time standard, coordinate provenance, source URL, retrieval time, unit and an indicative grid scale. Missing sentinel values are excluded.
- The panel labels these values as gridded estimates and does not turn them into diagnoses or irrigation commands.

Before production use, deploy the Edge Function with JWT verification enabled and test with a real organization location whose coordinates have been explicitly checked. Confirm read/update RLS policies on `locations` and read RLS on `environmental_observations`. Do not populate live data using invented coordinates or synthetic observations.
