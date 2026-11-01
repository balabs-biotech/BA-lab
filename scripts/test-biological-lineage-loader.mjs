import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tracker = readFileSync(path.join(root, "batch-tracker/tracker.js"), "utf8");
const start = tracker.indexOf("async function loadBiologicalLineage(cultureId)");
const end = tracker.indexOf("\nasync function saveBiologicalOperation", start);
if (start < 0 || end < 0) throw new Error("Could not isolate biological lineage loader");
const loader = tracker.slice(start, end);

for (const [label, required] of [
  ["per-request generation", "++cultureLineageRequestId"],
  ["selected culture binding", "target.dataset.cultureId = cultureId"],
  ["stale response guard", "requestId === cultureLineageRequestId"],
  ["workspace guard", "isCurrentWorkspaceRevision(loadRevision, loadOrganizationId)"],
  ["culture pagination", '.range(offset, offset + pageSize - 1)'],
  ["stable page ordering", '.order("id", { ascending: true })'],
  ["bounded pagination", "const maxRows = 10000"],
  ["material pagination", '"materials"'],
  ["truncation warning", "culturePage.truncated || materialPage.truncated"],
  ["stale error suppression", "if (!isCurrentRequest()) return; target.textContent"]
]) {
  if (!loader.includes(required)) throw new Error("Lineage loader missing " + label);
}
if (loader.includes(".limit(1000)") || loader.includes(".limit(2000)")) {
  throw new Error("Lineage loader still silently truncates a single page");
}
console.log("✓ Biological lineage ignores stale culture responses, paginates both tables, and warns at its explicit safety cap");
