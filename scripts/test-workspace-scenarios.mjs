import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const engine = fs.readFileSync("batch-tracker/tracker.js", "utf8");
const marker = "function renderMeasurementTargets()";
const start = engine.indexOf(marker);
if (start < 0) throw new Error("renderMeasurementTargets() not found");
const open = engine.indexOf("{", start);
let depth = 0;
let end = -1;
for (let i = open; i < engine.length; i++) {
  if (engine[i] === "{") depth++;
  if (engine[i] === "}") {
    depth--;
    if (depth === 0) { end = i + 1; break; }
  }
}
if (end < 0) throw new Error("Could not extract renderMeasurementTargets()");
const functionSource = engine.slice(start, end);


function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(name + "() not found");
  const signatureEnd = source.indexOf(") {", start);
  if (signatureEnd < 0) throw new Error("Could not find body for " + name + "()");
  const open = signatureEnd + 2;
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error("Could not extract " + name + "()");
}

function callHelper(name, args, domain) {
  const source = extractFunction(engine, name);
  return vm.runInNewContext(
    `${source}; ${name}(...injected.args, injected.domain)`,
    { injected: { args, domain }, document: { body: { dataset: { domain } } } }
  );
}

function fakeElement(tag) {
  return {
    tag, value: "", textContent: "", label: "", children: [],
    appendChild(child) { this.children.push(child); return child; },
    replaceChildren(...children) { this.children = children; this.value = ""; },
    get options() {
      const flatten = nodes => nodes.flatMap(node =>
        node.tag === "optgroup" ? flatten(node.children) : [node]
      );
      return flatten(this.children);
    }
  };
}

function scenario(domain, previous = "") {
  const measurementTargetSelect = fakeElement("select");
  measurementTargetSelect.value = previous;
  const document = {
    body: { dataset: { domain } },
    createElement: fakeElement
  };
  const cultureOptions = domain === "mycology"
    ? [{ id: "fungus-1", code: "MYC-001", culture_type: "agar" }]
    : domain === "laboratory"
      ? [{ id: "lab-1", code: "LAB-001", culture_type: "liquid" }]
      : [];
  const plantCultureOptions = [
    { id: "plant-1", code: "DF1", cultivar_name: "Marmande", crop_type: "tomato" }
  ];
  const latestBatches = [
    { id: "batch-1", batch_code: "BT-001", name: "Test batch", batch_type: "TRICHODERMA" }
  ];
  vm.runInNewContext(
    `const measurementTargetSelect = injected.select;
     const document = injected.document;
     const cultureOptions = injected.cultures;
     const plantCultureOptions = injected.plants;
     const latestBatches = injected.batches;
     ${functionSource}
     renderMeasurementTargets();`,
    { injected: { select: measurementTargetSelect, document, cultures: cultureOptions, plants: plantCultureOptions, batches: latestBatches } }
  );
  return {
    select: measurementTargetSelect,
    values: measurementTargetSelect.options.map(option => option.value),
    labels: measurementTargetSelect.children.filter(node => node.tag === "optgroup").map(node => node.label),
    placeholder: measurementTargetSelect.children[0]?.textContent
  };
}

const greenTech = scenario("agronomy");
assert.deepEqual(greenTech.values, ["", "plant:plant-1"]);
assert.deepEqual(greenTech.labels, ["Unités végétales · Green Tech"]);
assert.equal(greenTech.select.value, ""); // Explicit target choice is required.
assert.match(greenTech.placeholder, /cible de cet univers/);

const mycology = scenario("mycology");
assert.deepEqual(mycology.values, ["", "culture:fungus-1"]);
assert.deepEqual(mycology.labels, ["Cultures mycologiques"]);
assert.equal(mycology.select.value, ""); // Explicit target choice is required.
assert.ok(!mycology.values.some(value => value.startsWith("plant:") || value.startsWith("batch:")));

const laboratory = scenario("laboratory");
assert.deepEqual(laboratory.values, ["", "culture:lab-1", "batch:batch-1"]);
assert.deepEqual(laboratory.labels, ["Cultures de laboratoire", "Lots de laboratoire"]);
assert.equal(laboratory.select.value, ""); // Explicit target choice is required.
assert.ok(!laboratory.values.some(value => value.startsWith("plant:")));

