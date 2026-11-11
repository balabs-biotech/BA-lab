/* BA Labs Biological Assessment Engine v0.1.0
 * Orchestrates exact rule resolution followed by deterministic assessment.
 * It never converts, mutates or persists source measurements.
 */
(function (root) {
  "use strict";

  const VERSION = "0.1.0";

  function assess(input) {
    const resolver = root.BALabsBiologicalRuleResolver;
    const interpreter = root.BALabsBiologicalInterpreter;
    if (!resolver || typeof resolver.resolve !== "function" ||
        !interpreter || typeof interpreter.assessMeasurement !== "function") {
      return Object.freeze({
        status: "insufficient_context",
        reason: "biological_engine_dependency_unavailable",
        resolution: Object.freeze({ status: "insufficient_context", reason: "engine_dependency_unavailable", candidate_rule_ids: Object.freeze([]) }),
        assessment: null,
        raw_measurement_modified: false,
      });
    }
    if (!input || typeof input !== "object" || !input.measurement || typeof input.measurement !== "object") {
      return Object.freeze({
        status: "insufficient_context",
        reason: "measurement_missing",
        resolution: Object.freeze({ status: "insufficient_context", reason: "measurement_missing", candidate_rule_ids: Object.freeze([]) }),
        assessment: null,
        raw_measurement_modified: false,
      });
    }

    const measurement = input.measurement;
    const resolution = resolver.resolve({
      domain: input.domain,
      variable_code: measurement.variable_code,
      unit_code: measurement.assessed_unit_code,
      context: input.context,
      rules: input.rules,
    });

    if (resolution.status !== "matched_rule" || !resolution.rule) {
      return Object.freeze({
        status: resolution.status,
        reason: resolution.reason,
        resolution,
        assessment: null,
        raw_measurement_modified: false,
      });
    }

    const assessment = interpreter.assessMeasurement({
      measurement: { ...measurement, context: input.context },
      rule: resolution.rule,
    });
    return Object.freeze({
      status: assessment.status,
      reason: assessment.reason,
      resolution,
      assessment,
      raw_measurement_modified: false,
    });
  }

  root.BALabsBiologicalAssessmentEngine = Object.freeze({ version: VERSION, assess });
})(typeof globalThis !== "undefined" ? globalThis : window);
