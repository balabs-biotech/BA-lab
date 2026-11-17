import fs from "node:fs";
import assert from "node:assert/strict";

const source = fs.readFileSync("batch-tracker/environmental-data.js", "utf8");
const styles = fs.readFileSync("batch-tracker/styles/greentech-workspace.css", "utf8");

assert.ok(source.includes('svg.classList.add("environmental-ndvi-chart")'), "NDVI chart SVG must expose a stable styling hook");
assert.ok(source.includes('line.classList.add("environmental-ndvi-series")'), "NDVI series must expose a stable styling hook");
assert.ok(source.includes('dot.classList.add("environmental-ndvi-point")'), "Every NDVI observation must expose a stable point hook");
assert.ok(styles.includes("#vegetationTrendPanel .environmental-ndvi-chart"), "GreenTech must style the actual NDVI chart, not every SVG indiscriminately");
assert.ok(styles.includes(".environmental-ndvi-series"), "GreenTech must give the NDVI series a deliberate visual treatment");
assert.ok(styles.includes(".environmental-ndvi-point"), "GreenTech must give individual NDVI observations a visible focus/hover state");
console.log("✓ GreenTech NDVI chart exposes scoped series and observation hooks");
