/* BA Labs Biological Rule Registry v0.1.0
 * Validates explicit rule records and gates execution to reviewed rules.
 * It does not verify source authenticity or approve biological thresholds.
 */
(function (root) {
  "use strict";

  const VERSION = "0.1.0";
  const STATUSES = new Set(["draft", "reviewed", "retired"]);
  const SOURCE_TYPES = new Set([
    "publication",
    "standard",
    "validated_internal_protocol",
    "dataset",
    "expert_review",
  ]);

  function validate(rule) {
    const errors = [];
    if (!rule || typeof rule !== "object" || Array.isArray(rule)) {
      return Object.freeze({ valid: false, errors: Object.freeze(["rule_must_be_object"]) });
    }

    for (const key of ["rule_id", "version", "domain", "variable_code", "unit_code"]) {
      if (typeof rule[key] !== "string" || !rule[key].trim()) errors.push("missing_or_invalid:" + key);
    }
    if (!STATUSES.has(rule.status)) errors.push("invalid_status");
    if (typeof rule.min !== "number" || !Number.isFinite(rule.min)) errors.push("invalid_min");
    if (typeof rule.max !== "number" || !Number.isFinite(rule.max)) errors.push("invalid_max");
    if (Number.isFinite(rule.min) && Number.isFinite(rule.max) && rule.min > rule.max) {
      errors.push("min_greater_than_max");
    }

    const target = rule.target;
    if (!target || typeof target !== "object" || Array.isArray(target) ||
        !(typeof target.taxon_code === "string" && target.taxon_code.trim()) &&
        !(typeof target.strain_code === "string" && target.strain_code.trim())) {
      errors.push("target_requires_taxon_or_strain_code");
    }

    if (!Array.isArray(rule.sources) || rule.sources.length === 0) {
      errors.push("at_least_one_source_required");
    } else {
      rule.sources.forEach((source, index) => {
        if (!source || typeof source !== "object" ||
            !SOURCE_TYPES.has(source.type) ||
            typeof source.citation !== "string" || !source.citation.trim()) {
          errors.push("invalid_source:" + index);
        }
      });
    }

    if (rule.status === "reviewed") {
      const review = rule.review;
      if (!review || typeof review !== "object" ||
          typeof review.reviewer_id !== "string" || !review.reviewer_id.trim() ||
          typeof review.reviewed_at !== "string" ||
          !Number.isFinite(Date.parse(review.reviewed_at))) {
        errors.push("reviewed_rule_requires_reviewer_and_timestamp");
      }
    }

    if (target && typeof target === "object" && target.growth_stage !== undefined &&
        (typeof target.growth_stage !== "string" || !target.growth_stage.trim())) {
      errors.push("invalid_growth_stage");
    }

    return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
  }

  function isExecutable(rule) {
    return validate(rule).valid && rule.status === "reviewed";
  }

  root.BALabsBiologicalRuleRegistry = Object.freeze({
    version: VERSION,
    validate,
    isExecutable,
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
