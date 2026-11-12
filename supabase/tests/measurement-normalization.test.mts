import assert from "node:assert/strict";
import { normalizeMeasurement } from "../functions/_shared/measurement-normalization.ts";

const celsius = { code: "degC", dimension: "temperature", factor: 1, offset_value: 0, is_linear: true };
const kelvin = { code: "K", dimension: "temperature", factor: 1, offset_value: -273.15, is_linear: true };
const gram = { code: "g", dimension: "mass", factor: 1, offset_value: 0, is_linear: true };
const kilogram = { code: "kg", dimension: "mass", factor: 1000, offset_value: 0, is_linear: true };
const ph = { code: "pH", dimension: "pH", factor: 1, offset_value: 0, is_linear: false };

assert.deepEqual(normalizeMeasurement(273.15, kelvin, celsius), { ok: true, value: 0, unitCode: "degC" });
assert.deepEqual(normalizeMeasurement(2, kilogram, gram), { ok: true, value: 2000, unitCode: "g" });
assert.deepEqual(normalizeMeasurement(6.4, ph, ph), { ok: true, value: 6.4, unitCode: "pH" });
assert.deepEqual(normalizeMeasurement(6.4, ph, { ...ph, code: "pH_alt" }), {
  ok: false, error: "nonlinear_unit_conversion_not_supported"
});
assert.deepEqual(normalizeMeasurement(1, { ...kilogram, factor: null }, gram), {
  ok: false, error: "unit_conversion_not_calibrated"
});
assert.deepEqual(normalizeMeasurement(1, kilogram, celsius), {
  ok: false, error: "unit_dimension_mismatch"
});
assert.deepEqual(normalizeMeasurement(Number.NaN, kilogram, gram), {
  ok: false, error: "normalization_result_not_finite"
});
assert.deepEqual(normalizeMeasurement(1, gram, null), { ok: true, value: null, unitCode: null });

console.log("✓ BAL-Core normalization: Kelvin/Celsius, mass scaling, pH identity, nonlinear rejection and catalogue guards");
