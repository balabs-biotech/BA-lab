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
  ["requests a conservative scene cloud-cover threshold", /max_cloud_cover:60/],
  ["renders scene details with DOM text nodes", /node\("strong",\{\},scene\.acquired_at/],
  ["opens catalogue links in a protected new tab", /target:"_blank",rel:"noopener noreferrer"/],
  ["explains that scene-wide cloud cover is not parcel-level quality", /couverture nuageuse est celle de la scène entière/],
  ["does not claim that NDVI or imagery analysis is already available", /indices végétaux ne sont pas encore analysés/],
  ["restores the button after success or failure", /finally\{satelliteButton\.disabled=false;\}/],
];

for (const [label, pattern] of checks) {
  assert.match(source, pattern, label);
  console.log(`✓ ${label}`);
}

console.log(`Passed ${checks.length} Sentinel-2 frontend contract checks.`);
