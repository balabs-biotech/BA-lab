# Open agro-environmental intelligence: source and repository audit

Last reviewed: 2026-10-23

## Purpose

This catalogue separates **data providers** (sources of observations), **open-source software** (tools that retrieve/process data), and **complete platforms** (applications that combine multiple components). BA Labs should reuse small, well-understood components and public datasets rather than replace Culture Tracker with a second platform.

The intended workflow is: georeferenced location/field → documented source retrieval → provenance and quality checks → indicators with uncertainty → comparison with local measurements and IoT → explainable agronomic alert. External estimates must remain separate from measured values.

## Candidate public datasets and services

| Source | Useful variables | Access / prerequisites | Spatial and temporal caveats | BA Labs decision |
|---|---|---|---|---|
| NASA POWER | Daily air temperature, precipitation, solar radiation, relative humidity, wind | Public API; no user key | Gridded estimates, coarse compared with a farm; recent values can be revised; not a forecast | **Implemented first** in Supabase and Green Tech. Continue monitoring import freshness. |
| FAO WaPOR v3 | Actual/reference evapotranspiration, evaporation/transpiration, net primary production and related water-productivity layers | Public API; FAO says no token or credentials are required for v3; Python downloader available | Raster/geospatial layers; coverage and resolution depend on level and layer. Temporal products may be dekadal/monthly; NRT values can later be replaced by final values. Must verify that the chosen layer covers the target location and date. | **Next candidate** for water-balance context, after a reproducible point/area extraction test. Do not treat evapotranspiration as direct soil moisture. |
| Copernicus Sentinel-2 / Data Space | Surface reflectance; derived NDVI, NDWI and other indices | Open data; API workflows may require account/OAuth and processing quotas | Clouds, shadows, revisit timing, aggregation and pixel mix matter. A usable image is not guaranteed on every date. | Phase 3: first test scene discovery and cloud-aware time series; do not expose credentials in browser code. |
| ISRIC SoilGrids | Modelled soil pH, organic carbon, texture and other soil properties | Public research dataset/API; check current service status and reuse terms | Global gridded soil estimates are not a field/lab analysis; resolution and depth bands differ by property. | Add as static soil context only after endpoint reliability, units, depth and metadata are verified. |
| ESA WorldCover | Land-cover classes | Public raster products; can be accessed via suitable catalogue/cloud processing | Classification year and pixel resolution limit how precisely it describes a small plot. | Useful for surrounding land-cover context, not crop diagnosis. |
| SRTM / Copernicus DEM | Elevation and derived slope | Public elevation datasets | Terrain resolution and vertical error vary; a point elevation is not a drainage diagnosis. | Optional terrain context after core water and vegetation layers. |
| CHIRPS precipitation | Gridded precipitation history | Public data; processing/access path depends on the selected endpoint | Grid estimates and product versions; not a local rain gauge. | Candidate cross-check for rainfall trends, not duplicate ingestion until comparison value is demonstrated. |

Official starting points:
- NASA POWER: https://power.larc.nasa.gov/
- FAO WaPOR data access/API: https://www.fao.org/in-action/remote-sensing-for-water-productivity/wapor-data-access/en
- Copernicus Data Space: https://dataspace.copernicus.eu/
- SoilGrids: https://soilgrids.org/
- ESA WorldCover: https://worldcover2021.esa.int/
- CHIRPS: https://www.chc.ucsb.edu/data/chirps

## Open-source repositories to inspect

This is a technical triage, not an endorsement of scientific accuracy. Re-check repository activity, license, dependencies and service terms before copying code.

### 1. OpenFarm — https://github.com/superzero11/OpenFarm
- **Why inspect:** a modular crop-intelligence platform; documents a pipeline for satellite observations, weather, soil, field boundaries, time series and provenance.
- **License reported by repository:** BSD-3-Clause, a permissive license; retain copyright/license notices if code is reused.
- **Integration cost:** high if adopting the whole application. It expects a multi-service stack (web app, API, PostGIS, object storage, raster tiling and background workers) unlike the existing GitHub Pages + Supabase Culture Tracker.
- **Decision:** use as an architecture/reference source; do not migrate the existing app or deploy its full stack merely to gain one data provider.

