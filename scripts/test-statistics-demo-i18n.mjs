import fs from "node:fs";
import assert from "node:assert/strict";

const source = fs.readFileSync("batch-tracker/tracker.js", "utf8");
const translations = source.slice(source.indexOf("function getStatisticsTranslations"), source.indexOf("let statisticsRequestId"));
function languageBlock(language) {
  const start = translations.indexOf(language + ": {");
  assert.notEqual(start, -1, "missing translation block: " + language);
  const end = language === "ar" ? translations.indexOf("\n  };", start) : translations.indexOf("},", start);
  assert.notEqual(end, -1, "unterminated translation block: " + language);
  return translations.slice(start, end);
}
const keys = [
  "demoTitleAgronomy", "demoMetricAgronomy",
  "demoTitleMycology", "demoMetricMycology",
  "demoTitleLaboratory", "demoMetricLaboratory",
  "demoAxis", "demoPoint", "demoNotice"
];
for (const language of ["fr", "en", "pt", "ar"]) {
  const block = languageBlock(language);
  for (const key of keys) assert.ok(block.includes(key), language + " must translate " + key);
}
assert.ok(source.includes('title:L["demoTitle"+(demoDomain === "agronomy"'),
  "each workspace must use its own localized synthetic chart title");
assert.ok(source.includes('metric:L["demoMetric"+(demoDomain === "agronomy"'),
  "each workspace must use its own localized synthetic chart metric");
assert.ok(source.includes("pointTitle.textContent=L.demoPoint"),
  "synthetic chart point labels must use the selected language");
assert.ok(source.includes("axis.textContent=L.demoAxis"),
  "synthetic chart axis must use the selected language");
assert.ok(source.includes("note.textContent=L.demoNotice"),
  "synthetic data disclosure must use the selected language");
assert.ok(source.includes('domain === "mycology" ? "#a94f1d" : domain === "agronomy" ? "#65b982" : "#215b91"'),
  "real measurement chart lines must follow the workspace color palette");
assert.ok(source.includes('const chartLocale = lang === "ar" ? "ar-DZ"'),
  "measurement chart dates must follow the selected language");
assert.ok(source.includes('svg.setAttribute("aria-label",L.chartEvolution+'),
  "measurement chart accessibility label must be localized");
assert.ok(source.includes("Non mesuré, non enregistré et jamais mélangé"),
  "French disclosure must explicitly distinguish synthetic and organization data");
assert.ok(source.includes("Not measured, not stored, and never mixed"),
  "English disclosure must explicitly distinguish synthetic and organization data");

console.log("✓ Synthetic statistics charts are localized by workspace in FR, EN, PT and AR");
console.log("✓ Synthetic data remain explicitly disclosed as non-measured and non-persistent");
