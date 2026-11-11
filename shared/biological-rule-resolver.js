/* BA Labs Biological Rule Resolver v0.1.0
 * Exact-match selection only. It never ranks competing rules or guesses context.
 */
(function (root) {
  "use strict";

  const VERSION = "0.1.0";
  const SUPPORTED_SELECTORS = Object.freeze([
    "culture_id", "strain_id", "growth_stage", "medium_code", "environment_id",
  ]);

  function resolve(input) {
    if (!input || typeof input !== "object" || !Array.isArray(input.rules)) {
      return Object.freeze({ status: "insufficient_context", reason: "rule_list_missing", rule: null, candidate_rule_ids: [] });
    }
    const context = input.context;
    if (!context || typeof context !== "object" || Array.isArray(context) ||
        typeof context.culture_id !== "string" || !context.culture_id.trim()) {
      return Object.freeze({ status: "insufficient_context", reason: "culture_context_missing", rule: null, candidate_rule_ids: [] });
    }
    for (const key of ["domain", "variable_code", "unit_code"]) {
      if (typeof input[key] !== "string" || !input[key].trim()) {
        return Object.freeze({ status: "insufficient_context", reason: "required_input_missing:" + key, rule: null, candidate_rule_ids: [] });
      }
    }

    const registry = root.BALabsBiologicalRuleRegistry;
    if (!registry || typeof registry.isExecutable !== "function") {
      return Object.freeze({ status: "insufficient_context", reason: "rule_registry_unavailable", rule: null, candidate_rule_ids: [] });
    }

    const baseCandidates = input.rules.filter((rule) =>
      rule && rule.domain === input.domain &&
      rule.variable_code === input.variable_code &&
      rule.unit_code === input.unit_code &&
      registry.isExecutable(rule)
    );
    const matches = [];
    let missingContext = false;

    for (const rule of baseCandidates) {
      let matchesRule = true;
      const selectors = rule.applies_to && typeof rule.applies_to === "object" ? rule.applies_to : {};
      const target = rule.target && typeof rule.target === "object" ? rule.target : {};
      const requirements = { ...target, ...selectors };

      for (const key of Object.keys(requirements)) {
        if (key !== "taxon_code" && key !== "strain_code" && !SUPPORTED_SELECTORS.includes(key)) {
          matchesRule = false;
          break;
        }
        const expected = requirements[key];
        if (typeof expected !== "string" || !expected.trim()) {
          matchesRule = false;
          break;
        }
        if (typeof context[key] !== "string" || !context[key].trim()) {
          missingContext = true;
          matchesRule = false;
          break;
        }
        if (context[key] !== expected) {
          matchesRule = false;
          break;
        }
      }
      if (matchesRule) matches.push(rule);
    }

    const ids = matches.map((rule) => rule.rule_id);
    if (matches.length === 1) {
      return Object.freeze({ status: "matched_rule", reason: "one_exact_reviewed_rule_match", rule: matches[0], candidate_rule_ids: Object.freeze(ids) });
    }
    if (matches.length > 1) {
      return Object.freeze({ status: "ambiguous_rule", reason: "multiple_exact_reviewed_rules_match", rule: null, candidate_rule_ids: Object.freeze(ids) });
    }
    if (missingContext) {
      return Object.freeze({ status: "insufficient_context", reason: "candidate_rule_requires_missing_context", rule: null, candidate_rule_ids: Object.freeze([]) });
    }
    return Object.freeze({ status: "no_matching_rule", reason: baseCandidates.length ? "no_rule_matches_biological_context" : "no_executable_rule_for_variable_and_unit", rule: null, candidate_rule_ids: Object.freeze([]) });
  }

  root.BALabsBiologicalRuleResolver = Object.freeze({ version: VERSION, resolve });
})(typeof globalThis !== "undefined" ? globalThis : window);