const preserve = scenario("agronomy", "plant:plant-1");
assert.equal(preserve.select.value, "plant:plant-1");
const rejectCrossUniversePrevious = scenario("agronomy", "batch:batch-1");
assert.equal(rejectCrossUniversePrevious.select.value, "plant:plant-1");

console.log("✓ Scenario Green Tech: only plant units are selectable");
console.log("✓ Scenario Mycology: only biological culture targets are selectable");
console.log("✓ Scenario Laboratory: lab cultures and production batches are selectable");
console.log("✓ Scenario navigation: valid selection is preserved; cross-universe selection is discarded");

function recordScenario(record, eventsById, domain, cultures, plants, batches) {
  const source = extractFunction(engine, "belongsToActiveWorkspace");
  return vm.runInNewContext(
    `${source}; belongsToActiveWorkspace(injected.record, injected.events)`,
    {
      injected: { record, events: eventsById },
      document: { body: { dataset: { domain } } },
      cultureOptions: cultures,
      plantCultureOptions: plants,
      latestBatches: batches
    }
  );
}

const typeCatalogue = [
  "agar", "plate", "slant", "broth", "flask", "other_liquid", "grain_spawn", "substrate", "fermentation", "other",
  "organoid", "suspension", "micropropagation", "solid"
].map(code => ({ code }));
const mycologyTypes = Array.from(callHelper("workspaceCultureTypes", [typeCatalogue], "mycology"), item => item.code);
const labTypes = Array.from(callHelper("workspaceCultureTypes", [typeCatalogue], "laboratory"), item => item.code);
const agronomyTypes = Array.from(callHelper("workspaceCultureTypes", [typeCatalogue], "agronomy"), item => item.code);
assert.ok(mycologyTypes.includes("agar") && mycologyTypes.includes("broth"));
assert.ok(mycologyTypes.includes("grain_spawn") && mycologyTypes.includes("substrate"));
assert.ok(!mycologyTypes.includes("organoid") && !mycologyTypes.includes("micropropagation"));
assert.equal(labTypes.length, typeCatalogue.length);
assert.deepEqual(agronomyTypes, []);

const variableCatalogue = [
  "ph", "temperature", "electrical_conductivity", "relative_humidity",
  "substrate_moisture", "co2_concentration", "cfu", "cfu_per_ml",
  "colony_count", "od600", "root_length", "illuminance", "generation_time"
].map(code => ({ code }));
const agronomyVariables = Array.from(callHelper("workspaceMeasurementVariables", [variableCatalogue], "agronomy"), item => item.code);
const mycologyVariables = Array.from(callHelper("workspaceMeasurementVariables", [variableCatalogue], "mycology"), item => item.code);
const labVariables = Array.from(callHelper("workspaceMeasurementVariables", [variableCatalogue], "laboratory"), item => item.code);
assert.ok(agronomyVariables.includes("ph") && agronomyVariables.includes("substrate_moisture"));
assert.ok(!agronomyVariables.includes("cfu") && !agronomyVariables.includes("od600"));
assert.ok(mycologyVariables.includes("cfu") && mycologyVariables.includes("od600"));
assert.ok(!mycologyVariables.includes("root_length"));
assert.equal(labVariables.length, variableCatalogue.length);

assert.ok(engine.includes('query = query.eq("plant_culture_id", plantCultureId)'));
assert.ok(engine.includes('targetLabel.textContent = domain === "agronomy" ? "Unité végétale"'));
assert.ok(engine.includes('batchField.hidden = domain !== "laboratory"'));
assert.ok(engine.includes('if (!plantCultureId && !cultureId && !batchId)'));
assert.ok(engine.includes('query = query.in("plant_culture_id", plantIds)'));
assert.ok(engine.includes('query = query.or(scopeClauses.join(","))'));
assert.ok(engine.includes("else noWorkspaceTargets = true"));
assert.ok(engine.includes("noWorkspaceTargets || (batchId && !batchEventIds.length)"));
console.log("✓ Scenario choices: culture formats and measurement variables are domain-specific");
console.log("✓ Scenario AgriTech statistics: plant filters query plant_culture_id and hide laboratory batches");

