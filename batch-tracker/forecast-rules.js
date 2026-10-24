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

  // Provider-neutral contract for future forecast adapters (ECMWF/NOAA/etc.).
  // Missing temperatures remain null; timestamps are normalized to ISO UTC.
  function normalizeHourlyForecast(rows, metadata = {}) {
    const source = String(metadata.source ?? "").trim();
    const retrievedAt = Date.parse(metadata.retrievedAt ?? "");
    const issuedAt = Date.parse(metadata.issuedAt ?? "");
    if (!source) return { valid: false, reason: "missing_source", hours: [] };
    if (!Number.isFinite(retrievedAt)) return { valid: false, reason: "invalid_retrieved_at", hours: [] };
    if (!Number.isFinite(issuedAt)) return { valid: false, reason: "invalid_issued_at", hours: [] };
    if (!Array.isArray(rows) || rows.length === 0) return { valid: false, reason: "no_rows", hours: [] };

    const seen = new Set();
    const hours = [];
    for (const row of rows) {
      const timestamp = Date.parse(row?.time ?? "");
      if (!Number.isFinite(timestamp)) return { valid: false, reason: "invalid_timestamp", hours: [] };
      const time = new Date(timestamp).toISOString();
      if (seen.has(time)) return { valid: false, reason: "duplicate_timestamp", hours: [] };
      seen.add(time);
      let temperatureC = null;
      if (row?.temperatureC !== null && row?.temperatureC !== undefined && row?.temperatureC !== "") {
        temperatureC = Number(row.temperatureC);
        if (!Number.isFinite(temperatureC) || temperatureC < -100 || temperatureC > 70) {
          return { valid: false, reason: "invalid_temperature", hours: [] };
        }
      }
      hours.push({ time, temperatureC });
    }
    hours.sort((left, right) => Date.parse(left.time) - Date.parse(right.time));
    return {
      valid: true,
      source,
      retrievedAt: new Date(retrievedAt).toISOString(),
      issuedAt: new Date(issuedAt).toISOString(),
      hours,
      availableTemperatures: hours.filter(hour => hour.temperatureC !== null).length,
      missingTemperatures: hours.filter(hour => hour.temperatureC === null).length,
    };
  }

  root.BALabsForecastRules = Object.freeze({ evaluateTemperatureRange, normalizeHourlyForecast });
})();
