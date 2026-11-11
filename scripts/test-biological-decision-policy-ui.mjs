import assert from "node:assert/strict";
import fs from "node:fs";

const ui=fs.readFileSync("shared/biological-decision-policy-management-ui.js","utf8");
const store=fs.readFileSync("shared/biological-decision-policy-store.js","utf8");
const authoring=fs.readFileSync("shared/biological-decision-policy-authoring.js","utf8");
const tracker=fs.readFileSync("batch-tracker/tracker.js","utf8");
const migration=fs.readFileSync("supabase/migrations/20261111200000_add_biological_decision_policy_store.sql","utf8");
const mycology=fs.readFileSync("batch-tracker/mycology/index.html","utf8");
const laboratory=fs.readFileSync("batch-tracker/laboratory/index.html","utf8");
const greenTech=fs.readFileSync("batch-tracker/green-tech/index.html","utf8");

assert.match(ui,/\["mycology","laboratory"\]/);
assert.match(ui,/loadAuthoringCapabilities/);
assert.match(ui,/canAdmin/);
assert.match(ui,/loadPolicyHistory/);
assert.match(ui,/latestCommitted/);
assert.match(ui,/latestDraft/);
assert.match(ui,/loadRuleHistory/);
assert.match(ui,/status === "reviewed"/);
assert.match(ui,/BA_LABS_CREATE_DECISION_POLICY_DRAFT/);
assert.match(ui,/BA_LABS_REVIEW_DECISION_POLICY_DRAFT/);
assert.match(ui,/BA_LABS_RETIRE_DECISION_POLICY/);
assert.match(ui,/Aucune conduite ni gravité n’est préremplie/);
assert.match(store,/\.eq\("organization_id", assessment\.organization_id\)/);
assert.match(store,/\.eq\("rule_version_id", assessment\.rule_version_id\)/);
assert.match(authoring,/authenticated_reviewer_required/);
assert.match(authoring,/retirement_requires_new_version_identifier/);
assert.match(tracker,/isCurrentWorkspaceRevision\(requestRevision, requestOrganizationId\)/);
assert.match(migration,/private\.is_org_admin\(organization_id\)/);
assert.match(migration,/biological_decision_policy_version_immutable/);
assert.match(migration,/biological_decision_policy_stale_draft_cannot_be_reviewed/);
assert.match(mycology,/biological-decision-policy-store\.js/);
assert.match(mycology,/biological-decision-policy-authoring\.js/);
assert.match(mycology,/biological-decision-policy-management-ui\.js/);
assert.match(laboratory,/biological-decision-policy-management-ui\.js/);
assert.doesNotMatch(greenTech,/biological-decision-policy-management-ui\.js/);

console.log("✓ Decision policy UI: domain isolation, admin gate, exact rule binding and explicit lifecycle actions");
