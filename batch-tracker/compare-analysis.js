(function (root) {
  "use strict";

  function median(values) {
    if (!values.length) return null;
    const sorted = values.slice().sort(function (a, b) { return a - b; });
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function quantile(sortedValues, probability) {
    if (!sortedValues.length) return null;
    const position = (sortedValues.length - 1) * probability;
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    if (lower === upper) return sortedValues[lower];
    return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * (position - lower);
  }

  function summarize(values) {
    const finite = values.filter(Number.isFinite).slice().sort(function (a, b) { return a - b; });
    if (!finite.length) return { n: 0, min: null, max: null, mean: null, median: null, q1: null, q3: null };
    return {
      n: finite.length,
      min: finite[0],
      max: finite[finite.length - 1],
      mean: finite.reduce(function (sum, value) { return sum + value; }, 0) / finite.length,
      median: median(finite),
      q1: quantile(finite, 0.25),
      q3: quantile(finite, 0.75)
    };
  }

  function detectOutlierIds(points) {
    const valid = points.filter(function (point) { return Number.isFinite(point.value); });
    if (valid.length < 4) return [];
    const stats = summarize(valid.map(function (point) { return point.value; }));
    const spread = stats.q3 - stats.q1;
    const low = stats.q1 - 1.5 * spread;
    const high = stats.q3 + 1.5 * spread;
    return valid.filter(function (point) { return point.value < low || point.value > high; }).map(function (point) { return point.id; });
  }

  function detectOutliersByBatch(points, batchIds) {
    const ids = new Set();
    batchIds.forEach(function (batchId) {
      detectOutlierIds(points.filter(function (point) { return point.batchId === batchId; }))
        .forEach(function (id) { ids.add(id); });
    });
    return Array.from(ids);
  }

  function pearson(pairs) {
    if (pairs.length < 4) return null;
    const meanX = pairs.reduce(function (sum, pair) { return sum + pair.x; }, 0) / pairs.length;
    const meanY = pairs.reduce(function (sum, pair) { return sum + pair.y; }, 0) / pairs.length;
    let numerator = 0;
    let squareX = 0;
    let squareY = 0;
    pairs.forEach(function (pair) {
      const dx = pair.x - meanX;
      const dy = pair.y - meanY;
      numerator += dx * dy;
      squareX += dx * dx;
      squareY += dy * dy;
    });
    const denominator = Math.sqrt(squareX * squareY);
    return denominator ? numerator / denominator : null;
  }

  function dateKey(value) {
    if (!value) return null;
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return null;
    const pad = function (number) { return String(number).padStart(2, "0"); };
    return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
  }

  function dateInRange(value, fromDate, toDate) {
    if (!value) return !fromDate && !toDate;
    const day = dateKey(value);
    return !!day && (!fromDate || day >= fromDate) && (!toDate || day <= toDate);
  }

  function resolveBatchId(row, eventToBatch, cultureToBatch, sampleToBatch) {
    if (row.event_id) return eventToBatch.get(row.event_id) || null;
    if (row.culture_id) return cultureToBatch.get(row.culture_id) || null;
    if (row.sample_id) return sampleToBatch.get(row.sample_id) || null;
    return null;
  }

  function convertUnit(value, fromUnit, toUnit, dimension) {
    if (!Number.isFinite(value) || !fromUnit || !toUnit) return null;
    if (fromUnit.code === toUnit.code) return value;
    if (dimension === "pH" || fromUnit.dimension !== toUnit.dimension || fromUnit.dimension !== dimension) return null;
    if (fromUnit.is_linear !== true || toUnit.is_linear !== true) return null;

    // Kelvin/Celsius are affine units. The live catalogue currently records
    // K with offset 0, so use the exact standard conversion for these two codes.
    if (dimension === "temperature") {
      let celsius;
      if (fromUnit.code === "K") celsius = value - 273.15;
      else if (fromUnit.code === "degC") celsius = value;
      else return null;
      if (toUnit.code === "degC") return celsius;
      if (toUnit.code === "K") return celsius + 273.15;
      return null;
    }

    const fromFactor = Number(fromUnit.factor);
    const fromOffset = Number(fromUnit.offset_value);
    const toFactor = Number(toUnit.factor);
    const toOffset = Number(toUnit.offset_value);
    if (![fromFactor, fromOffset, toFactor, toOffset].every(Number.isFinite) || fromFactor <= 0 || toFactor <= 0) return null;
    const baseValue = value * fromFactor + fromOffset;
    const converted = (baseValue - toOffset) / toFactor;
    return Number.isFinite(converted) ? converted : null;
  }

  root.BACompareAnalysis = {
    median: median,
    summarize: summarize,
    detectOutlierIds: detectOutlierIds,
    detectOutliersByBatch: detectOutliersByBatch,
    pearson: pearson,
    convertUnit: convertUnit,
    resolveBatchId: resolveBatchId,
    dateKey: dateKey,
    dateInRange: dateInRange
  };
})(typeof window !== "undefined" ? window : globalThis);
