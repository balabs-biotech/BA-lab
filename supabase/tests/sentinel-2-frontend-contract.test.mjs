import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [source, entry] = await Promise.all([
  readFile(new URL("../../batch-tracker/environmental-data.js", import.meta.url), "utf8"),
  readFile(new URL("../../batch-tracker/green-tech/index.html", import.meta.url), "utf8"),
]);
const checks = [
  ["loads the satellite panel immediately after the Green Tech hero", /hero\.parentNode\.insertBefore\(panel,hero\.nextSibling\)/],
  ["restores the last used location automatically", /localStorage\.getItem\("ba-labs-active-environment-location"\)/],
  ["automatically selects a configured location when no previous site exists", /const preferred=saved\|\|data\.find/],
  ["waits for the map to initialize before requesting imagery", /async function selectLocation\(\)[\s\S]*?await updateSatelliteMap\(\);/],
  ["searches the satellite catalogue automatically on initial load", /await loadLocations\(\);\s*if\(location\.value\)\{loadRows\(\);if\(lat\.value!==""&&lon\.value!==""\)searchSatellite\(\);/],
  ["automatically searches again when the selected location changes", /location\.addEventListener\("change"[\s\S]*?searchSatellite\(\)/],
  ["prioritizes recent scenes with at most 30% cloud cover", /usableA=cloudA<=30\?0:1[\s\S]*?return usableA===0\?dateB-dateA/],
  ["automatically requests a rendered Sentinel-2 NDVI image", /await showSentinelNDVI\(sceneDate,"ndvi"\)/],
  ["renders the returned raster as an in-app map overlay", /L\.imageOverlay\(objectUrl,\[\[south,west\],\[north,east\]\]/],
  ["uses a compact image date and NDVI status", /satelliteMapStatus\.textContent="Sentinel-2 · "\+sceneDate/],
  ["keeps the last image when a new request fails", /Dernière image conservée/],
  ["renders weather charts directly below the satellite map", /panel\.append\(satelliteMapPanel,vegetationChart,weatherCharts,uvComparisonPanel\)/],
  ["keeps weather charts visible by default", /\[form,status,satelliteHint,satelliteButton,satelliteResults,details\]\.forEach\(el=>el\.style\.display="none"\)/],
  ["automatically imports weather history when Green Tech opens", /if\(location\.value\)\{importWeather\(false\);if\(lat\.value!==""&&lon\.value!==""\)searchSatellite\(\)/],
  ["compares the two latest real UV dates without manual date entry", /Comparatif UV automatique[\s\S]*?uvDays\[uvDays\.length-2\][\s\S]*?uvDays\[uvDays\.length-1\]/],
  ["builds a vegetation chart from real NDVI raster statistics", /X-NDVI-Stats[\s\S]*?function renderVegetationChart[\s\S]*?NDVI moyen/],
 ];
assert.match(entry, /environmental-data\.js\?v=20261026-weather-charts-1/, "uses a cache-busted module path in the Green Tech entry page");
for (const [label, pattern] of checks) {
  assert.match(source, pattern, label);
  console.log(`✓ ${label}`);
}
console.log(`Passed ${checks.length} Green Tech satellite and chart checks.`);
