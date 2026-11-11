/* BAL-Normalizer v0.1 — deterministic catalogue-backed unit assessment.
 * This module is advisory and pure: it never writes to BAL-Core or mutates input.
 * Conversion is deliberately conservative until catalogue factors are audited.
 */
(function (root) {
  "use strict";

  function blocked(reason, details = {}) {
    return Object.freeze({ status: "blocked", reason, ...details });
  }

  function normalizeMeasurement(input) {
    if (!input || typeof input !== "object") return blocked("invalid_input");
    const { rawValue, rawUnitCode, variable, units } = input;
    if (typeof rawValue !== "number" || !Number.isFinite(rawValue)) return blocked("invalid_raw_value");
    if (typeof rawUnitCode !== "string" || !rawUnitCode) return blocked("missing_raw_unit");
    if (!variable || typeof variable !== "object" || !variable.code) return blocked("unknown_variable");
    if (!Array.isArray(units)) return blocked("unit_catalogue_unavailable");

    const unitByCode = new Map(units.map((unit) => [unit.code, unit]));
    const rawUnit = unitByCode.get(rawUnitCode);
    if (!rawUnit) return blocked("unknown_raw_unit", { rawUnitCode });
    if (rawUnit.dimension !== variable.dimension) {
      return blocked("raw_unit_dimension_mismatch", { variableCode: variable.code, rawUnitCode });
    }

    const canonicalCode = variable.canonical_unit_code;
    if (typeof canonicalCode !== "string" || !canonicalCode) {
      return blocked("canonical_unit_not_configured", { variableCode: variable.code });
    }
    const canonicalUnit = unitByCode.get(canonicalCode);
    if (!canonicalUnit) return blocked("canonical_unit_missing", { canonicalUnitCode: canonicalCode });
    if (canonicalUnit.dimension !== variable.dimension) {
      return blocked("canonical_unit_dimension_mismatch", { variableCode: variable.code, canonicalUnitCode: canonicalCode });
    }

    if (rawUnitCode === canonicalCode) {
      return Object.freeze({
        status: "already_canonical",
        normalizedValue: rawValue,
        normalizedUnitCode: canonicalCode,
        method: "identity",
        version: "0.1.0",
      });
    }

    // Temperature and logarithmic scales require validated offsets/non-linear
    // transforms. Current catalogue seeds are not sufficient to infer them.
    if (variable.dimension === "temperature" || variable.dimension === "pH" ||
        rawUnit.is_linear !== true || canonicalUnit.is_linear !== true) {
      return blocked("nonlinear_or_offset_conversion_not_enabled", {
        rawUnitCode, canonicalUnitCode: canonicalCode,
      });
    }

    const rawFactor = Number(rawUnit.factor);
    const canonicalFactor = Number(canonicalUnit.factor);
    const rawOffset = Number(rawUnit.offset_value ?? 0);
    const canonicalOffset = Number(canonicalUnit.offset_value ?? 0);
    if (!Number.isFinite(rawFactor) || rawFactor <= 0 ||
        !Number.isFinite(canonicalFactor) || canonicalFactor <= 0) {
      return blocked("invalid_conversion_factor", { rawUnitCode, canonicalUnitCode: canonicalCode });
    }
    if (!Number.isFinite(rawOffset) || !Number.isFinite(canonicalOffset) ||
        rawOffset !== 0 || canonicalOffset !== 0) {
      return blocked("offset_conversion_not_enabled", { rawUnitCode, canonicalUnitCode: canonicalCode });
    }

    const normalizedValue = rawValue * rawFactor / canonicalFactor;
    if (!Number.isFinite(normalizedValue)) return blocked("conversion_overflow");
    return Object.freeze({
      status: "normalized",
      normalizedValue,
      normalizedUnitCode: canonicalCode,
      method: "catalogue_factor_ratio",
      version: "0.1.0",
      source: Object.freeze({ rawValue, rawUnitCode }),
    });
  }

  root.BALabsNormalizer = Object.freeze({ normalizeMeasurement, version: "0.1.0" });
})(typeof globalThis !== "undefined" ? globalThis : window);
