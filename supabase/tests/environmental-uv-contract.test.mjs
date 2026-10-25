import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [frontend, onDemand, scheduled] = await Promise.all([
  readFile(new URL("../../batch-tracker/environmental-data.js", import.meta.url), "utf8"),
  readFile(new URL("../functions/nasa-power-agroclimate/index.ts", import.meta.url), "utf8"),
  readFile(new URL("../functions/nasa-power-scheduled-import/index.ts", import.meta.url), "utf8"),
]);

const checks = [
  ["on-demand NASA POWER maps the daily UV index", /ALLSKY_SFC_UV_INDEX:\s*\{\s*variable:\s*"uv_index_daily_mean",\s*unit:\s*"index"/],
  ["scheduled import maps the daily UV index", /ALLSKY_SFC_UV_INDEX:\s*\{\s*variable:\s*"uv_index_daily_mean",\s*unit:\s*"index"/],
  ["cache completeness checks UV coverage", /const coreVariables = \[[\s\S]*?"uv_index_daily_mean"/],
  ["GreenTech shows a daily UV summary", /Indice UV moyen quotidien/],
  ["GreenTech charts the UV time series", /uv_index_daily_mean:\{title:"Indice UV moyen journalier estimé"/],
  ["GreenTech compares UV with the previous period", /compare\("Indice UV moyen quotidien",uvMean,previousUvMean/],
  ["UI warns that daily mean is not the instantaneous UV peak", /pic UV instantané/],
  ["UV estimates retain coarse solar-grid resolution", /ALLSKY_SFC_UV_INDEX:[^\n]*resolution: 111_000/],
];

for (const [label, pattern] of checks) {
  assert.match(label.includes("scheduled") ? scheduled : label.includes("NASA POWER") || label.includes("cache") || label.includes("resolution") ? onDemand : frontend, pattern, label);
  console.log(`✓ ${label}`);
}

console.log(`Passed ${checks.length} environmental UV contract checks.`);
