import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const tracker = await readFile(new URL("../batch-tracker/tracker.js", import.meta.url), "utf8");
const start = tracker.indexOf("async function initializeAuthenticatedTracker(");
const end = tracker.indexOf("\n\n/* ============================================================\n   DATE PAR DEFAUT", start);
assert.ok(start >= 0 && end > start, "authenticated initializer must be present");
const initializer = tracker.slice(start, end);

assert.match(
  initializer,
  /const setInitializationStage = \(stage\) => \{\s*if \(initRevision !== authStateRevision\) return;\s*initializationStage = stage;/,
  "stale initialization must not overwrite the current auth status",
);

const awaitedSteps = [
  "claimBALabs(session)",
  "loadStrainOptions()",
  "loadReferenceData()",
  "loadCultureOptions()",
  "loadQuantityUnitOptions()",
  "loadBatchPlaceOptions()",
  "loadPlantCultures()",
  "syncPendingCultures()",
  "loadLatestBatches()",
];
for (const step of awaitedSteps) {
  const escaped = step.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`await ${escaped};\s*if \(initRevision !== authStateRevision\) return;`);
  assert.match(initializer, pattern, `stale initialization must stop after ${step}`);
}

assert.match(
  initializer,
  /if \(initRevision !== authStateRevision\) return;[\s\S]*?finally/,
  "the existing final stale-session reconciliation must remain",
);

const finallyStart = initializer.lastIndexOf("finally {");
assert.ok(finallyStart >= 0, "initializer must release its in-progress guard in finally");
const finallyBlock = initializer.slice(finallyStart);
const guardReset = finallyBlock.indexOf("initializationInProgress =");
const retrySchedule = finallyBlock.indexOf("setTimeout(() =>");
const retryCall = finallyBlock.indexOf("refreshAuthUI()");
assert.ok(guardReset >= 0 && retrySchedule > guardReset && retryCall > retrySchedule,
  "stale initialization must release the guard before retrying the latest session");
assert.match(finallyBlock, /if \(initRevision !== authStateRevision\) \{[\s\S]*?refreshAuthUI\(\)/,
  "a superseded initialization must schedule reconciliation against the latest auth state");



const measurementHistoryCatch = initializer.slice(
  initializer.indexOf("catch (historyError)"),
  initializer.indexOf("catch (observationHistoryError)")
);
assert.match(
  measurementHistoryCatch,
  /catch \(historyError\) \{\s*if \(initRevision !== authStateRevision\) return;/,
  "a stale measurement-history failure must not mutate warnings or UI",
);

const observationHistoryCatch = initializer.slice(
  initializer.indexOf("catch (observationHistoryError)"),
  initializer.indexOf("} catch (measurementError)")
);
assert.match(
  observationHistoryCatch,
  /catch \(observationHistoryError\) \{\s*if \(initRevision !== authStateRevision\) return;/,
  "a stale observation-history failure must not mutate warnings or UI",
);

const measurementCatalogCatch = initializer.slice(
  initializer.indexOf("} catch (measurementError)"),
  initializer.indexOf("setDefaultDate();")
);
assert.match(
  measurementCatalogCatch,
  /catch \(measurementError\) \{\s*if \(initRevision !== authStateRevision\) return;/,
  "a stale measurement-catalog failure must not re-enable stale workspace controls",
);


for (const loaderName of [
  "loadStrainOptions",
  "loadReferenceData",
  "loadCultureOptions",
  "loadLatestBatches",
  "loadQuantityUnitOptions",
  "loadBatchPlaceOptions",
  "loadPlantCultures",
  "loadMeasurementReferences",
  "loadRecentMeasurements",
  "loadRecentObservations",
]) {
  const loaderStart = tracker.indexOf(`async function ${loaderName}()`);
  assert.ok(loaderStart >= 0, `${loaderName} must exist`);
  const nextFunction = tracker.indexOf("\nfunction ", loaderStart + 1);
  const nextAsyncFunction = tracker.indexOf("\nasync function ", loaderStart + 1);
  const candidates = [nextFunction, nextAsyncFunction].filter(index => index >= 0);
  const loaderEnd = candidates.length ? Math.min(...candidates) : tracker.length;
  const loader = tracker.slice(loaderStart, loaderEnd);
  assert.match(
    loader,
    /const loadRevision = authStateRevision;[\s\S]*?if \(loadRevision !== authStateRevision\) return;/,
    `${loaderName} must discard query results when its auth session is superseded`,
  );
}

console.log("Stale auth initialization contract passed.");
