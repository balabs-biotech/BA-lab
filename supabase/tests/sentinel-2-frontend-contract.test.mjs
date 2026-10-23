import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("../../batch-tracker/environmental-data.js", import.meta.url),
  "utf8",
);

const checks = [
  ["calls the deployed catalogue Edge Function", /db\.functions\.invoke\("copernicus-sentinel-catalogue"/],
  ["requires a selected location and valid date range", /if\(!location\.value\|\|!from\.value\|\|!to\.value\|\|from\.value>to\.value\)/],
  ["limits the UI search window to 180 days", /if\(days>180\)/],
  ["caps results at ten scenes in the UI", /limit:10/],
  ["offers saved parcel contours as a Sentinel search scope", /satelliteParcel[\s\S]*?Recherche régionale \(sans contour de parcelle\)/],
  ["sends the selected parcel id to the catalogue function", /if\(satelliteParcel\.value\)requestBody\.parcel_id=satelliteParcel\.value/],
  ["loads only parcels associated with the selected location", /from\("farm_parcels"\)[\s\S]*?\.eq\("location_id",requestedLocationId\)/],
  ["requests a conservative scene cloud-cover threshold", /max_cloud_cover:60/],
  ["renders scene details with DOM text nodes", /node\("strong",\{\},scene\.acquired_at/],
  ["opens catalogue links in a protected new tab", /target:"_blank",rel:"noopener noreferrer"/],
  ["renders catalogue-provided preview images", /if\(scene\.preview_url\)[\s\S]*?node\("img"/],
  ["handles missing preview images without breaking scene cards", /Aucun aperçu image fourni par le catalogue/],
  ["offers a per-scene Copernicus Browser date view when no thumbnail exists", /scene\.browser_url[\s\S]*?Visualiser cette date dans Copernicus Browser/],
  ["does not claim that parcel-level NDVI analysis is already available", /calcul NDVI et le traitement des bandes satellite restent à intégrer/],
  ["restores the button after success or failure", /finally\{satelliteButton\.disabled=false;\}/],
];

for (const [label, pattern] of checks) {
  assert.match(source, pattern, label);
  console.log(`✓ ${label}`);
}

console.log(`Passed ${checks.length} Sentinel-2 frontend contract checks.`);
