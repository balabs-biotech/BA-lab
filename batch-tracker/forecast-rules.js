/* BA Labs deterministic forecast rules; no network or UI dependencies. */
(() => {
  "use strict";
  const root = typeof window !== "undefined" ? window : globalThis;

  function evaluateTemperatureRange(temperatures, lowerInput, upperInput) {
    const lowerText = String(lowerInput ?? "").trim();
    const upperText = String(upperInput ?? "").trim();
    const lower = lowerText === "" ? null : Number(lowerText);
    const upper = upperText === "" ? null : Number(upperText);
    const valid = (lower === null || Number.isFinite(lower)) &&
      (upper === null || Number.isFinite(upper)) &&
      (lower === null || upper === null || lower <= upper);
    const values = (Array.isArray(temperatures) ? temperatures : [])
      .filter(value => value !== null && value !== undefined && value !== "")
      .map(Number).filter(Number.isFinite);
    const configured = lower !== null || upper !== null;
    if (!valid) return { valid: false, configured, lower, upper, availableHours: values.length, outsideHours: null, status: "invalid_range" };
    if (!configured) return { valid: true, configured: false, lower, upper, availableHours: values.length, outsideHours: null, status: "not_configured" };
    if (!values.length) return { valid: true, configured: true, lower, upper, availableHours: 0, outsideHours: null, status: "no_data" };
    const outsideHours = values.reduce((count, value) =>
      count + ((lower !== null && value < lower) || (upper !== null && value > upper) ? 1 : 0), 0);
    return { valid: true, configured: true, lower, upper, availableHours: values.length, outsideHours, status: outsideHours ? "outside_range" : "within_range" };
  }

  root.BALabsForecastRules = Object.freeze({ evaluateTemperatureRange });
})();
