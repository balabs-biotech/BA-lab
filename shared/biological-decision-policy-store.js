/* BA Labs Biological Decision Policy Store v0.1.0
 * Tenant- and rule-version-scoped read adapter for reviewed decision policies.
 * Policy evaluation remains a separate pure engine; this adapter never writes.
 */
(function (root) {
  "use strict";
  const VERSION = "0.1.0";
  const EMPTY = (status, reason) => Object.freeze({
    status, reason, policies: Object.freeze([])
  });

  async function loadReviewedPolicies(input) {
    const assessment = input && input.assessment;
    if (!input || !input.client || typeof input.client.from !== "function" ||
        !assessment || typeof assessment !== "object" ||
        typeof assessment.id !== "string" || !assessment.id.trim() ||
        typeof assessment.organization_id !== "string" || !assessment.organization_id.trim() ||
        typeof assessment.domain !== "string" || !assessment.domain.trim() ||
        typeof assessment.rule_version_id !== "string" || !assessment.rule_version_id.trim()) {
      return EMPTY("insufficient_context", "decision_policy_query_incomplete");
    }
    if (assessment.status !== "out_of_range") {
      return EMPTY("not_applicable", "assessment_status_does_not_trigger_decision_policy");
    }

    let query;
    try {
      query = input.client.from("biological_decision_policies")
        .select("id,organization_id,policy_id,version,revision_seq,status,domain,rule_version_id,trigger_assessment_statuses,decision_code,title,explanation,severity,recommended_action,sources,created_by,reviewed_by,reviewed_at")
        .eq("organization_id", assessment.organization_id)
        .eq("domain", assessment.domain)
        .eq("rule_version_id", assessment.rule_version_id)
        .in("status", ["reviewed", "retired"])
        .order("revision_seq", { ascending: false })
        .order("id", { ascending: false })
        .limit(200);
    } catch (_) {
      return EMPTY("unavailable", "decision_policy_query_failed");
    }
    let response;
    try {
      response = await query;
    } catch (_) {
      return EMPTY("unavailable", "decision_policy_query_failed");
    }
    const { data, error } = response || {};
    if (error) return EMPTY("unavailable", "decision_policy_query_failed");

    const latestByPolicyId = new Map();
    for (const row of Array.isArray(data) ? data : []) {
      if (!row || typeof row.policy_id !== "string" || !row.policy_id.trim() ||
          row.organization_id !== assessment.organization_id ||
          row.domain !== assessment.domain || row.rule_version_id !== assessment.rule_version_id ||
          latestByPolicyId.has(row.policy_id)) continue;
      latestByPolicyId.set(row.policy_id, row);
    }

    const policies = [];
    for (const row of latestByPolicyId.values()) {
      if (row.status !== "reviewed" ||
          !Array.isArray(row.trigger_assessment_statuses) ||
          !row.trigger_assessment_statuses.includes(assessment.status) ||
          !Array.isArray(row.sources) || row.sources.length === 0 ||
          typeof row.decision_code !== "string" || !row.decision_code.trim() ||
          typeof row.title !== "string" || !row.title.trim() ||
          typeof row.explanation !== "string" || !row.explanation.trim() ||
          typeof row.reviewed_by !== "string" || !row.reviewed_by.trim() ||
          typeof row.reviewed_at !== "string" || !Number.isFinite(Date.parse(row.reviewed_at))) continue;
      policies.push(Object.freeze({
        policy_id: row.policy_id, version: row.version, status: row.status,
        organization_id: row.organization_id, domain: row.domain,
        rule_version_id: row.rule_version_id,
        trigger_assessment_statuses: Object.freeze([...row.trigger_assessment_statuses]),
        decision_code: row.decision_code, title: row.title, explanation: row.explanation,
        severity: row.severity || null, recommended_action: row.recommended_action || null,
        sources: Object.freeze(row.sources.map(source => Object.freeze({ ...source }))),
        review: Object.freeze({ reviewer_id: row.reviewed_by, reviewed_at: row.reviewed_at })
      }));
    }
    return Object.freeze({
      status: "loaded", reason: "tenant_and_rule_version_scoped_reviewed_policies_loaded",
      policies: Object.freeze(policies)
    });
  }

  async function loadPolicyHistory(input) {
    if (!input || !input.client || typeof input.client.from !== "function" ||
        typeof input.organizationId !== "string" || !input.organizationId.trim() ||
        typeof input.domain !== "string" || !input.domain.trim()) {
      return Object.freeze({ status: "insufficient_context", reason: "policy_history_query_incomplete", records: Object.freeze([]) });
    }
    let response;
    try {
      response = await input.client.from("biological_decision_policies")
        .select("id,revision_seq,organization_id,policy_id,version,status,domain,rule_version_id,trigger_assessment_statuses,decision_code,title,explanation,severity,recommended_action,sources,created_by,created_at,reviewed_by,reviewed_at")
        .eq("organization_id", input.organizationId)
        .eq("domain", input.domain)
        .order("revision_seq", { ascending: false })
        .order("id", { ascending: false })
        .limit(200);
    } catch (_) {
      return Object.freeze({ status: "unavailable", reason: "policy_history_query_failed", records: Object.freeze([]) });
    }
    const { data, error } = response || {};
    if (error) return Object.freeze({ status: "unavailable", reason: "policy_history_query_failed", records: Object.freeze([]) });
    const records = (Array.isArray(data) ? data : []).filter(row =>
      row && row.organization_id === input.organizationId && row.domain === input.domain &&
      typeof row.policy_id === "string" && row.policy_id.trim() &&
      typeof row.version === "string" && row.version.trim() &&
      ["draft","reviewed","retired"].includes(row.status) &&
      typeof row.rule_version_id === "string" && row.rule_version_id.trim() &&
      Array.isArray(row.trigger_assessment_statuses) &&
      row.trigger_assessment_statuses.length === 1 &&
      row.trigger_assessment_statuses[0] === "out_of_range" &&
      Array.isArray(row.sources) && row.sources.length > 0 &&
      typeof row.decision_code === "string" && row.decision_code.trim() &&
      typeof row.title === "string" && row.title.trim() &&
      typeof row.explanation === "string" && row.explanation.trim() &&
      (row.status !== "reviewed" ||
        (typeof row.reviewed_by === "string" && row.reviewed_by.trim() &&
         typeof row.reviewed_at === "string" && Number.isFinite(Date.parse(row.reviewed_at))))
    );
    return Object.freeze({ status: "loaded", reason: "tenant_scoped_decision_policy_history_loaded", records: Object.freeze(records) });
  }

  root.BALabsBiologicalDecisionPolicyStore = Object.freeze({ version: VERSION, loadReviewedPolicies, loadPolicyHistory });
})(typeof globalThis !== "undefined" ? globalThis : window);
