import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const context = { Object, Array, String, Set, Number, Date, globalThis: {} };
vm.runInNewContext(fs.readFileSync("shared/biological-decision-engine.js", "utf8"), context);
const engine = context.globalThis.BALabsBiologicalDecisionEngine;
const assessment = { id: "assessment-1", organization_id: "org-1", domain: "mycology", rule_version_id: "rule-version-1", status: "out_of_range", calculation_origin: "client_engine", server_verification: "not_recomputed" };
const policy = {
  policy_id: "mycology.temperature.review", version: "1.0.0", status: "reviewed", organization_id: "org-1", domain: "mycology", rule_version_id: "rule-version-1",
  trigger_assessment_statuses: ["out_of_range"], decision_code: "inspect_culture_conditions",
  title: "Inspection requise",
  explanation: "Une mesure est hors de la plage définie par une règle biologique examinée.",
  severity: "review",
  recommended_action: "Consulter le protocole validé et vérifier les mesures indépendantes.",
  sources: [{ type: "validated_internal_protocol", citation: "Protocol fixture" }],
  review: { reviewer_id: "reviewer-1", reviewed_at: "2026-11-11T10:00:00.000Z" }
};
assert.equal(engine.version, "0.1.0");
assert.equal(engine.evaluate({ domain: "mycology", assessment }).status, "decision_not_configured");
assert.equal(engine.evaluate({ domain: "mycology", assessment, policies: [policy] }).status, "decision_candidate");
assert.equal(engine.evaluate({ domain: "mycology", assessment, policies: [policy] }).automatic_action_taken, false);
assert.equal(engine.evaluate({ domain: "mycology", assessment, policies: [policy, policy] }).status, "ambiguous_decision_policy");
assert.equal(engine.evaluate({ domain: "mycology", assessment: { ...assessment, status: "normal" }, policies: [policy] }).status, "no_decision_candidate");
assert.equal(engine.evaluate({ domain: "mycology", assessment: { ...assessment, server_verification: "verified" }, policies: [policy] }).status, "insufficient_evidence");
assert.equal(engine.evaluate({ domain: "mycology", assessment: { ...assessment, calculation_origin: "external" }, policies: [policy] }).status, "insufficient_evidence");
assert.equal(engine.evaluate({ domain: "mycology", assessment: { ...assessment, id: "" }, policies: [policy] }).status, "insufficient_evidence");
assert.equal(engine.evaluate({ domain: "mycology", assessment: { ...assessment, organization_id: "org-2" }, policies: [policy] }).status, "decision_not_configured");
assert.equal(engine.evaluate({ domain: "mycology", assessment: { ...assessment, rule_version_id: "rule-version-2" }, policies: [policy] }).status, "decision_not_configured");
console.log("✓ Biological Decision Engine: reviewed-policy gating, ambiguity, provenance and no automatic actions");
