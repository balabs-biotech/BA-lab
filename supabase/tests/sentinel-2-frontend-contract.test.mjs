import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("../../batch-tracker/environmental-data.js", import.meta.url),
  "utf8",
);

const checks = [
  ["calls the deployed catalogue Edge Function", /db\.functions\.invoke\("copernicus-sentinel-catalogue"/],
  ["falls back to the public Earth Search catalogue when Copernicus OAuth or catalogue results are unavailable", /db\.functions\.invoke\("earth-search-sentinel2-catalogue"[\s\S]*?Earth Search \/ AWS Open Data \(sans OAuth\)/],
  ["labels the Earth Search fallback as catalogue-only rather than claiming NDVI processing", /Source de secours publique, sans OAuth[\s\S]*?le calcul NDVI et la cartographie colorée des zones ne sont pas encore produits/],
  ["requires a selected location and valid date range", /if\(!location\.value\|\|!from\.value\|\|!to\.value\|\|from\.value>to\.value\)/],
  ["limits the UI search window to 180 days", /if\(days>180\)/],
  ["caps results at ten scenes in the UI", /limit:10/],
  ["requests a conservative scene cloud-cover threshold", /max_cloud_cover:60/],
  ["renders scene details with DOM text nodes", /node\("strong",\{\},scene\.acquired_at/],
  ["shows the Sentinel-2 NDVI colour legend", /satelliteNDVILegend/],
  ["requests a rendered Sentinel-2 NDVI image from the authenticated Edge Function", /sentinel-2-ndvi-preview/],

  ["falls back to public raster NDVI when Copernicus credentials are missing", /primaryError\.error===\"sentinelhub_credentials_not_configured\"[\\s\\S]*?earth-search-sentinel2-ndvi-preview/],
  ["reports which NDVI raster provider produced the image", /X-NDVI-Stats[\\s\\S]*?via \"\+rasterSource/],
  ["discloses that cloud pixels are not yet masked in the public raster preview", /les pixels nuageux ne sont pas encore masqués/],
  ["renders the returned Sentinel-2 raster as an in-app Leaflet image overlay", /L\.imageOverlay\([\s\S]*?satelliteSentinelNDVILayer/],
  ["offers an in-app map action for each Sentinel-2 scene instead of relying only on an external map link", /Afficher le contexte régional sur la carte BA Labs[\s\S]*?updateSatelliteMap\(\)/],
  ["opens catalogue links in a protected new tab", /target:"_blank",rel:"noopener noreferrer"/],
  ["renders catalogue-provided preview images", /if\(scene\.preview_url\)[\s\S]*?node\("img"/],
  ["ranks a review candidate by lower scene-wide cloud cover then recency", /rankedScenes=\[\.\.\.data\.scenes\][\s\S]*?return cloudA-cloudB\|\|dateB-dateA/],
  ["labels the candidate as indicative and discloses scene-wide cloud-cover limits", /Candidat à examiner en premier[\s\S]*?ne décrit pas la couverture nuageuse exacte du site/],
  ["renders an embedded satellite map panel", /id:"satelliteColorMap"/],
  ["falls back to a labelled Sétif regional view before a location is selected", /const mapLatitude=hasValidCoordinates\?latitude:36\.19[\s\S]*?Aperçu régional centré sur Sétif/],
  ["initializes the regional map even when no location is selected", /if\(!location\.value\) updateSatelliteMap\(\)/],
  ["uses the public NASA GIBS NDVI raster layer", /MODIS_Terra_L3_NDVI_16Day/],
  ["uses technical remote-sensing terminology in the map heading", /Télédétection optique — réflectance et indices de végétation/],
  ["defaults to natural-colour imagery so the landscape is visible", /satelliteTrueColorLayer\.addTo\(satelliteLeafletMap\)/],
  ["keeps NDVI as an optional analytical overlay", /Indice spectral de végétation — NDVI MODIS/],
  ["explains the native NDVI palette may render low values pale or transparent", /valeurs peuvent apparaître très claires ou transparentes/],
  ["offers natural-colour satellite imagery", /MODIS_Terra_CorrectedReflectance_TrueColor/],
  ["links to a public high-resolution Sentinel-2 L2A explorer for field-scale inspection", /sentinel-2\.allthingsspatial\.io[\s\S]*?à 10 m/],
  ["directs users to the external high-resolution explorer when BA Labs processing credentials are missing", /pas encore configuré[\s\S]*?sentinelHighResLink\.scrollIntoView/],
  ["states that MODIS is regional at roughly kilometre scale", /de l’ordre du kilomètre/],
  ["labels the NDVI map as a 16-day regional composite", /composite de 16 jours/],
  ["aligns NDVI dates to the actual 16-day cadence from 2000-02-18", /const anchor=Date\.UTC\(2000,1,18\)[\s\S]*?Math\.floor\(\(d\.getTime\(\)-anchor\)\/period\)/],
  ["does not imply that regional MODIS pixels define plot boundaries", /ce n’est pas une limite de parcelle/],
  ["handles missing preview images without breaking scene cards", /Aucun aperçu image fourni par le catalogue/],
  ["offers a per-scene Copernicus Browser date view when no thumbnail exists", /scene\.browser_url[\s\S]*?Visualiser cette date dans Copernicus Browser/],
  ["does not claim that parcel-level NDVI analysis is already available", /\/calcul NDVI à partir des bandes Sentinel-2 et l’analyse fine des zones restent à intégrer\//],
  ["restores the button after success or failure", /finally\{satelliteButton\.disabled=false;\}/],
];

for (const [label, pattern] of checks) {
  assert.match(source, pattern, label);
  console.log(`✓ ${label}`);
}

console.log(`Passed ${checks.length} Sentinel-2 frontend contract checks.`);
