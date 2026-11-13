# Sentinel-2 spatial processing contract v1

## Purpose and boundary

Sentinel-2 imagery is processed through a spatial pipeline, separate from
`environmental.timeseries.qc`. Weather QC accepts timestamped scalar
observations; it must never receive scene assets, raster pixels, or NDVI
arrays. The spatial pipeline turns one catalogued Sentinel-2 L2A scene and
one versioned area of interest (AOI) into a reproducible NDVI artifact and
a compact analytical result.

This contract defines metadata and hand-off boundaries. It does not claim
that raster processing is deployed or that a scene preview is an analytical
result.

## Versioned contracts

- `schemas/spatial/v1/scene.schema.json`: STAC-derived scene metadata,
  required product level, processing baseline, red/NIR/SCL assets and
  per-band calibration metadata.
- `schemas/spatial/v1/ndvi-request.schema.json`: exact scene identity and
  metadata digest, AOI geometry in EPSG:4326, NDVI band mapping, SCL mask,
  target grid and output format.
- `schemas/spatial/v1/ndvi-result.schema.json`: quality state, valid-pixel
  accounting, NDVI statistics, COG artifact URI/checksum and processing
  provenance.

All three contracts use independent versioning from the time-series engine.
A future incompatible change creates a new schema version; it does not
silently reinterpret v1 records.

## Scene acquisition and calibration

Use a STAC catalogue to discover `sentinel-2-l2a` items. Preserve the
provider, collection ID, item ID, acquisition timestamp, cloud-cover value,
platform, tile and processing baseline. Store asset references and source
metadata hashes; do not copy raster bytes or large STAC metadata into
PostgreSQL rows or Python worker JSON.

Only L2A surface-reflectance products are accepted by this first contract.
For raw digital numbers, calibration is per band:

```text
surface_reflectance = (DN + BOA_ADD_OFFSET) / QUANTIFICATION_VALUE
```

Read `BOA_ADD_OFFSET` and `QUANTIFICATION_VALUE` from that scene's
metadata. Do not hardcode the post-2022 offset and do not apply the formula
to assets already delivered as harmonized surface reflectance. Preserve the
`processing_baseline` and `reflectance_status` so later multi-date
comparisons can reject undocumented or incompatible calibration.

## NDVI preparation

- Red is Sentinel-2 B04 (native 10 m); NIR is B08 (native 10 m).
- SCL is a categorical 20 m layer. Resample it with nearest-neighbour only;
  never use bilinear/cubic interpolation for class codes.
- Exclude SCL classes 3 (cloud shadow), 8 and 9 (cloud), 10 (cirrus), and
  11 (snow/ice). Keep the class mask and pixel accounting in provenance.
- Clip to the supplied AOI. The AOI is WGS84 GeoJSON; choose and record a
  suitable projected analysis CRS for the raster grid.
- Calculate NDVI on calibrated reflectance:
  `(B08 - B04) / (B08 + B04)`. A zero denominator and nodata in either band
  produce nodata, never zero.
- The v1 target grid is 10 m. Any future 20 m or 60 m products require an
  explicit new request parameter and documented resampling policy.

A valid-pixel fraction below 0.60 should produce
`review_required` or `insufficient_valid_pixels`, not a confident parcel
interpretation. The fraction and numerator/denominator must be persisted.
NDVI statistics are descriptive scene summaries; they are not universal
vegetation thresholds or a diagnosis of crop health.

## Artifact and persistence model

Write the derived raster as a Cloud-Optimized GeoTIFF (COG) to controlled
object storage. Persist only the artifact URI, SHA-256, dimensions/grid,
pixel accounting, statistics and provenance in the analytical result store.
Do not place raster blobs in JSONB or in the engine execution ledger.

A result must identify:
- exact source scene and source metadata digest;
- processing baseline and reflectance calibration state;
- B04/B08 mapping and SCL exclusions;
- AOI digest and analysis CRS;
- pixel totals, valid pixels and valid-pixel fraction;
- algorithm/software version and generation time;
- COG URI and checksum.

A new AOI, source scene, calibration state, mask or algorithm version creates
a new processing request and immutable result. Never overwrite a prior
result in place.

## Execution boundary and next implementation stage

The next implementation stage is a dedicated spatial worker with bounded
raster windows, controlled access to scene assets, deterministic COG output,
and explicit CPU/memory/time limits. Candidate implementation libraries
should be selected only after the container/runtime and asset-access model
are defined. The first production slice should process one scene and one AOI;
multi-scene mosaics, composites, NDMI, parcel change detection and biological
recommendations remain outside v1.

The worker must report input/output pixel accounting and reject missing
calibration metadata, unsupported product levels, unknown CRS, corrupt
assets, invalid AOI geometry, and unaccounted pixel loss. It must not
silently repair CRS or infer missing offsets.
