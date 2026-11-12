export type UnitDefinition = {
  code: string;
  dimension: string;
  factor: number | string | null;
  offset_value: number | string | null;
  is_linear: boolean;
};

export type NormalizationResult =
  | { ok: true; value: number | null; unitCode: string | null }
  | { ok: false; error: "unit_dimension_mismatch" | "nonlinear_unit_conversion_not_supported" | "unit_conversion_not_calibrated" | "normalization_result_not_finite" };

/**
 * Convert an immutable raw measurement into a variable's canonical unit.
 * Unit factor/offset map a unit value to the dimension's base representation:
 * base = raw * factor + offset.
 */
export function normalizeMeasurement(
  rawValue: number,
  rawUnit: UnitDefinition,
  canonicalUnit: UnitDefinition | null,
): NormalizationResult {
  if (!Number.isFinite(rawValue)) {
    return { ok: false, error: "normalization_result_not_finite" };
  }
  if (!canonicalUnit) return { ok: true, value: null, unitCode: null };
  if (rawUnit.dimension !== canonicalUnit.dimension) {
    return { ok: false, error: "unit_dimension_mismatch" };
  }
  if (rawUnit.code === canonicalUnit.code) {
    return { ok: true, value: rawValue, unitCode: canonicalUnit.code };
  }
  if (!rawUnit.is_linear || !canonicalUnit.is_linear) {
    return { ok: false, error: "nonlinear_unit_conversion_not_supported" };
  }

  if (rawUnit.factor === null || canonicalUnit.factor === null ||
      rawUnit.offset_value === null || canonicalUnit.offset_value === null) {
    return { ok: false, error: "unit_conversion_not_calibrated" };
  }
  const rawFactor = Number(rawUnit.factor);
  const canonicalFactor = Number(canonicalUnit.factor);
  const rawOffset = Number(rawUnit.offset_value);
  const canonicalOffset = Number(canonicalUnit.offset_value);
  if (!Number.isFinite(rawFactor) || rawFactor === 0 ||
      !Number.isFinite(canonicalFactor) || canonicalFactor === 0 ||
      !Number.isFinite(rawOffset) || !Number.isFinite(canonicalOffset)) {
    return { ok: false, error: "unit_conversion_not_calibrated" };
  }

  const baseValue = rawValue * rawFactor + rawOffset;
  const value = (baseValue - canonicalOffset) / canonicalFactor;
  if (!Number.isFinite(value)) {
    return { ok: false, error: "normalization_result_not_finite" };
  }
  return { ok: true, value, unitCode: canonicalUnit.code };
}
