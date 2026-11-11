import assert from "node:assert/strict";
import fs from "node:fs";

const ui = fs.readFileSync("shared/biological-rule-management-ui.js", "utf8");
const store = fs.readFileSync("shared/biological-rule-store.js", "utf8");
const tracker = fs.readFileSync("batch-tracker/tracker.js", "utf8");
const workspace = fs.readFileSync("batch-tracker/workspace.html", "utf8");
const mycology = fs.readFileSync("batch-tracker/mycology/index.html", "utf8");
const laboratory = fs.readFileSync("batch-tracker/laboratory/index.html", "utf8");
const greenTech = fs.readFileSync("batch-tracker/green-tech/index.html", "utf8");

assert.match(ui, /\["mycology",\s*"laboratory"\]/);
assert.match(ui, /appendChild\(section\)/);
assert.match(ui, /BA_LABS_CREATE_BIOLOGICAL_RULE_DRAFT/);
assert.match(ui, /BA_LABS_REVIEW_BIOLOGICAL_RULE_DRAFT/);
assert.match(ui, /BA_LABS_RETIRE_BIOLOGICAL_RULE/);
assert.match(ui, /BALabsBiologicalRuleRegistry/);
assert.match(ui, /data-version-input/);
assert.match(ui, /window\.confirm/);
assert.match(store, /loadRuleHistory/);
assert.match(store, /loadAuthoringCapabilities/);
assert.match(ui, /Consultation seule/);
assert.match(ui, /Conflit de cycle de vie/);
assert.match(ui, /Comparer avec v/);
assert.match(ui, /!capabilities\.isAdmin/);
assert.match(store, /\.eq\("organization_id", input\.organizationId\)/);
assert.match(store, /\.eq\("domain", input\.domain\)/);
assert.match(tracker, /BA_LABS_CREATE_BIOLOGICAL_RULE_DRAFT/);
assert.match(workspace, /id="measurementCard"/);
assert.match(mycology, /biological-rule-management-ui\.js/);
assert.match(laboratory, /biological-rule-management-ui\.js/);
assert.doesNotMatch(greenTech, /biological-rule-management-ui\.js/);

console.log("✓ Biological Rule Management UI: domain isolation, authenticated lifecycle actions and tenant-scoped history");
