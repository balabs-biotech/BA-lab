/* BA Labs Biological Rule Authoring v0.1.0
 * Authenticated, tenant-scoped draft/review/retirement operations.
 * RLS and the database trigger remain the final authorization boundary.
 */
(function (root) {
  "use strict";

  const VERSION = "0.1.0";
  const TABLE = "biological_rules";

  function failure(status, reason) {
    return Object.freeze({ status, reason, record: null });
  }

  function rowFor(organizationId, rule) {
    return {
      organization_id: organizationId,
      rule_id: rule.rule_id,
      version: rule.version,
      status: rule.status,
      domain: rule.domain,
      variable_code: rule.variable_code,
      unit_code: rule.unit_code,
      target: rule.target,
      rule,
    };
  }

  async function createDraft(input) {
    const registry = root.BALabsBiologicalRuleRegistry;
    if (!input || !input.client || typeof input.client.from !== "function" ||
        typeof input.organizationId !== "string" || !input.organizationId.trim() ||
        !registry || typeof registry.validate !== "function") {
      return failure("insufficient_context", "authoring_input_incomplete");
    }
    const rule = input.rule;
    if (!rule || rule.status !== "draft" || !registry.validate(rule).valid) {
      return failure("invalid_rule", "draft_rule_failed_registry_validation");
    }
    const { data, error } = await input.client.from(TABLE)
      .insert(rowFor(input.organizationId, rule))
      .select("id,revision_seq,organization_id,rule_id,version,status,rule,created_at")
      .single();
    if (error || !data) return failure("store_error", "draft_insert_failed_or_not_authorized");
    if (data.organization_id !== input.organizationId || data.status !== "draft") {
      return failure("invalid_store_response", "draft_insert_response_mismatch");
    }
    return Object.freeze({ status: "created", reason: "draft_version_created", record: data });
  }

  async function reviewDraft(input) {
    const registry = root.BALabsBiologicalRuleRegistry;
    if (!input || !input.client || !input.client.auth ||
        typeof input.client.auth.getUser !== "function" ||
        typeof input.organizationId !== "string" || !input.organizationId.trim() ||
        typeof input.ruleId !== "string" || !input.ruleId.trim() ||
        typeof input.version !== "string" || !input.version.trim() ||
        !registry || typeof registry.validate !== "function" || typeof registry.isExecutable !== "function") {
      return failure("insufficient_context", "review_input_incomplete");
    }

    const auth = await input.client.auth.getUser();
    const reviewerId = auth && auth.data && auth.data.user && auth.data.user.id;
    if (!auth || auth.error || typeof reviewerId !== "string" || !reviewerId.trim()) {
      return failure("unauthenticated", "authenticated_reviewer_required");
    }

    const found = await input.client.from(TABLE)
      .select("id,organization_id,rule_id,version,status,rule")
      .eq("organization_id", input.organizationId)
      .eq("rule_id", input.ruleId)
      .eq("version", input.version)
      .eq("status", "draft")
      .maybeSingle();
    if (found.error) return failure("store_error", "draft_lookup_failed");
    if (!found.data) return failure("not_found", "draft_not_found_or_already_reviewed");
    if (found.data.organization_id !== input.organizationId ||
        found.data.rule_id !== input.ruleId || found.data.version !== input.version ||
        found.data.status !== "draft" || !registry.validate(found.data.rule).valid) {
      return failure("invalid_rule", "stored_draft_failed_validation");
    }

    const reviewedAt = new Date().toISOString();
    const reviewedRule = {
      ...found.data.rule,
      status: "reviewed",
      review: {
        reviewer_id: reviewerId,
        reviewed_at: reviewedAt,
        ...(typeof input.reviewNote === "string" && input.reviewNote.trim()
          ? { review_note: input.reviewNote.trim() }
          : {}),
      },
    };
    if (!registry.isExecutable(reviewedRule)) {
      return failure("invalid_rule", "reviewed_rule_failed_registry_validation");
    }

    const updated = await input.client.from(TABLE)
      .update({ status: "reviewed", rule: reviewedRule })
      .eq("organization_id", input.organizationId)
      .eq("id", found.data.id)
      .eq("status", "draft")
      .select("id,revision_seq,organization_id,rule_id,version,status,rule,reviewed_by,reviewed_at")
      .maybeSingle();
    if (updated.error) return failure("store_error", "draft_review_update_failed");
    if (!updated.data) return failure("conflict", "draft_changed_before_review_commit");
    if (updated.data.reviewed_by !== reviewerId ||
        updated.data.rule?.review?.reviewer_id !== reviewerId ||
        updated.data.status !== "reviewed") {
      return failure("invalid_store_response", "review_identity_binding_failed");
    }
    return Object.freeze({ status: "published", reason: "reviewed_rule_version_published", record: updated.data });
  }

  async function retireRule(input) {
    const registry = root.BALabsBiologicalRuleRegistry;
    if (!input || !input.client || typeof input.client.from !== "function" ||
        typeof input.organizationId !== "string" || !input.organizationId.trim() ||
        typeof input.newVersion !== "string" || !input.newVersion.trim() ||
        !input.rule || !registry || typeof registry.isExecutable !== "function" ||
        !registry.validate(input.rule).valid || !registry.isExecutable(input.rule)) {
      return failure("invalid_rule", "retirement_requires_an_executable_reviewed_rule_and_new_version");
    }
    if (input.newVersion === input.rule.version) {
      return failure("invalid_rule", "retirement_requires_a_new_version_identifier");
    }
    const retiredRule = { ...input.rule, version: input.newVersion, status: "retired" };
    if (!registry.validate(retiredRule).valid) {
      return failure("invalid_rule", "retired_rule_version_failed_registry_validation");
    }
    const { data, error } = await input.client.from(TABLE)
      .insert(rowFor(input.organizationId, retiredRule))
      .select("id,revision_seq,organization_id,rule_id,version,status,rule,created_at")
      .single();
    if (error || !data) return failure("store_error", "retired_version_insert_failed_or_not_authorized");
    if (data.organization_id !== input.organizationId || data.status !== "retired") {
      return failure("invalid_store_response", "retired_version_response_mismatch");
    }
    return Object.freeze({ status: "retired", reason: "retirement_version_created", record: data });
  }

  root.BALabsBiologicalRuleAuthoring = Object.freeze({
    version: VERSION,
    createDraft,
    reviewDraft,
    retireRule,
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
