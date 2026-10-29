import fs from "node:fs";
import assert from "node:assert/strict";

const source = fs.readFileSync("batch-tracker/environmental-data.js", "utf8");
new Function(source);

assert.ok(source.includes("earth-search-sentinel2-ndvi-preview"), "Public Earth Search preview must remain the primary Sentinel-2 renderer");
assert.ok(!source.includes("functions/v1/sentinel-2-ndvi-preview"), "Do not call the Copernicus fallback that currently returns HTTP 503 because its credentials are not configured");
assert.ok(!source.includes("Copernicus OAuth"), "The user-facing path must not promise an unconfigured OAuth fallback");
assert.ok(source.includes('satelliteMapStatus.textContent="Image Sentinel-2 indisponible : "+message'), "The interface must show the underlying failure detail instead of hiding it behind a generic status");
for (const code of [
  "earth_search_catalogue_unavailable",
  "earth_search_raster_timeout",
  "ndvi_raster_processing_failed",
  "raster_window_invalid_or_too_large",
  "sentinel2_projection_metadata_missing",
  "sentinel2_projection_unsupported",
  "valid_location_coordinates_required",
  "past_valid_date_required"
]) {
  assert.ok(source.includes(code), "Missing readable handling for " + code);
}
console.log("✓ Sentinel-2 preview uses the public renderer without the unconfigured fallback");
console.log("✓ Satellite failures retain actionable diagnostics in the interface");
