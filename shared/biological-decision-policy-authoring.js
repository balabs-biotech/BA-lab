/* BA Labs Biological Decision Policy Authoring v0.1.0
 * Explicit admin-only draft/review/retirement operations.
 * RLS and PostgreSQL lifecycle trigger remain authoritative.
 */
(function (root) {
  "use strict";
  const VERSION = "0.1.0";
  const TABLE = "biological_decision_policies";
  const fail = (status, reason) => Object.freeze({ status, reason, record: null });

  function validInput(input) {
    return input && input.client && typeof input.client.from === "function" &&
      typeof input.organizationId === "string" && input.organizationId.trim();
  }

  async function createDraft(input) {
    if (!validInput(input) || !input.policy || typeof input.policy !== "object")
      return fail("insufficient_context", "policy_draft_input_incomplete");
    const p = input.policy;
    if (p.status !== "draft" || !p.policy_id?.trim?.() || !p.version?.trim?.() ||
        !["mycology","laboratory"].includes(p.domain) || !p.rule_version_id?.trim() ||
        !p.decision_code?.trim?.() || !p.title?.trim?.() || !p.explanation?.trim() ||
        !Array.isArray(p.sources) || p.sources.length === 0 || p.sources.some(source => !source || typeof source.type !== "string" || !source.type.trim() || typeof source.citation !== "string" || !source.citation.trim()) ||
        !p.sources.every(s => s && typeof s.type === "string" && s.type.trim() &&
          typeof s.citation === "string" && s.citation.trim()) ||
        !Array.isArray(p.trigger_assessment_statuses) ||
        p.trigger_assessment_statuses.length !== 1 ||
        p.trigger_assessment_statuses[0] !== "out_of_range")
      return fail("invalid_policy", "draft_policy_failed_contract_validation");
    const row = {
      organization_id: input.organizationId,
      policy_id: p.policy_id,
      version: p.version,
      status: "draft",
      domain: p.domain,
      rule_version_id: p.rule_version_id,
      trigger_assessment_statuses: p.trigger_assessment_statuses,
      decision_code: p.decision_code,
      title: p.title,
      explanation: p.explanation,
      severity: p.severity || null,
      recommended_action: p.recommended_action || null,
      sources: p.sources
    };
    let result;
    try {
      result = await input.client.from(TABLE).insert(row)
        .select("id,revision_seq,organization_id,policy_id,version,status,domain,rule_version_id,trigger_assessment_statuses,decision_code,title,explanation,severity,recommended_action,sources,created_at")
        .single();
    } catch (_) {
      return fail("store_error", "policy_draft_insert_failed");
    }
    if (result.error || !result.data) return fail("store_error", "policy_draft_insert_failed_or_not_authorized");
    if (result.data.organization_id !== input.organizationId || result.data.status !== "draft")
      return fail("invalid_store_response", "policy_draft_response_mismatch");
    return Object.freeze({ status: "created", reason: "decision_policy_draft_created", record: result.data });
  }

  async function reviewDraft(input) {
    if (!validInput(input) || !input.client.auth ||
        typeof input.client.auth.getUser !== "function" ||
        typeof input.policyId !== "string" || !input.policyId.trim() ||
        typeof input.version !== "string" || !input.version.trim())
      return fail("insufficient_context", "policy_review_input_incomplete");
    let auth;
    try { auth = await input.client.auth.getUser(); } catch (_) {
      return fail("unauthenticated", "authenticated_reviewer_required");
    }
    const reviewerId = auth && auth.data && auth.data.user && auth.data.user.id;
    if (!auth || auth.error || typeof reviewerId !== "string" || !reviewerId.trim())
      return fail("unauthenticated", "authenticated_reviewer_required");

    let found;
    try {
      found = await input.client.from(TABLE)
        .select("id,organization_id,policy_id,version,status")
        .eq("organization_id", input.organizationId)
        .eq("policy_id", input.policyId)
        .eq("version", input.version)
        .eq("status", "draft")
        .maybeSingle();
    } catch (_) { return fail("store_error", "policy_draft_lookup_failed"); }
    if (found.error) return fail("store_error", "policy_draft_lookup_failed");
    if (!found.data) return fail("not_found", "policy_draft_not_found_or_already_reviewed");
    if (found.data.organization_id !== input.organizationId ||
        found.data.policy_id !== input.policyId || found.data.version !== input.version ||
        found.data.status !== "draft")
      return fail("invalid_store_response", "policy_draft_lookup_mismatch");

    let updated;
    try {
      updated = await input.client.from(TABLE)
        .update({ status: "reviewed" })
        .eq("organization_id", input.organizationId)
        .eq("id", found.data.id)
        .eq("status", "draft")
        .select("id,revision_seq,organization_id,policy_id,version,status,domain,rule_version_id,trigger_assessment_statuses,decision_code,title,explanation,severity,recommended_action,sources,reviewed_by,reviewed_at")
        .maybeSingle();
    } catch (_) { return fail("store_error", "policy_review_update_failed"); }
    if (updated.error) return fail("store_error", "policy_review_update_failed");
    if (!updated.data) return fail("conflict", "policy_draft_changed_before_review_commit");
    if (updated.data.organization_id !== input.organizationId ||
        updated.data.status !== "reviewed" || updated.data.reviewed_by !== reviewerId ||
        !updated.data.reviewed_at || !Number.isFinite(Date.parse(updated.data.reviewed_at)))
      return fail("invalid_store_response", "policy_review_identity_binding_failed");
    return Object.freeze({ status: "published", reason: "decision_policy_reviewed_and_published", record: updated.data });
  }

  async function retirePolicy(input) {
    if (!validInput(input) || !input.policy || typeof input.newVersion !== "string" ||
        !input.newVersion.trim() || input.policy.status !== "reviewed" ||
        input.policy.organization_id !== input.organizationId ||
        !input.policy.policy_id || !input.policy.rule_version_id)
      return fail("insufficient_context", "policy_retirement_requires_current_reviewed_policy");
    if (input.newVersion === input.policy.version)
      return fail("invalid_policy", "retirement_requires_new_version_identifier");
    const p = input.policy;
    const row = {
      organization_id: input.organizationId, policy_id: p.policy_id,
      version: input.newVersion, status: "retired", domain: p.domain,
      rule_version_id: p.rule_version_id,
      trigger_assessment_statuses: p.trigger_assessment_statuses,
      decision_code: p.decision_code, title: p.title, explanation: p.explanation,
      severity: p.severity || null, recommended_action: p.recommended_action || null,
      sources: p.sources
    };
    let result;
    try {
      result = await input.client.from(TABLE).insert(row)
        .select("id,revision_seq,organization_id,policy_id,version,status,domain,rule_version_id,decision_code,title,created_at")
        .single();
    } catch (_) { return fail("store_error", "policy_retirement_insert_failed"); }
    if (result.error || !result.data) return fail("store_error", "policy_retirement_insert_failed_or_not_authorized");
    if (result.data.organization_id !== input.organizationId || result.data.status !== "retired")
      return fail("invalid_store_response", "policy_retirement_response_mismatch");
    return Object.freeze({ status: "retired", reason: "decision_policy_retirement_version_created", record: result.data });
  }

  root.BALabsBiologicalDecisionPolicyAuthoring = Object.freeze({
    version: VERSION, createDraft, reviewDraft, retirePolicy
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
