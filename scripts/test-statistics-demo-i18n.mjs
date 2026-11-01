import fs from "node:fs";
import assert from "node:assert/strict";

const source = fs.readFileSync("batch-tracker/tracker.js", "utf8");
const translations = source.slice(source.indexOf("function getStatisticsTranslations"), source.indexOf("let statisticsRequestId"));
for (const [language, label] of [
  ["fr", "demoNotice"],
  ["en", "demoNotice"],
  ["pt", "demoNotice"],
  ["ar", "demoNotice"]
]) {
  const block = translations.slice(translations.indexOf(language + ":"), translations.indexOf("},", translations.indexOf(language + ":")));
  assert.ok(block.includes(label), language + " must translate synthetic-chart disclosure");
  for (const key of ["demoTitle", "demoMetric", "demoAxis", "demoPoint", "demoTitleAgronomy", "demoMetricAgronomy", "demoTitleMycology", "demoMetricMycology", "demoTitleLaboratory", "demoMetricLaboratory"]) {
    assert.ok(block.includes(key), language + " must translate " + key);
  }
}
assert.match(source, /title:L\["demoTitle"\+\(demoDomain === "agronomy"/,\n  "each workspace must use its own localized synthetic chart title");\nassert.match(source, /metric:L\["demoMetric"\+\(demoDomain === "agronomy"/,\n  "each workspace must use its own localized synthetic chart metric");\nassert.match(source, /title:L\.demoTitle, metric:L\.demoMetric/,
  "synthetic chart title and metric must use the selected language");
assert.match(source, /pointTitle\.textContent=L\.demoPoint/,
  "synthetic chart point labels must use the selected language");
assert.match(source, /axis\.textContent=L\.demoAxis/,
  "synthetic chart axis must use the selected language");
assert.match(source, /note\.textContent=L\.demoNotice/,
  "synthetic data disclosure must use the selected language");
assert.match(source, /Non mesuré, non enregistré et jamais mélangé/,
  "French disclosure must explicitly distinguish synthetic and organization data");
assert.match(source, /Not measured, not stored, and never mixed/,
  "English disclosure must explicitly distinguish synthetic and organization data");

console.log("✓ Synthetic statistics charts are localized in FR, EN, PT and AR");
console.log("✓ Synthetic data remain explicitly disclosed as non-measured and non-persistent");
