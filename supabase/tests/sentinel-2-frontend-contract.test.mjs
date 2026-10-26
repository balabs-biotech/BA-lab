import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [source, entry, i18n] = await Promise.all([
  readFile(new URL("../../batch-tracker/environmental-data.js", import.meta.url), "utf8"),
  readFile(new URL("../../batch-tracker/green-tech/index.html", import.meta.url), "utf8"),
  readFile(new URL("../../batch-tracker/i18n.js", import.meta.url), "utf8"),
]);
const checks = [
  ["loads the satellite panel immediately after the Green Tech hero", /hero\.parentNode\.insertBefore\(panel,hero\.nextSibling\)/],
  ["restores the last used location automatically", /localStorage\.getItem\("ba-labs-active-environment-location"\)/],
  ["automatically selects a configured location when no previous site exists", /const preferred=saved\|\|data\.find/],
  ["waits for the map to initialize before requesting imagery", /async function selectLocation\(\)[\s\S]*?await updateSatelliteMap\(\);/],
  ["searches the satellite catalogue automatically on initial load", /await loadLocations\(\);\s*if\(location\.value\)\{importWeather\(false\);if\(lat\.value!==""&&lon\.value!==""\)searchSatellite\(\);/],
  ["prioritizes the public AWS Open Data catalogue before the Copernicus fallback", /earth-search-sentinel2-catalogue[\s\S]*?copernicus-sentinel-catalogue/],
  ["automatically searches again when the selected location changes", /location\.addEventListener\("change"[\s\S]*?searchSatellite\(\)/],
  ["prioritizes recent scenes with at most 30% cloud cover", /usableA=cloudA<=30\?0:1[\s\S]*?return usableA===0\?dateB-dateA/],
  ["automatically requests a rendered Sentinel-2 NDVI image", /await showSentinelNDVI\(sceneDate,"ndvi"\)/],
  ["renders the returned raster as an in-app map overlay", /L\.imageOverlay\(objectUrl,\[\[south,west\],\[north,east\]\]/],
  ["uses a compact image date and NDVI status", /satelliteMapStatus\.textContent="Sentinel-2 · "\+sceneDate/],
  ["keeps the last image when a new request fails", /Dernière image conservée/],
  ["renders weather charts directly below the satellite map", /panel\.append\(satelliteMapPanel,vegetationChart,agroSynthesisPanel,weatherCharts,uvComparisonPanel\)/],
  ["keeps weather charts visible by default", /\[form,status,satelliteHint,satelliteButton,satelliteResults,details\]\.forEach\(el=>el\.style\.display="none"\)/],
  ["automatically imports weather history when Green Tech opens", /if\(location\.value\)\{importWeather\(false\);if\(lat\.value!==""&&lon\.value!==""\)searchSatellite\(\)/],
  ["compares the two latest real UV dates without manual date entry", /Comparatif UV automatique[\s\S]*?uvDays\[uvDays\.length-2\][\s\S]*?uvDays\[uvDays\.length-1\]/],
  ["builds a vegetation chart from real NDVI raster statistics", /X-NDVI-Stats[\s\S]*?function renderVegetationChart[\s\S]*?NDVI moyen/],
  ["shows a coverage-aware agronomic synthesis", /function renderAgroSynthesis[\s\S]*?Couverture météo[\s\S]*?Les dates sans valeur ne sont pas assimilées à zéro/],
  ["keeps satellite acquisition dates independent from the weather period", /Keep the weather date range independent from the satellite acquisition date/],
  ["compares NDVI only against a previous scene with at most 30% cloud cover", /previousScene=rankedScenes\.find\(scene=>Number\(scene\.cloud_cover_percent\)<=30/],
  ["preserves the latest observation when a date and variable have duplicates", /hasOwnProperty\.call\(byDate\.get\(day\),r\.variable_code\)/],
  ["labels partial rainfall totals explicitly", /Cumul partiel · /],
  ["calculates agronomic coverage against calendar days, including missing days", /windowStart=Math\.max\(firstDay,lastDay-6\*86400000\)[\s\S]*?windowObservations/],
 ];
assert.match(entry, /environmental-data\.js\?v=20261026-agro-coherence-2/, "uses a cache-busted environmental module path");
assert.match(entry, /i18n\.js\?v=20261026-green-tech-i18n-4/, "uses a cache-busted localization module path");
assert.match(i18n, /Lecture agronomique/, "contains localized agronomic synthesis labels");
assert.match(i18n, /Vegetation trend \(NDVI\)/, "contains localized satellite chart labels");
assert.match(i18n, /Qualidade dos dados:/, "contains localized data-quality diagnostics in Portuguese");
assert.match(i18n, /جودة البيانات:/, "contains localized data-quality diagnostics in Arabic");
for (const [label, pattern] of checks) {
  assert.match(source, pattern, label);
  console.log(`✓ ${label}`);
}
console.log(`Passed ${checks.length} Green Tech satellite and chart checks.`);
