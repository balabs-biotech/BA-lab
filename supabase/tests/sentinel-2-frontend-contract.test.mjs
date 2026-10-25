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
  ["renders catalogue-provided preview images", /if\(scene\.preview_url\)[\s\S]*?node\("img"/],
  ["ranks a review candidate by lower scene-wide cloud cover then recency", /rankedScenes=\[\.\.\.data\.scenes\][\s\S]*?return cloudA-cloudB\|\|dateB-dateA/],
  ["labels the candidate as indicative and discloses scene-wide cloud-cover limits", /Candidat à examiner en premier[\s\S]*?ne décrit pas la couverture nuageuse exacte du site/],
  ["renders an embedded satellite map panel", /id:"satelliteColorMap"/],
  ["uses the public NASA GIBS NDVI raster layer", /MODIS_Terra_NDVI_16Day/],
  ["offers natural-colour satellite imagery", /MODIS_Terra_CorrectedReflectance_TrueColor/],
  ["states that MODIS is regional at roughly kilometre scale", /de l’ordre du kilomètre/],
  ["labels the NDVI map as a 16-day regional composite", /composite de 16 jours/],
  ["aligns NDVI dates to the actual 16-day cadence from 2000-02-18", /const anchor=Date\.UTC\(2000,1,18\)[\s\S]*?Math\.floor\(\(d\.getTime\(\)-anchor\)\/period\)/],
  ["does not imply that regional MODIS pixels define plot boundaries", /ce n’est pas une limite de parcelle/],
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
