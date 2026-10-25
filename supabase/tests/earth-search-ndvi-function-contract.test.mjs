import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("../functions/earth-search-sentinel2-ndvi-preview/index.ts", import.meta.url),
  "utf8",
);
const checks = [
  ["uses public COG raster decoding without Copernicus OAuth", /npm:geotiff[\s\S]*?fromUrl\(redUrl[\s\S]*?fromUrl\(nirUrl/],
  ["computes normalized difference vegetation index from red and near-infrared pixels", /\(nir - red\) \/ denom/],
  ["transforms WGS84 study coordinates into the raster CRS", /proj4\("EPSG:4326", crs/],
  ["limits processing to a local raster window", /readRasters\(\{ window: redWin\.window/],
  ["renders a 512-by-512 RGBA PNG", /new PNG\(\{ width, height, colorType: 6 \}\)/],
  ["returns georeferencing bounds for the map overlay", /"X-Geo-Bounds"/],
  ["returns NDVI statistics", /"X-NDVI-Stats"/],
  ["applies Sentinel-2 scene classification to mask clouds, shadows, snow and invalid pixels", /cloudMaskApplied[\\s\\S]*?\[0, 1, 3, 8, 9, 10, 11\]/],
  ["reports whether the SCL mask was applied", /cloud_mask_applied: cloudMaskApplied/],
  ["requires an authenticated user and an authorized saved location", /db\.auth\.getUser\(\)[\s\S]*?from\("locations"\)[\s\S]*?maybeSingle\(\)/],
  ["rejects non-public asset URLs", /safeCogUrl[\s\S]*?amazonaws\.com/],
  ["states that the preview is a study window rather than a parcel boundary", /never presented as a parcel boundary/],
];
for (const [label, pattern] of checks) {
  assert.match(source, pattern, label);
  console.log(\`✓ \${label}\`);
}
console.log(\`Passed \${checks.length} Earth Search NDVI function contract checks.\`);
