import fs from "node:fs";
import assert from "node:assert/strict";

const css = fs.readFileSync("batch-tracker/tracker.css", "utf8");
const contrast = css.indexOf("Contrast correction — Mycology");
assert.notEqual(contrast, -1, "Mycology contrast correction must exist");

const requiredRules = [
  [/body\[data-domain="mycology"\] \.card[\s\S]*?color: #35251d !important;[\s\S]*?-webkit-text-fill-color: #35251d !important;/,
    "Mycology card content must use dark ink on light paper"],
  [/body\[data-domain="mycology"\] \.card \.statistics-table th[\s\S]*?color: #35251d !important;/,
    "statistics table headers must retain readable dark text"],
  [/body\[data-domain="mycology"\] \.card input,[\s\S]*?background-color: #fffaf4 !important;/,
    "Mycology form controls must use light backgrounds"],
  [/body\[data-domain="mycology"\] \.card \.culture-timeline-entry p[\s\S]*?color: #35251d !important;/,
    "culture timeline text must not inherit the obsolete dark-theme color"],
  [/body\[data-domain="mycology"\] \.statistics-table tbody tr:hover td[\s\S]*?background: #f4e4d7;/,
    "statistics row hover must remain on a light surface"]
];
for (const [pattern, message] of requiredRules) assert.match(css, pattern, message);

const mobileStart = css.lastIndexOf("/* Mobile form alignment:");
assert.notEqual(mobileStart, -1, "dedicated mobile alignment rules must exist");
const mobileEnd = css.indexOf("\n}", mobileStart);
assert.notEqual(mobileEnd, -1, "mobile alignment media query must close");
const mobile = css.slice(mobileStart, mobileEnd);
assert.match(mobile, /@media \(max-width: 700px\)/,
  "mobile alignment safeguards must be inside the 700px breakpoint");
assert.match(mobile, /\.grid,[\s\S]*?#environmentalCard \.grid\s*\{\s*grid-template-columns: minmax\(0, 1fr\) !important;/,
  "mobile grids must collapse to one column");
assert.match(mobile, /input, select, textarea, button\s*\{[^}]*width: 100%;[^}]*min-width: 0;[^}]*max-width: 100%;/,
  "mobile controls must fit their containers");
assert.match(mobile, /input\[type="checkbox"\], input\[type="radio"\]\s*\{[^}]*width: auto;/,
  "checkboxes and radio controls must retain intrinsic width");
assert.match(mobile, /\.statistics-table-wrap,[\s\S]*?overflow-x: auto;/,
  "wide tables must scroll horizontally instead of breaking mobile layout");
assert.match(mobile, /\.statistics-table\s*\{\s*min-width: 560px;/,
  "wide statistics tables must preserve readable columns inside their scroll wrapper");
assert.match(css, /\.statistics-chart svg\s*\{[^}]*width: 100%;[^}]*max-width: 100%;[^}]*height: auto;/,
  "statistics SVG charts must scale to the available width");

console.log("✓ Mycology cards, statistics, timeline and forms use readable light-surface contrast");
console.log("✓ Mobile grids and controls are bounded; wide tables scroll without forcing page overflow");
console.log("✓ Statistics charts scale to the available width");
