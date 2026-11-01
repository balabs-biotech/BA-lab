import fs from "node:fs";
import assert from "node:assert/strict";

const source = fs.readFileSync("batch-tracker/tracker.js", "utf8");
const translations = source.slice(source.indexOf("function getStatisticsTranslations"), source.indexOf("let statisticsRequestId"));
const blocks = {
  fr: translations.match(/fr: \\{([\\s\\S]*?)\\n    \\},/)[1],
  en: translations.match(/en: \\{([\\s\\S]*?)\\n    \\},/)[1],
  pt: translations.match(/pt: \\{([\\s\\S]*?)\\n    \\},/)[1],
  ar: translations.match(/ar: \\{([\\s\\S]*?)\\n  \\};/)[1]
};
const keys = [
  "demoTitleAgronomy", "demoMetricAgronomy",
  "demoTitleMycology", "demoMetricMycology",
  "demoTitleLaboratory", "demoMetricLaboratory",
  "demoAxis", "demoPoint", "demoNotice"
];
for (const [language, block] of Object.entries(blocks)) {
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
assert.ok(source.includes("Non mesuré, non enregistré et jamais mélangé"),
  "French disclosure must explicitly distinguish synthetic and organization data");
assert.ok(source.includes("Not measured, not stored, and never mixed"),
  "English disclosure must explicitly distinguish synthetic and organization data");

console.log("✓ Synthetic statistics charts are localized by workspace in FR, EN, PT and AR");
console.log("✓ Synthetic data remain explicitly disclosed as non-measured and non-persistent");