const cultureRows = [{ id: "myc-1", code: "MYC-1" }, { id: "lab-1", code: "LAB-1" }];
const plantRows = [{ id: "plant-1", code: "DF1" }];
const batchRows = [{ id: "batch-1", batch_code: "BT-1" }];
assert.equal(recordScenario({ plant_culture_id: "plant-1" }, {}, "agronomy", [], plantRows, []), true);
assert.equal(recordScenario({ culture_id: "myc-1" }, {}, "agronomy", cultureRows, plantRows, batchRows), false);
assert.equal(recordScenario({ culture_id: "myc-1" }, {}, "mycology", [cultureRows[0]], plantRows, batchRows), true);
assert.equal(recordScenario({ plant_culture_id: "plant-1" }, {}, "mycology", [cultureRows[0]], plantRows, batchRows), false);
assert.equal(recordScenario({ event_id: "event-1" }, { "event-1": { batch_id: "batch-1" } }, "laboratory", [cultureRows[1]], plantRows, batchRows), true);
assert.equal(recordScenario({ event_id: "event-1" }, { "event-1": { batch_id: "batch-1" } }, "mycology", [cultureRows[0]], plantRows, batchRows), false);
console.log("✓ Scenario histories: plant, mycology and lab records stay within their own workspace");


// Registry pagination and workspace-switch guards must remain in place.
assert.match(engine, /async function loadOrganizationRowsInPages\(/);
assert.match(engine, /\.range\(offset, offset \+ pageSize - 1\)/);
assert.match(engine, /requestedOrganizationId !== organizationId/);
assert.match(engine, /const visibleCultureIds = new Set\(requestedCultures\.map\(culture => culture\.id\)\)/);
assert.match(engine, /requestedDomain !== document\.body\.dataset\.domain/);
console.log("✓ Culture, batch and plant registries paginate and discard stale workspace responses");


// Switching between the three workspaces must refresh tenant-scoped data,
// not merely replace the hero labels. A superseded switch must not render.
const setupStart = engine.indexOf("function setupDomainWorkspaces()");
assert.ok(setupStart >= 0, "workspace setup must exist");
const setupOpen = engine.indexOf("{", setupStart);
let setupDepth = 0;
let setupEnd = -1;
for (let i = setupOpen; i < engine.length; i++) {
  if (engine[i] === "{") setupDepth++;
  if (engine[i] === "}" && --setupDepth === 0) { setupEnd = i + 1; break; }
}
assert.ok(setupEnd > setupStart, "workspace setup must be complete");
const workspaceSetup = engine.slice(setupStart, setupEnd);
assert.match(workspaceSetup, /let workspaceSwitchRevision = 0;/,
  "workspace switches need a monotonic revision");
assert.match(workspaceSetup, /const switchRevision = \+\+workspaceSwitchRevision;/,
  "each switch must supersede pending switches");
assert.match(workspaceSetup, /if \(persist && organizationId\)/,
  "signed-in workspace changes must refresh data");
assert.match(workspaceSetup, /cultureOptions = \[\];[\s\S]*?latestBatches = \[\];[\s\S]*?await loadPlantCultures\(\);/,
  "agronomy must clear biological caches and load plant records");
assert.match(workspaceSetup, /await loadCultureOptions\(\);[\s\S]*?await loadLatestBatches\(\);/,
  "mycology and laboratory must reload their own cultures and batches");
assert.match(workspaceSetup, /await loadMeasurementReferences\(\);[\s\S]*?loadRecentMeasurements\(\)[\s\S]*?loadRecentObservations\(\)/,
  "measurement references and histories must follow the active workspace");
assert.ok((workspaceSetup.match(/switchRevision !== workspaceSwitchRevision/g) || []).length >= 5,
  "every asynchronous boundary must reject an obsolete workspace switch");
assert.match(workspaceSetup, /data-workspace-target="trackerCard"[\s\S]*?hidden = activeDomain === "agronomy"|querySelectorAll\('\.section-nav a\[href="#trackerCard"\]/,
  "the biological culture navigation must follow the active domain");
assert.match(workspaceSetup, /data-workspace-target="batchCard"[\s\S]*?hidden = activeDomain !== "laboratory"|querySelectorAll\('\.section-nav a\[href="#batchCard"\]/,
  "batch navigation must only be visible in Laboratory");
assert.match(workspaceSetup, /data-domain-nav='biological'[\s\S]*?hidden = activeDomain === "agronomy"/,
  "biological navigation must be hidden in Green Tech and restored elsewhere");
assert.match(workspaceSetup, /bio-operation-panel[\s\S]*?classList\.toggle\("hidden", activeDomain === "agronomy"\)/,
  "biological operation panels must be restored when leaving Green Tech");

console.log("✓ Scenario workspace switching: domain data refreshes and obsolete switches are discarded");


// Statistics translations must use one canonical French fallback, not a duplicated dictionary.
const statisticsTranslationsSource = extractFunction(engine, "getStatisticsTranslations");
const statisticsFrenchFallback = vm.runInNewContext(
  `${statisticsTranslationsSource}; getStatisticsTranslations("unknown")`
);
const statisticsPortuguese = vm.runInNewContext(
  `${statisticsTranslationsSource}; getStatisticsTranslations("pt")`
);
assert.equal(
  statisticsFrenchFallback.login,
  "Connectez-vous pour analyser les données de votre organisation."
);
assert.equal(statisticsPortuguese.login, "Inicie sessão para analisar os dados da sua organização.");
assert.equal(statisticsPortuguese.buttonAnalyze, "Analisar dados");
console.log("✓ Statistics translations use localized entries and a single French fallback");

// A culture removed from the active registry must produce controlled feedback,
// not an uncaught rejection from the batch-creation handler.
const createBatchSource = `async ${extractFunction(engine, "createBatch")}`;
const missingCultureMessages = [];
const missingCultureContext = {
  authStateRevision: 1,
  organizationId: "org-test",
  clearMessage() {},
  showMessage(message, type) { missingCultureMessages.push({ message, type }); },
  batchCodeInput: { value: "BATCH-TEST" },
  batchNameInput: { value: "Test batch" },
  batchTypeSelect: { value: "SPAWN" },
  batchCultureSelect: { value: "culture-no-longer-listed" },
  batchQuantityInput: { value: "" },
  batchUnitInput: { value: "" },
  cultureOptions: []
};
const missingCultureResult = vm.runInNewContext(
  `${createBatchSource}; createBatch()`,
  missingCultureContext
);
await assert.doesNotReject(missingCultureResult);
assert.equal(missingCultureMessages.length, 1);
assert.equal(missingCultureMessages[0].type, "error");
assert.match(missingCultureMessages[0].message, /culture sélectionnée.*plus disponible/i);
console.log("✓ Batch creation: missing source culture produces controlled feedback");

// Session and protocol lookups in creation handlers must surface controlled
// feedback instead of rejecting before their main try/catch blocks.
const createCultureSource = `async ${extractFunction(engine, "createCulture")}`;
const cultureSessionMessages = [];
const cultureSessionContext = {
  authStateRevision: 1,
  organizationId: "org-test",
  clearMessage() {},
  showMessage(message, type) { cultureSessionMessages.push({ message, type }); },
  strainSelect: { value: "strain-1" },
  cultureCodeInput: { value: "CULTURE-TEST", trim() { return this.value.trim(); } },
  cultureTypeSelect: { value: "agar" },
  protocolSelect: { value: "" },
  startedAtInput: { value: "" },
  termsAcceptedCheckbox: { checked: true, focus() {} },
  isCurrentWorkspaceRevision(revision, organizationId) {
    return revision === 1 && organizationId === "org-test";
  },
  getCurrentSession: async () => { throw new Error("Session provider unavailable"); }
};
await assert.doesNotReject(
  vm.runInNewContext(`${createCultureSource}; createCulture()`, cultureSessionContext)
);
assert.equal(cultureSessionMessages.length, 1);
assert.equal(cultureSessionMessages[0].type, "error");
assert.match(cultureSessionMessages[0].message, /Session provider unavailable/);
console.log("✓ Culture creation: session lookup failures produce controlled feedback");


// A tenant switch during the optional Notion sync must not render old-tenant data.
const cultureSyncCallIndex = createCultureSource.indexOf('"sync-culture-to-notion"');
const cultureSyncGuardIndex = createCultureSource.indexOf(
  'if (!isCurrentWorkspaceRevision(operationRevision, operationOrganizationId)) return;',
  cultureSyncCallIndex
);
const cultureSuccessRenderIndex = createCultureSource.indexOf(
  'showElement(\n      resultCard',
  cultureSyncCallIndex
);
assert.ok(cultureSyncCallIndex >= 0, "culture Notion sync call must remain present");
assert.ok(cultureSyncGuardIndex > cultureSyncCallIndex,
  "culture creation must re-check workspace revision after Notion sync");
assert.ok(cultureSuccessRenderIndex > cultureSyncGuardIndex,
  "stale culture result must be discarded before success UI is rendered");
console.log("✓ Culture creation: stale Notion sync results cannot render in another workspace");


// A session resolved after an authentication/workspace change must not start writes.
const staleSessionMessages = [];
let staleSessionRevision = 1;
let staleSessionSessionCalls = 0;
let staleSessionConsentLookups = 0;
const staleSessionContext = {
  authStateRevision: staleSessionRevision,
  organizationId: "org-test",
  clearMessage() {},
  showMessage(message, type) { staleSessionMessages.push({ message, type }); },
  strainSelect: { value: "strain-1" },
  cultureCodeInput: { value: "CULTURE-STALE", trim() { return this.value.trim(); } },
  cultureTypeSelect: { value: "agar" },
  protocolSelect: { value: "" },
  startedAtInput: { value: "" },
  termsAcceptedCheckbox: { checked: true, focus() {} },
  createButton: { disabled: false, textContent: "Créer la culture" },
  isCurrentWorkspaceRevision(revision, organizationId) {
    return revision === staleSessionRevision && organizationId === "org-test";
  },
  getCurrentSession: async () => {
    staleSessionSessionCalls++;
    staleSessionRevision = 2;
    staleSessionContext.authStateRevision = 2;
    return { user: { id: "user-test" } };
  },
  supabaseClient: {
    from() {
      staleSessionConsentLookups++;
      throw new Error("A stale session must not write consent");
    }
  },
  console
};
await assert.doesNotReject(
  vm.runInNewContext(`${createCultureSource}; createCulture()`, staleSessionContext)
);
assert.equal(staleSessionSessionCalls, 1, "the session race must be exercised");
assert.equal(staleSessionConsentLookups, 0,
  "a stale session must be rejected before consent lookup or write");
assert.equal(staleSessionContext.createButton.disabled, false,
  "a stale operation must not leave the create button disabled");
console.log("✓ Culture creation: a session resolved after workspace change cannot start writes");

const batchProtocolSource = `async ${extractFunction(engine, "createBatch")}`;
const batchProtocolMessages = [];
const batchProtocolButton = { disabled: false, textContent: "Créer le batch" };
const batchProtocolContext = {
  authStateRevision: 1,
  organizationId: "org-test",
  clearMessage() {},
  showMessage(message, type) { batchProtocolMessages.push({ message, type }); },
  batchCodeInput: { value: "BATCH-TEST" },
  batchNameInput: { value: "Test batch" },
  batchTypeSelect: { value: "SPAWN" },
  batchCultureSelect: { value: "culture-1" },
  batchQuantityInput: { value: "" },
  batchUnitInput: { value: "" },
  cultureOptions: [{ id: "culture-1", material_id: "material-1" }],
  getCultureProtocolVersionId: async () => { throw new Error("Protocol lookup unavailable"); },
  isCurrentWorkspaceRevision: () => true,
  createBatchButton: batchProtocolButton,
  console
};
await assert.doesNotReject(
  vm.runInNewContext(`${batchProtocolSource}; createBatch()`, batchProtocolContext)
);
assert.equal(batchProtocolMessages.length, 1);
assert.equal(batchProtocolMessages[0].type, "error");
assert.match(batchProtocolMessages[0].message, /Protocol lookup unavailable/);
assert.equal(batchProtocolButton.disabled, false);
assert.equal(batchProtocolButton.textContent, "Créer le batch");
console.log("✓ Batch creation: protocol lookup failures produce controlled feedback");
