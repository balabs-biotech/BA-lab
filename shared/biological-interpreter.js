/* BA Labs Biological Interpreter v0.1.0
 * Deterministic, rule-driven assessment. No biological defaults are inferred.
 * The caller must supply an explicitly reviewed range in the same unit as the
 * assessed value. This module never mutates or persists source measurements.
 */
(function (root) {
  "use strict";

  const VERSION = "0.1.0";
  const CONTEXT_KEYS = Object.freeze([
    "culture_id",
    "strain_id",
    "growth_stage",
    "medium_code",
    "environment_id",
  ]);

  function result(status, reason, measurement, rule) {
    const output = {
      status,
      reason,
      engine: "BA-LABS/Biological-Interpreter",
      engine_version: VERSION,
      rule_id: rule?.rule_id ?? null,
      rule_version: rule?.version ?? null,
      raw_measurement_modified: false,
    };
    if (measurement && typeof measurement === "object") {
      output.evidence = Object.freeze({
        variable_code: measurement.variable_code ?? null,
        assessed_value: measurement.assessed_value ?? null,
        assessed_unit_code: measurement.assessed_unit_code ?? null,
        context: Object.freeze({ ...(measurement.context ?? {}) }),
      });
    }
    return Object.freeze(output);
  }

  function assessMeasurement(input) {
    if (!input || typeof input !== "object" || !input.measurement ||
        typeof input.measurement !== "object") {
      return result("insufficient_context", "measurement_missing", null, input?.rule);
    }

    const measurement = input.measurement;
    const rule = input.rule;
    if (!rule || typeof rule !== "object") {
      return result("insufficient_context", "no_reviewed_rule_supplied", measurement, null);
    }
    if (typeof rule.rule_id !== "string" || !rule.rule_id.trim() ||
        typeof rule.version !== "string" || !rule.version.trim() ||
        typeof rule.variable_code !== "string" || !rule.variable_code.trim() ||
        typeof rule.unit_code !== "string" || !rule.unit_code.trim() ||
        typeof rule.min !== "number" || !Number.isFinite(rule.min) ||
        typeof rule.max !== "number" || !Number.isFinite(rule.max) ||
        rule.min > rule.max) {
      return result("insufficient_context", "reviewed_rule_incomplete_or_invalid", measurement, rule);
    }

    if (typeof measurement.assessed_value !== "number" ||
        !Number.isFinite(measurement.assessed_value) ||
        typeof measurement.assessed_unit_code !== "string" ||
        !measurement.assessed_unit_code ||
        typeof measurement.variable_code !== "string" ||
        !measurement.variable_code) {
      return result("insufficient_context", "assessed_value_or_unit_missing", measurement, rule);
    }

    if (measurement.variable_code !== rule.variable_code) {
      return result("not_assessed", "variable_does_not_match_rule", measurement, rule);
    }
    if (measurement.assessed_unit_code !== rule.unit_code) {
      return result("not_assessed", "unit_does_not_match_rule", measurement, rule);
    }

    const context = measurement.context;
    if (!context || typeof context !== "object" || Array.isArray(context) ||
        typeof context.culture_id !== "string" || !context.culture_id.trim()) {
      return result("insufficient_context", "culture_context_missing", measurement, rule);
    }

    const selectors = rule.applies_to && typeof rule.applies_to === "object"
      ? rule.applies_to
      : {};
    for (const key of Object.keys(selectors)) {
      if (!CONTEXT_KEYS.includes(key)) {
        return result("insufficient_context", "rule_uses_unsupported_context_selector", measurement, rule);
      }
      if (typeof context[key] !== "string" || !context[key].trim()) {
        return result("insufficient_context", "required_context_missing:" + key, measurement, rule);
      }
      if (context[key] !== selectors[key]) {
        return result("not_assessed", "context_does_not_match_rule:" + key, measurement, rule);
      }
    }

    const withinRange = measurement.assessed_value >= rule.min &&
      measurement.assessed_value <= rule.max;
    return result(
      withinRange ? "normal" : "out_of_range",
      withinRange ? "within_explicit_reviewed_range" : "outside_explicit_reviewed_range",
      measurement,
      rule
    );
  }

  root.BALabsBiologicalInterpreter = Object.freeze({
    version: VERSION,
    assessMeasurement,
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
