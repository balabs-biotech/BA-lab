/* BA Labs Biological Assessment Store v0.1.0
 * Persists append-only, tenant-scoped assessment evidence through a guarded RPC.
 * Client-calculated outcomes are explicitly marked as not server-recomputed.
 */
(function (root) {
  "use strict";
  const VERSION = "0.1.0";
  const ALLOWED = new Set(["normal","out_of_range","insufficient_context","not_assessed","no_matching_rule","ambiguous_rule"]);

  async function record(input) {
    if (!input || !input.client || typeof input.client.rpc !== "function" ||
        typeof input.organizationId !== "string" || !input.organizationId.trim() ||
        typeof input.measurementId !== "string" || !input.measurementId.trim() ||
        !input.result || !ALLOWED.has(input.result.status) ||
        !input.measurementSnapshot || !input.contextSnapshot ||
        !input.resolutionSnapshot || !input.resultSnapshot) {
      return Object.freeze({ status: "insufficient_context", reason: "assessment_record_input_incomplete", id: null });
    }
    const auth = await input.client.auth.getUser();
    const userId = auth && auth.data && auth.data.user && auth.data.user.id;
    if (!auth || auth.error || typeof userId !== "string" || !userId.trim()) {
      return Object.freeze({ status: "unauthenticated", reason: "assessment_record_requires_authenticated_user", id: null });
    }
    const contextSnapshot = Object.freeze({
      ...input.contextSnapshot,
      organization_id: input.organizationId,
    });
    const { data, error } = await input.client.rpc("record_biological_assessment", {
      p_source_measurement_id: input.measurementId,
      p_rule_version_id: input.ruleVersionId || null,
      p_status: input.result.status,
      p_reason: input.result.reason,
      p_engine_version: input.result.engine_version,
      p_measurement_snapshot: input.measurementSnapshot,
      p_context_snapshot: contextSnapshot,
      p_resolution_snapshot: input.resolutionSnapshot,
      p_result_snapshot: input.resultSnapshot,
    });
    if (error || typeof data !== "string" || !data) {
      return Object.freeze({ status: "unavailable", reason: "assessment_record_write_failed", id: null });
    }
    return Object.freeze({ status: "recorded", reason: "append_only_assessment_recorded", id: data });
  }

  async function loadHistory(input) {
    if (!input || !input.client || typeof input.client.from !== "function" ||
        typeof input.organizationId !== "string" || !input.organizationId.trim() ||
        typeof input.measurementId !== "string" || !input.measurementId.trim()) {
      return Object.freeze({ status: "insufficient_context", records: Object.freeze([]) });
    }
    const { data, error } = await input.client.from("biological_assessments")
      .select("id,organization_id,source_measurement_id,rule_version_id,status,reason,engine_version,calculation_origin,server_verification,measurement_snapshot,context_snapshot,resolution_snapshot,result_snapshot,assessed_by,assessed_at")
      .eq("organization_id", input.organizationId)
      .eq("source_measurement_id", input.measurementId)
      .order("assessed_at", { ascending: false })
      .limit(100);
    if (error) return Object.freeze({ status: "unavailable", records: Object.freeze([]) });
    const records = (Array.isArray(data) ? data : []).filter(row =>
      row && row.organization_id === input.organizationId &&
      row.source_measurement_id === input.measurementId &&
      ALLOWED.has(row.status) && row.calculation_origin === "client_engine" &&
      row.server_verification === "not_recomputed"
    );
    return Object.freeze({ status: "loaded", records: Object.freeze(records) });
  }


  async function loadHistoryBatch(input) {
    if (!input || !input.client || typeof input.client.from !== "function" ||
        typeof input.organizationId !== "string" || !input.organizationId.trim() ||
        !Array.isArray(input.measurementIds) || !input.measurementIds.length) {
      return Object.freeze({ status: "insufficient_context", records: Object.freeze([]) });
    }
    const ids = [...new Set(input.measurementIds.filter(id => typeof id === "string" && id.trim()))].slice(0, 50);
    if (!ids.length) return Object.freeze({ status: "insufficient_context", records: Object.freeze([]) });
    const { data, error } = await input.client.from("biological_assessments")
      .select("id,organization_id,source_measurement_id,rule_version_id,status,reason,engine_version,calculation_origin,server_verification,result_snapshot,assessed_at")
      .eq("organization_id", input.organizationId)
      .in("source_measurement_id", ids)
      .order("assessed_at", { ascending: false })
      .limit(500);
    if (error) return Object.freeze({ status: "unavailable", records: Object.freeze([]) });
    const records = (Array.isArray(data) ? data : []).filter(row =>
      row && row.organization_id === input.organizationId && ids.includes(row.source_measurement_id) &&
      ALLOWED.has(row.status) && row.calculation_origin === "client_engine" &&
      row.server_verification === "not_recomputed"
    );
    return Object.freeze({ status: "loaded", records: Object.freeze(records) });
  }
\n  root.BALabsBiologicalAssessmentStore = Object.freeze({ version: VERSION, record, loadHistory, loadHistoryBatch });
})(typeof globalThis !== "undefined" ? globalThis : window);
