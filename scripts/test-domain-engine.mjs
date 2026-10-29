import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../batch-tracker/domain-engine.js", import.meta.url), "utf8");
const trackerSource = await readFile(new URL("../batch-tracker/tracker.js", import.meta.url), "utf8");
assert.match(trackerSource, /agronomy:\s*\{\s*cultureTitle: "Nouvelle culture agronomique"/,
  "Green Tech must use agronomy-specific culture entry labels");
assert.match(trackerSource, /mycology:\s*\{\s*cultureTitle: "Nouvelle culture fongique"/,
  "Mycology must use mycology-specific culture entry labels");
assert.match(trackerSource, /laboratory:\s*\{\s*cultureTitle: "Nouvelle culture de laboratoire"/,
  "Laboratory must use laboratory-specific culture entry labels");
assert.match(trackerSource, /filterMeasurementVariables\(\s*measurementVariables,\s*document\.body\.dataset\.domain\s*\)/,
  "measurement filters must receive the active workspace domain");
assert.match(trackerSource, /if \(cultureEntryTitle\) cultureEntryTitle\.textContent = entryLabels\.cultureTitle;/,
  "workspace labels must be selected from the active domain configuration");
assert.match(trackerSource, /if \(persist && organizationId\) \{[\s\S]*?await loadMeasurementReferences\(\);[\s\S]*?loadRecentMeasurements\(\)[\s\S]*?loadRecentObservations\(\)/,
  "switching workspaces while signed in must refresh domain-specific selectors and histories");
assert.match(trackerSource, /if \(activeDomain === "agronomy"\) \{\s*hideElement\(trackerCard\);\s*hideElement\(batchCard\);\s*showElement\(plantCard\);/,
  "Green Tech must switch to the plant registry after a live workspace change");
assert.match(trackerSource, /const switchRevision = \+\+workspaceSwitchRevision;[\s\S]*?await loadCultureOptions\(\);[\s\S]*?await loadLatestBatches\(\);/,
  "switching between Mycology and Laboratory must reload domain-scoped culture targets and batches within the guarded refresh sequence");
assert.match(trackerSource, /const requestedCultures = cultureOptions\.slice\(\);[\s\S]*?const visibleCultureIds = new Set\(requestedCultures\.map\(culture => culture\.id\)\);\s*latestBatches = \(data \|\| \[\]\)\.filter\(batch =>\s*Boolean\(batch\.culture_id && visibleCultureIds\.has\(batch\.culture_id\)\)\s*\);/,
  "batch lists must be scoped to the captured workspace culture registry");
assert.match(trackerSource, /const requestedDomain = document\.body\.dataset\.domain;[\s\S]*?requestedDomain !== document\.body\.dataset\.domain\) return;/,
  "late culture registry responses must be discarded after a workspace switch");
assert.match(trackerSource, /const requestedCultures = cultureOptions\.slice\(\);[\s\S]*?requestedDomain !== document\.body\.dataset\.domain\) return;[\s\S]*?requestedCultures\.map\(culture => culture\.id\)/,
  "late batch responses must be discarded and batches must use the captured culture registry");
assert.match(trackerSource, /const requestedDomain = document\.body\.dataset\.domain \|\| "mycology";[\s\S]*?requestedPlants = plantCultureOptions\.slice\(\);[\s\S]*?stale: requestedOrganizationId !== organizationId/,
  "history pagination must detect workspace or organization changes during awaits");
assert.match(trackerSource, /belongsToActiveWorkspace\(row, eventsById, requestedDomain, \{[\s\S]*?cultures: requestedCultures,[\s\S]*?plants: requestedPlants,[\s\S]*?batches: requestedBatches/,
  "history filtering must use the workspace and registry snapshots captured at request start");
assert.match(trackerSource, /if \(stale \|\| requestedDomain !== \(document\.body\.dataset\.domain \|\| "mycology"\)\) return;/,
  "stale measurement and observation requests must not overwrite the active workspace UI");
assert.match(trackerSource, /async function loadMeasurementReferences\(\)[\s\S]*?const requestedDomain = document\.body\.dataset\.domain \|\| "mycology";[\s\S]*?const requestedOrganizationId = organizationId;[\s\S]*?requestedOrganizationId !== organizationId \|\|[\s\S]*?requestedDomain !== \(document\.body\.dataset\.domain \|\| "mycology"\)\) return;/,
  "late measurement reference responses must not overwrite selectors after an organization or workspace switch");
assert.match(trackerSource, /async function loadMeasurementReferences\(\)[\s\S]*?catch \(error\) \{[\s\S]*?requestedOrganizationId !== organizationId \|\|[\s\S]*?throw error;/,
  "late network-level measurement reference failures must be ignored after an organization or workspace switch");
assert.match(trackerSource, /async function claimBALabs\(revision = authStateRevision\)[\s\S]*?await getCurrentSession\(\);[\s\S]*?revision !== authStateRevision[\s\S]*?await supabaseClient\.functions\.invoke\([\s\S]*?revision !== authStateRevision/,
  "a stale authentication claim must not bind an organization after sign-out or a newer auth transition");
assert.match(trackerSource, /async function initializeAuthenticatedTracker\([\s\S]*?await claimBALabs\(initRevision\);[\s\S]*?if \(initRevision !== authStateRevision\) return;[\s\S]*?await loadStrainOptions\(\);\s*if \(initRevision !== authStateRevision\) return;[\s\S]*?await loadReferenceData\(\);\s*if \(initRevision !== authStateRevision\) return;/,
  "authentication initialization must stop after each awaited stage when a newer auth state supersedes it");

assert.match(trackerSource, /async function loadPlantCultures\(\)[\s\S]*?requestedOrganizationId !== organizationId \|\|[\s\S]*?requestedDomain !== document\.body\.dataset\.domain \|\|[\s\S]*?requestedDomain !== "agronomy"\) return;/,
  "late plant-registry responses must be discarded after leaving Green Tech");
assert.match(trackerSource, /async function savePlantCulture\(event\)[\s\S]*?const requestedOrganizationId = organizationId;[\s\S]*?organization_id: requestedOrganizationId,[\s\S]*?if \(requestedOrganizationId !== organizationId \|\|[\s\S]*?requestedDomain !== "agronomy"\) return;[\s\S]*?form\.reset\(\);/,
  "plant culture saves must remain bound to the submitting organization and avoid resetting a different workspace after await");
assert.match(trackerSource, /let workspaceSwitchRevision = 0;[\s\S]*?const switchRevision = \+\+workspaceSwitchRevision;[\s\S]*?switchRevision !== workspaceSwitchRevision/,
  "workspace refresh tasks must stop when a newer workspace switch supersedes them");

assert.match(trackerSource, /async function loadPlantCultures\(\)[\s\S]*?loadOrganizationRowsInPages\(\s*"plant_cultures"/,
  "plant registry must paginate instead of silently truncating at 300 records");
assert.match(trackerSource, /async function loadOrganizationRowsInPages\([\s\S]*?const requestedOrganizationId = organizationId;[\s\S]*?\.eq\("organization_id", requestedOrganizationId\)[\s\S]*?if \(requestedOrganizationId !== organizationId\) return \[\];/,
  "paginated registry reads must stay bound to the organization captured at request start");
assert.match(trackerSource, /await loadCultureOptions\(\);\s*if \(switchRevision !== workspaceSwitchRevision \|\|[\s\S]*?await loadLatestBatches\(\);\s*if \(switchRevision !== workspaceSwitchRevision \|\|[\s\S]*?await loadMeasurementReferences\(\);\s*if \(switchRevision !== workspaceSwitchRevision \|\|/,
  "workspace refresh must revalidate its revision after each asynchronous loader before starting the next stage");
assert.match(trackerSource, /async function loadRecentWorkspaceHistory\([\s\S]*?\.range\(offset, offset \+ pageSize - 1\)[\s\S]*?belongsToActiveWorkspace\(row, eventsById, requestedDomain[\s\S]*?visibleRows\.length >= displayLimit/,
  "measurement and observation histories must paginate before workspace filtering using the captured workspace");
assert.match(trackerSource, /loadRecentWorkspaceHistory\(\s*"measurements"[\s\S]*?10\s*\)/,
  "measurement history must request the newest ten records belonging to the active workspace");
assert.match(trackerSource, /loadRecentWorkspaceHistory\(\s*"observations"[\s\S]*?8\s*\)/,
  "observation history must request the newest eight records belonging to the active workspace");
assert.match(trackerSource, /filterMeasurementVariables\(\s*\[variable\],\s*window\.BALabsDomainEngine\.normalizeDomain\(document\.body\.dataset\.domain\)\s*\)\.length/,
  "manual measurements and observations must reject variables outside the active workspace");
assert.match(trackerSource, /cultureOptions = \[\];\s*latestBatches = \[\];\s*renderMeasurementTargets\(\);/,
  "switching to Green Tech must clear stale biological targets before loading plant records");
assert.match(trackerSource, /else \{\s*showElement\(trackerCard\);\s*showElement\(batchCard\);\s*hideElement\(plantCard\);/,
  "Mycology and Laboratory must restore culture and batch modules after a live workspace change");
const window = {};
vm.runInNewContext(source, { window });

const engine = window.BALabsDomainEngine;
assert.ok(engine, "domain engine must register on window");
assert.deepEqual(Array.from(engine.domains), ["agronomy", "mycology", "laboratory"]);

const types = [
  { code: "agar" }, { code: "grain_spawn" }, { code: "tomato" }, { code: "other" }
];
assert.deepEqual(
  Array.from(engine.filterCultureTypes(types, "agronomy"), item => item.code),
  [],
  "Green Tech must not expose mycology culture types"
);
assert.deepEqual(
  Array.from(engine.filterCultureTypes(types, "mycology"), item => item.code),
  ["agar", "grain_spawn", "other"],
  "Mycology must expose only its allowed culture types"
);
assert.deepEqual(
  Array.from(engine.filterCultureTypes(types, "laboratory"), item => item.code),
  ["agar", "grain_spawn", "tomato", "other"],
  "Laboratory must retain all culture types"
);

const variables = [
  { code: "ph" }, { code: "root_length" }, { code: "od600" }, { code: "viability" }
];
assert.deepEqual(
  Array.from(engine.filterMeasurementVariables(variables, "agronomy"), item => item.code),
  ["ph", "root_length"]
);
assert.deepEqual(
  Array.from(engine.filterMeasurementVariables(variables, "mycology"), item => item.code),
  ["ph", "od600", "viability"]
);
assert.deepEqual(
  Array.from(engine.filterMeasurementVariables(variables, "laboratory"), item => item.code),
  ["ph", "root_length", "od600", "viability"]
);
assert.equal(engine.normalizeDomain("unknown"), "laboratory");

console.log("Domain engine contracts passed.");

// Workspace registries must paginate organization rows before filtering by domain.
assert.match(trackerSource, /async function loadOrganizationRowsInPages\([\s\S]*?\.range\(offset, offset \+ pageSize - 1\)[\s\S]*?if \(page\.length < pageSize\) break;/,
  "organization registry loading must paginate until the final partial page");
assert.match(trackerSource, /async function loadOrganizationRowsInPages\([\s\S]*?\.order\("created_at", \{ ascending: false \}\)\s*\.order\("id", \{ ascending: false \}\)/,
  "registry pagination must use a deterministic tie-breaker to avoid skipped or duplicated rows");
assert.match(trackerSource, /async function loadCultureOptions\(\)[\s\S]*?loadOrganizationRowsInPages\(\s*"cultures"/,
  "culture loading must paginate before workspace filtering");
assert.match(trackerSource, /async function loadLatestBatches\(\)[\s\S]*?loadOrganizationRowsInPages\(\s*"batches"/,
  "batch loading must paginate before source-culture filtering");
