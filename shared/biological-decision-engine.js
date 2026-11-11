/* BA Labs Biological Decision Engine v0.1.0
 * Converts persisted assessment evidence into explainable decision candidates.
 * It never invents thresholds, severity, recommendations or automatic actions.
 */
(function (root) {
  "use strict";
  const VERSION = "0.1.0";
  const ALLOWED_ASSESSMENT_STATUSES = Object.freeze([
    "normal", "out_of_range", "insufficient_context", "not_assessed",
    "no_matching_rule", "ambiguous_rule"
  ]);
  function output(status, reason, fields = {}) {
    return Object.freeze({
      status, reason, engine: "BA-LABS/Biological-Decision-Engine",
      engine_version: VERSION, automatic_action_taken: false, ...fields
    });
  }
  function evaluate(input) {
    if (!input || typeof input !== "object" || !input.assessment || typeof input.assessment !== "object")
      return output("insufficient_evidence", "assessment_missing");
    const assessment = input.assessment;
    if (!ALLOWED_ASSESSMENT_STATUSES.includes(assessment.status))
      return output("insufficient_evidence", "assessment_status_unknown");
    if (typeof assessment.id !== "string" || !assessment.id.trim())
      return output("insufficient_evidence", "persisted_assessment_id_missing");
    if (typeof assessment.organization_id !== "string" || !assessment.organization_id.trim() ||
        typeof assessment.domain !== "string" || !assessment.domain.trim() ||
        typeof assessment.rule_version_id !== "string" || !assessment.rule_version_id.trim())
      return output("insufficient_evidence", "assessment_tenant_domain_or_rule_version_missing");
    if (assessment.server_verification !== "not_recomputed" || assessment.calculation_origin !== "client_engine")
      return output("insufficient_evidence", "assessment_provenance_unrecognized");
    if (assessment.status !== "out_of_range")
      return output("no_decision_candidate", "assessment_status_does_not_trigger_decision", {
        assessment_id: assessment.id, assessment_status: assessment.status
      });
    if (!Array.isArray(input.policies))
      return output("decision_not_configured", "decision_policy_list_missing", { assessment_id: assessment.id });
    const policies = input.policies.filter((policy) =>
      policy && policy.status === "reviewed" &&
      policy.organization_id === assessment.organization_id &&
      policy.domain === assessment.domain && policy.domain === input.domain &&
      policy.rule_version_id === assessment.rule_version_id &&
      Array.isArray(policy.trigger_assessment_statuses) &&
      policy.trigger_assessment_statuses.includes(assessment.status) &&
      Array.isArray(policy.sources) && policy.sources.length > 0 &&
      policy.sources.every(source => source && typeof source.type === "string" && source.type.trim() &&
        typeof source.citation === "string" && source.citation.trim()) &&
      policy.review && typeof policy.review.reviewer_id === "string" && policy.review.reviewer_id.trim() &&
      typeof policy.review.reviewed_at === "string" &&
      typeof policy.decision_code === "string" && policy.decision_code.trim() &&
      typeof policy.title === "string" && policy.title.trim() &&
      typeof policy.explanation === "string" && policy.explanation.trim()
    );
    if (policies.length === 0)
      return output("decision_not_configured", "no_reviewed_policy_matches_assessment", {
        assessment_id: assessment.id, assessment_status: assessment.status
      });
    if (policies.length > 1)
      return output("ambiguous_decision_policy", "multiple_reviewed_policies_match", {
        assessment_id: assessment.id,
        candidate_policy_ids: Object.freeze(policies.map((policy) => policy.policy_id || null))
      });
    const policy = policies[0];
    return output("decision_candidate", "one_reviewed_policy_matches", {
      assessment_id: assessment.id, assessment_status: assessment.status,
      policy_id: policy.policy_id || null, policy_version: policy.version || null,
      decision_code: policy.decision_code, title: policy.title, explanation: policy.explanation,
      severity: policy.severity || null, recommended_action: policy.recommended_action || null,
      sources: Object.freeze(policy.sources.map((source) => Object.freeze({ ...source }))),
      review: Object.freeze({ ...policy.review })
    });
  }
  root.BALabsBiologicalDecisionEngine = Object.freeze({ version: VERSION, evaluate });
})(typeof globalThis !== "undefined" ? globalThis : window);