### 2. AgriPulse — https://github.com/robloxsagax-web/AgriPulse
- **Why inspect:** advertises explainable field intelligence combining satellite, weather and soil signals.
- **License reported by repository:** MIT.
- **Validation required:** confirm which advertised features are implemented and tested, provider quotas/terms, the actual deployment requirements, and whether the code works outside its demo environment.
- **Decision:** inspect specific reusable algorithms and source adapters; no wholesale adoption before a dependency and test audit.

### 3. Virdis — https://github.com/Thanas-R/Virdis
- **Why inspect:** maps, Sentinel-2/NDVI, soil context, land cover and terrain analysis in one UI.
- **License reported by repository:** AGPL-3.0. This is not equivalent to MIT/BSD: modifying and operating a network service based on covered code can create source-disclosure obligations. Obtain legal review before integrating code into a proprietary/commercial service.
- **Operational caution:** the documented architecture depends on services such as Google Earth Engine and Mapbox, and its README also describes Open-Meteo use. Their account, quota, terms and commercial-use requirements remain separate from the repository license.
- **Decision:** learn from the workflow and data provenance; do not copy code into BA Labs until license compatibility is explicitly resolved.

### 4. Cropix — https://github.com/hadiemami/cropix
- **Why inspect:** a focused QGIS workflow for satellite imagery and vegetation indices can help validate geospatial calculations.
- **Validation required:** repository license, maintenance, processing assumptions, and whether its outputs can be reproduced independently.
- **Decision:** reference only until the license and code quality have been checked.

## Decision matrix for BA Labs

| Candidate | Direct value now | Extra accounts / infrastructure | Recommendation |
|---|---|---|---|
| NASA POWER | Historical agroclimate baseline | No provider account; existing Supabase functions and scheduler | Keep; verify scheduler freshness and data completeness |
| WaPOR v3 | Water-use and evapotranspiration context | No v3 API token; raster/area extraction still needs engineering | Next integration experiment |
| Sentinel-2 | Vegetation trajectory and spatial anomalies | CDSE account/OAuth for API workflows; processing quotas | After WaPOR and location workflow are stable |
| SoilGrids | Baseline soil context | API availability and data schema must be checked | Later, with depth/property provenance |
| OpenFarm | Architecture and pipeline patterns | Full stack would add substantial operational burden | Reference, do not replace current platform |
| AgriPulse | Potentially reusable source adapters and explainability patterns | Feature maturity needs verification | Code-level audit before reuse |
| Virdis | Useful UX and analytical workflow reference | AGPL plus external-service dependencies | Avoid direct code reuse pending compliance review |
| Cropix | Focused QGIS analysis workflow | QGIS and unknown license until checked | Reference after license audit |

## Engineering rules

1. Every observation stores provider, dataset, variable, unit, observation period, retrieval time, source URL, spatial/temporal resolution and quality metadata where available.
2. Never mix satellite/model estimates with manual measurements or IoT telemetry in the same unlabelled series.
3. Do not generate a diagnosis from one signal. Label alerts as hypotheses, show supporting signals and state plausible alternatives.
4. Keep each connector bounded, idempotent, retry-safe and server-side where secrets or bulk processing are involved.
5. Record API terms and dataset licenses separately from software licenses.
6. Never infer a precise field boundary from a point coordinate. Area statistics require an explicit polygon or a clearly labelled point/grid estimate.
7. Test the source with a known location and a short time window before enabling bulk backfill or scheduled ingestion.

## Next implementation sequence

1. Verify that the NASA POWER scheduled import is succeeding and that recent observations are fresh enough for its documented latency.
2. Prototype WaPOR v3 retrieval for the BA Labs site; confirm coverage, layer IDs, temporal resolution, units, no-data behavior and point/area extraction before writing production records.
3. Add a WaPOR connector only after the test output can be independently reproduced and mapped into the existing `environmental_observations` schema without lossy or misleading unit conversion.
4. Add cloud-aware Sentinel-2 NDVI history using Copernicus Data Space after the user creates and securely stores backend OAuth credentials.
5. Compare modelled context with local sensor/greenhouse measurements while preserving provenance; use discrepancies as a quality-control signal, not automatic proof that either source is wrong.
