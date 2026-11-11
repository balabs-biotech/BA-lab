/* BA Labs Biological Rule Store v0.1.0
 * Reads reviewed rule versions for one active tenant.
 * Newest reviewed/retired version wins per rule_id; a retirement suppresses older versions.
 * This module is read-only and never falls back across organizations.
 */
(function (root) {
  "use strict";

  const VERSION = "0.1.0";

  async function loadExecutableRules(input) {
    if (!input || !input.client || typeof input.client.from !== "function" ||
        typeof input.organizationId !== "string" || !input.organizationId.trim() ||
        typeof input.domain !== "string" || !input.domain.trim() ||
        typeof input.variableCode !== "string" || !input.variableCode.trim() ||
        typeof input.unitCode !== "string" || !input.unitCode.trim()) {
      return Object.freeze({
        status: "insufficient_context",
        reason: "rule_store_query_incomplete",
        rules: Object.freeze([]),
        rejected_rule_ids: Object.freeze([]),
      });
    }

    const registry = root.BALabsBiologicalRuleRegistry;
    if (!registry || typeof registry.isExecutable !== "function" ||
        typeof registry.validate !== "function") {
      return Object.freeze({
        status: "unavailable",
        reason: "rule_registry_unavailable",
        rules: Object.freeze([]),
        rejected_rule_ids: Object.freeze([]),
      });
    }

    let query = input.client.from("biological_rules")
      .select("id,revision_seq,organization_id,rule_id,version,status,domain,variable_code,unit_code,rule,created_at,reviewed_by,reviewed_at")
      .eq("organization_id", input.organizationId)
      .eq("domain", input.domain)
      .eq("variable_code", input.variableCode)
      .eq("unit_code", input.unitCode)
      .in("status", ["reviewed", "retired"])
      .order("revision_seq", { ascending: false })
      .order("id", { ascending: false });

    const { data, error } = await query;
    if (error) {
      return Object.freeze({
        status: "unavailable",
        reason: "rule_store_query_failed",
        rules: Object.freeze([]),
        rejected_rule_ids: Object.freeze([]),
      });
    }

    const latestByRuleId = new Map();
    for (const row of Array.isArray(data) ? data : []) {
      if (!row || typeof row.rule_id !== "string" || !row.rule_id.trim() ||
          row.organization_id !== input.organizationId ||
          latestByRuleId.has(row.rule_id)) continue;
      latestByRuleId.set(row.rule_id, row);
    }

    const rules = [];
    const rejected = [];
    for (const [ruleId, row] of latestByRuleId) {
      if (row.status !== "reviewed") continue;
      const rule = row.rule;
      const consistent = rule && typeof rule === "object" && !Array.isArray(rule) &&
        row.rule_id === rule.rule_id &&
        row.version === rule.version &&
        row.status === rule.status &&
        row.domain === rule.domain &&
        row.variable_code === rule.variable_code &&
        row.unit_code === rule.unit_code &&
        typeof row.reviewed_by === "string" &&
        typeof row.reviewed_at === "string" &&
        rule.review && rule.review.reviewer_id === row.reviewed_by &&
        Number.isFinite(Date.parse(rule.review.reviewed_at)) &&
        Number.isFinite(Date.parse(row.reviewed_at)) &&
        Date.parse(rule.review.reviewed_at) === Date.parse(row.reviewed_at);
      if (!consistent || !registry.isExecutable(rule)) {
        rejected.push(ruleId);
        continue;
      }
      rules.push(rule);
    }

    return Object.freeze({
      status: "loaded",
      reason: "tenant_scoped_reviewed_rule_versions_loaded",
      rules: Object.freeze(rules),
      rejected_rule_ids: Object.freeze(rejected),
    });
  }

  root.BALabsBiologicalRuleStore = Object.freeze({ version: VERSION, loadExecutableRules });
})(typeof globalThis !== "undefined" ? globalThis : window);
