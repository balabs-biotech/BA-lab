import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const base = "batch-tracker";
await import("../batch-tracker/forecast-rules.js");
const forecastRules = globalThis.BALabsForecastRules;
assert.ok(forecastRules && typeof forecastRules.evaluateTemperatureRange === "function", "forecast rules module must expose its deterministic evaluator");
assert.deepEqual(
  forecastRules.evaluateTemperatureRange([10, 20, 30], "15", "25").outsideHours,
  2,
  "temperature range should count both low and high excursions"
);
const missingTemperatureResult = forecastRules.evaluateTemperatureRange([null, undefined, "", 15, "20"], "15", "20");
assert.equal(missingTemperatureResult.status, "within_range", "missing readings must not be counted as zero");
assert.equal(missingTemperatureResult.availableHours, 2, "only numeric readings should be counted");
assert.equal(forecastRules.evaluateTemperatureRange([10, 20], "30", "10").status, "invalid_range", "reversed limits must be rejected");
assert.equal(forecastRules.evaluateTemperatureRange([10, 20], "", "").status, "not_configured", "empty limits must not imply a safe range");
assert.equal(forecastRules.evaluateTemperatureRange([null, ""], "5", "30").status, "no_data", "missing forecast values must not be reported as safe");

const summary = JSON.parse(readFileSync(`${base}/data/osint-ndvi-transitions.json`, "utf8"));
const csv = readFileSync(`${base}/data/osint-priority-zones.csv`, "utf8").trim().split(/\r?\n/);
const headers = csv.shift().split(",");

assert.equal(summary.schema_version, 1, "unsupported NDVI summary schema");
assert.equal(summary.observations.length, 5, "expected five Sentinel-2 observations");
assert.equal(summary.transitions.length, summary.observations.length - 1, "each adjacent observation pair needs one transition");
assert.ok(summary.aoi.bbox.length === 4 && summary.aoi.bbox.every(Number.isFinite), "AOI bbox must contain four numbers");

for (let i = 0; i < summary.observations.length; i++) {
  const o = summary.observations[i];
  assert.match(o.date, /^\d{4}-\d{2}-\d{2}$/, "observation date must be ISO format");
  for (const key of ["median_ndvi", "mean_ndvi", "p10", "p90"]) {
    assert.ok(Number.isFinite(o[key]) && o[key] >= -1 && o[key] <= 1, `${o.date}: invalid ${key}`);
  }
  assert.ok(Number.isFinite(o.valid_aoi_pct) && o.valid_aoi_pct > 0 && o.valid_aoi_pct <= 100, `${o.date}: invalid coverage`);
}
for (let i = 0; i < summary.transitions.length; i++) {
  const t = summary.transitions[i];
  assert.equal(t.date_depart, summary.observations[i].date, "transition start does not match observation");
  assert.equal(t.date_arrivee, summary.observations[i + 1].date, "transition end does not match observation");
  assert.ok(Number.isFinite(t.delta_NDVI_median), "median NDVI delta must be numeric");
  assert.ok(Number.isFinite(t.couverture_comparable_pct) && t.couverture_comparable_pct > 0 && t.couverture_comparable_pct <= 100, "invalid comparable coverage");
  const parts = [t.hausse_sup_0_05_pct, t.baisse_inf_moins_0_05_pct, t.variation_faible_ou_moderee_pct];
  assert.ok(parts.every(v => Number.isFinite(v) && v >= 0 && v <= 100), "transition percentages must be within 0–100");
  assert.ok(Math.abs(parts.reduce((a, b) => a + b, 0) - 100) < 0.1, "transition percentage classes must sum to 100%");
}

assert.equal(headers.length, 10, "unexpected priority-zone CSV schema");
assert.equal(csv.length, 65, "expected 65 candidate locations");
const bbox = summary.aoi.bbox;
const seen = new Set();
for (const line of csv) {
  const values = line.split(",");
  assert.equal(values.length, headers.length, "CSV row width mismatch");
  const z = Object.fromEntries(headers.map((h, i) => [h, Number(values[i])]));
  assert.ok(Number.isInteger(z.zone_id) && !seen.has(z.zone_id), "zone IDs must be unique integers");
  seen.add(z.zone_id);
  // Permit 0.001° (~100 m) around the nominal bbox for raster-grid edge/centroid alignment.
  const edgeTolerance = 0.001;
  assert.ok(Number.isFinite(z.longitude) && z.longitude >= bbox[0] - edgeTolerance && z.longitude <= bbox[2] + edgeTolerance, `zone ${z.zone_id}: longitude outside AOI edge tolerance`);
  assert.ok(Number.isFinite(z.latitude) && z.latitude >= bbox[1] - edgeTolerance && z.latitude <= bbox[3] + edgeTolerance, `zone ${z.zone_id}: latitude outside AOI edge tolerance`);
  assert.ok(Number.isFinite(z.surface_ha) && z.surface_ha > 0, `zone ${z.zone_id}: invalid surface`);
  assert.ok(z.pixels_3_baisses_ou_plus_pct >= 0 && z.pixels_3_baisses_ou_plus_pct <= 100, `zone ${z.zone_id}: invalid repeated-decline percentage`);
}

execFileSync("node", ["--check", `${base}/osint-ndvi.js`], { stdio: "inherit" });
execFileSync("node", ["--check", `${base}/environmental-data.js`], { stdio: "inherit" });
execFileSync("node", ["--check", `${base}/forecast-rules.js`], { stdio: "inherit" });
console.log("OSINT checks passed: NDVI integrity, 65 candidate points, deterministic forecast rules, missing-data handling, and JavaScript syntax.");
