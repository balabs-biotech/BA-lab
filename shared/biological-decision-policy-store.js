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
    const { data, error } = await query;
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

  root.BALabsBiologicalDecisionPolicyStore = Object.freeze({ version: VERSION, loadReviewedPolicies });
})(typeof globalThis !== "undefined" ? globalThis : window);
