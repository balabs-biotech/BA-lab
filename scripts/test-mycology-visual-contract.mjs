import fs from "node:fs";
import assert from "node:assert/strict";

const css = fs.readFileSync("batch-tracker/tracker.css", "utf8");
const mobile = css.lastIndexOf("@media (max-width: 700px)");
const contrast = css.indexOf("Contrast correction — Mycology");
assert.notEqual(contrast, -1, "Mycology contrast correction must exist");
assert.ok(mobile > contrast, "mobile layout safeguards must follow the Mycology contrast correction");

const requiredRules = [
  [/body\\[data-domain="mycology"\\] \\.card[\\s\\S]*?color: #35251d !important;[\\s\\S]*?-webkit-text-fill-color: #35251d !important;/,
    "Mycology card content must use dark ink on light paper"],
  [/body\\[data-domain="mycology"\\] \\.card \\.statistics-table th[\\s\\S]*?color: #35251d !important;/,
    "statistics table headers must retain readable dark text"],
  [/body\\[data-domain="mycology"\\] \\.card input,[\\s\\S]*?background-color: #fffaf4 !important;/,
    "Mycology form controls must use light backgrounds"],
  [/body\\[data-domain="mycology"\\] \\.card \\.culture-timeline-entry p[\\s\\S]*?color: #35251d !important;/,
    "culture timeline text must not inherit the obsolete dark-theme color"],
  [/body\\[data-domain="mycology"\\] \\.statistics-table tbody tr:hover td[\\s\\S]*?background: #f4e4d7;/,
    "statistics row hover must remain on a light surface"],
  [/\\.statistics-table-wrap,[\\s\\S]*?overflow-x: auto;/,
    "wide tables must scroll horizontally instead of breaking mobile layout"],
  [/\\.grid,[\\s\\S]*?grid-template-columns: minmax\\(0, 1fr\\) !important;/,
    "mobile form grids must collapse to one column"]
];
for (const [pattern, message] of requiredRules) assert.match(css, pattern, message);

console.log("✓ Mycology cards, statistics, timeline and forms use readable light-surface contrast");
console.log("✓ Mobile grids collapse and wide tables remain horizontally scrollable");
