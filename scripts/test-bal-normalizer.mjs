import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync("shared/bal-normalizer.js", "utf8");
const context = { Map, Number, Object, Array, globalThis: {} };
vm.runInNewContext(source, context, { filename: "shared/bal-normalizer.js" });
const normalize = context.globalThis.BALabsNormalizer.normalizeMeasurement;
const units = [
  { code: "g", dimension: "mass", factor: 1, offset_value: 0, is_linear: true },
  { code: "kg", dimension: "mass", factor: 1000, offset_value: 0, is_linear: true },
  { code: "mg", dimension: "mass", factor: 0.001, offset_value: 0, is_linear: true },
  { code: "degC", dimension: "temperature", factor: 1, offset_value: 0, is_linear: true },
  { code: "K", dimension: "temperature", factor: 1, offset_value: 0, is_linear: true },
  { code: "pH", dimension: "pH", factor: 1, offset_value: 0, is_linear: false },
  { code: "mL", dimension: "volume", factor: 1, offset_value: 0, is_linear: true },
  { code: "L", dimension: "volume", factor: 1000, offset_value: 0, is_linear: true },
];
const mass = { code: "fresh_mass", dimension: "mass", canonical_unit_code: "g" };

assert.equal(normalize({ rawValue: 2, rawUnitCode: "kg", variable: mass, units }).normalizedValue, 2000);
assert.equal(normalize({ rawValue: 250, rawUnitCode: "mg", variable: mass, units }).normalizedValue, 0.25);
assert.equal(normalize({ rawValue: 2, rawUnitCode: "g", variable: mass, units }).status, "already_canonical");
assert.equal(normalize({ rawValue: 2, rawUnitCode: "L", variable: { code: "volume", dimension: "volume", canonical_unit_code: "mL" }, units }).normalizedValue, 2000);
assert.equal(normalize({ rawValue: 25, rawUnitCode: "K", variable: { code: "temperature", dimension: "temperature", canonical_unit_code: "degC" }, units }).reason, "nonlinear_or_offset_conversion_not_enabled");
assert.equal(normalize({ rawValue: 6.5, rawUnitCode: "pH", variable: { code: "ph", dimension: "pH", canonical_unit_code: "pH" }, units }).status, "already_canonical");
assert.equal(normalize({ rawValue: 6.5, rawUnitCode: "pH", variable: { code: "ph", dimension: "pH", canonical_unit_code: "pH2" }, units }).reason, "canonical_unit_missing");
assert.equal(normalize({ rawValue: "2", rawUnitCode: "kg", variable: mass, units }).reason, "invalid_raw_value");
assert.equal(normalize({ rawValue: 2, rawUnitCode: "mL", variable: mass, units }).reason, "raw_unit_dimension_mismatch");

console.log("✓ BAL-Normalizer: deterministic factor conversion, identity, dimension checks and conservative blocks");
