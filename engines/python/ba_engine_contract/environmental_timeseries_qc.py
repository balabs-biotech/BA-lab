"""Deterministic quality screening for environmental measurement time series.

This engine flags data-quality conditions only. It does not infer biological
stress, diagnose cultures, or recommend interventions.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
from math import isfinite
from statistics import median
from uuid import uuid4
from typing import Any, Mapping

from .validation import validate_request


def _iso_utc(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _parse_timestamp(value: str) -> datetime:
    if not isinstance(value, str) or not value:
        raise ValueError("measurement timestamp must be a non-empty string")
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("measurement timestamp must include a timezone")
    return parsed


def _robust_outliers(values: list[float], threshold: float) -> set[int]:
    if len(values) < 3:
        return set()
    center = median(values)
    mad = median([abs(value - center) for value in values])
    if mad == 0:
        return {index for index, value in enumerate(values) if value != center}
    scale = 1.4826 * mad
    return {
        index for index, value in enumerate(values)
        if abs(value - center) / scale > threshold
    }


def analyze_environmental_timeseries_qc(request: Mapping[str, Any]) -> dict[str, Any]:
    """Run transparent timestamp, coverage and robust-outlier checks."""
    validate_request(request)
    if request["engine"]["engine_id"] != "environmental.timeseries.qc":
        raise ValueError("unsupported_engine_id")

    parameters = request["parameters"]
    has_environmental_observations = any(
        record["record_type"] == "environmental_observation"
        for record in request["input"]["records"]
    )
    default_max_gap_minutes = 2160 if has_environmental_observations else 180
    max_gap_minutes = parameters.get("max_gap_minutes", default_max_gap_minutes)
    outlier_threshold = parameters.get("outlier_mad_threshold", 3.5)
    minimum_points = parameters.get("minimum_points", 3)
    rolling_window_points = parameters.get("rolling_baseline_window_points", 12)
    rolling_min_history = parameters.get("rolling_baseline_min_history", 5)
    rolling_threshold = parameters.get("rolling_baseline_mad_threshold", outlier_threshold)
    if isinstance(max_gap_minutes, bool) or not isinstance(max_gap_minutes, (int, float)) or not isfinite(max_gap_minutes) or max_gap_minutes <= 0:
        raise ValueError("invalid_max_gap_minutes")
    if isinstance(outlier_threshold, bool) or not isinstance(outlier_threshold, (int, float)) or not isfinite(outlier_threshold) or outlier_threshold <= 0:
        raise ValueError("invalid_outlier_mad_threshold")
    if isinstance(minimum_points, bool) or not isinstance(minimum_points, int) or minimum_points < 2:
        raise ValueError("invalid_minimum_points")
    if isinstance(rolling_window_points, bool) or not isinstance(rolling_window_points, int) or rolling_window_points < 3:
        raise ValueError("invalid_rolling_baseline_window_points")
    if isinstance(rolling_min_history, bool) or not isinstance(rolling_min_history, int) or rolling_min_history < 3 or rolling_min_history > rolling_window_points:
        raise ValueError("invalid_rolling_baseline_min_history")
    if isinstance(rolling_threshold, bool) or not isinstance(rolling_threshold, (int, float)) or not isfinite(rolling_threshold) or rolling_threshold <= 0:
        raise ValueError("invalid_rolling_baseline_mad_threshold")

    grouped: dict[tuple[str, str], list[tuple[datetime, float, str]]] = defaultdict(list)
    rejected_records: list[dict[str, str]] = []
    source_references: set[str] = set()
    total_measurement_points = 0
    total_environmental_observation_points = 0
    environmental_source_identity: tuple[str, str] | None = None
    for record in request["input"]["records"]:
        record_type = record["record_type"]
        if record_type not in {"measurement", "environmental_observation"}:
            continue
        data = record["data"]
        variable = data.get("variable_code")
        if record_type == "environmental_observation":
            if data.get("data_family") != "weather":
                rejected_records.append({"record_id": record["record_id"], "reason": "unsupported_environmental_data_family"})
                continue
            location_id = request["scope"].get("location_id")
            record_location_id = (record.get("context") or {}).get("location_id")
            if not isinstance(location_id, str) or record_location_id != location_id:
                rejected_records.append({"record_id": record["record_id"], "reason": "environmental_location_scope_mismatch"})
                continue
            provider = data.get("provider_code")
            dataset = data.get("dataset_code")
            if not isinstance(provider, str) or not provider or not isinstance(dataset, str) or not dataset:
                rejected_records.append({"record_id": record["record_id"], "reason": "missing_environmental_source_identity"})
                continue
            identity = (provider, dataset)
            if environmental_source_identity is not None and identity != environmental_source_identity:
                raise ValueError("mixed_environmental_sources_not_supported")
            environmental_source_identity = identity
            source_references.add(f"{provider}/{dataset}")
            value = data.get("value")
            unit = data.get("unit_code")
            timestamp = data.get("observed_at")
        else:
            value = data.get("normalized_value")
            unit = data.get("normalized_unit_code")
            timestamp = data.get("measured_at")
        if not isinstance(variable, str) or not variable:
            rejected_records.append({"record_id": record["record_id"], "reason": "missing_variable_code"})
            continue
        if not isinstance(value, (int, float)) or isinstance(value, bool) or not isfinite(value):
            rejected_records.append({"record_id": record["record_id"], "reason": "missing_or_invalid_value"})
            continue
        if not isinstance(unit, str) or not unit:
            rejected_records.append({"record_id": record["record_id"], "reason": "missing_or_invalid_unit"})
            continue
        try:
            parsed = _parse_timestamp(timestamp)
        except (TypeError, ValueError):
            rejected_records.append({"record_id": record["record_id"], "reason": "invalid_or_timezone_naive_timestamp"})
            continue
        grouped[(variable, unit)].append((parsed, float(value), record["record_id"]))
        if record_type == "measurement":
            total_measurement_points += 1
        else:
            total_environmental_observation_points += 1

    series_results = []
    all_flags: set[str] = set()
    total_points = 0
    for (variable, unit), points in sorted(grouped.items()):
        points.sort(key=lambda item: (item[0], item[2]))
        values = [point[1] for point in points]
        gaps = [
            (points[index][0] - points[index - 1][0]).total_seconds() / 60
            for index in range(1, len(points))
        ]
        duplicate_timestamps = len({point[0] for point in points}) != len(points)
        gap_indexes = [index for index, gap in enumerate(gaps, start=1) if gap > max_gap_minutes]
        gap_intervals = [
            {
                "from": _iso_utc(points[index - 1][0]),
                "to": _iso_utc(points[index][0]),
                "duration_minutes": round(gaps[index - 1], 3),
                "after_record_id": points[index - 1][2],
                "before_record_id": points[index][2],
            }
            for index in gap_indexes
        ]
        duplicate_groups: dict[datetime, list[str]] = defaultdict(list)
        timestamp_groups: dict[datetime, list[tuple[float, str]]] = defaultdict(list)
        for timestamp, value, record_id in points:
            duplicate_groups[timestamp].append(record_id)
            timestamp_groups[timestamp].append((value, record_id))
        duplicate_timestamp_groups = [
            {"timestamp": _iso_utc(timestamp), "record_ids": sorted(record_ids)}
            for timestamp, record_ids in sorted(duplicate_groups.items())
            if len(record_ids) > 1
        ]
        # A timestamp is one temporal observation, regardless of how many
        # records were ingested for that instant. Aggregate duplicates for
        # robust statistics, but do not attribute an outlier to an ambiguous
        # duplicate group at record level.
        temporal_points = [
            {
                "timestamp": timestamp,
                "value": median([item[0] for item in timestamp_values]),
                "record_ids": sorted(item[1] for item in timestamp_values),
            }
            for timestamp, timestamp_values in sorted(timestamp_groups.items())
        ]
        temporal_values = [item["value"] for item in temporal_points]
        temporal_outlier_indexes = _robust_outliers(temporal_values, float(outlier_threshold))
        outlier_record_ids = {
            record_id
            for index in temporal_outlier_indexes
            for record_id in temporal_points[index]["record_ids"]
            if len(temporal_points[index]["record_ids"]) == 1
        }
        center = median(temporal_values)
        mad = median([abs(value - center) for value in temporal_values])
        robust_scale = 1.4826 * mad
        record_values = {record_id: value for _timestamp, value, record_id in points}
        outlier_evidence = [
            {
                "record_id": record_id,
                "observed_value": record_values[record_id],
                "median_value": center,
                "mad": mad,
                "robust_z_score": round(abs(record_values[record_id] - center) / robust_scale, 4) if robust_scale else None,
                "threshold": float(outlier_threshold),
                "interpretation": "deviation_from_median" if robust_scale else "zero_mad_non_median_value",
            }
            for record_id in sorted(outlier_record_ids)
        ]
        rolling_anomaly_evidence = []
        for index, current in enumerate(temporal_points):
            # A duplicate current timestamp has ambiguous record-level
            # attribution, so it is not eligible for point anomaly scoring.
            if len(current["record_ids"]) != 1:
                continue
            history = temporal_points[max(0, index - rolling_window_points):index]
            if len(history) < rolling_min_history:
                continue
            history_values = [item["value"] for item in history]
            baseline = median(history_values)
            baseline_mad = median([abs(item - baseline) for item in history_values])
            current_value = current["value"]
            history_record_ids = sorted({
                record_id for item in history for record_id in item["record_ids"]
            })
            evidence = {
                "record_id": current["record_ids"][0],
                "observed_at": _iso_utc(current["timestamp"]),
                "observed_value": current_value,
                "baseline_median": baseline,
                "baseline_mad": baseline_mad,
                "deviation_from_baseline": current_value - baseline,
                "threshold": float(rolling_threshold),
                "history_point_count": len(history),
                "history_start_at": _iso_utc(history[0]["timestamp"]),
                "history_end_at": _iso_utc(history[-1]["timestamp"]),
                "history_record_ids": history_record_ids,
            }
            if baseline_mad == 0:
                if current_value != baseline:
                    rolling_anomaly_evidence.append({
                        **evidence,
                        "robust_z_score": None,
                        "method": "zero_mad_deviation",
                    })
                continue
            robust_score = abs(current_value - baseline) / (1.4826 * baseline_mad)
            if robust_score > rolling_threshold:
                rolling_anomaly_evidence.append({
                    **evidence,
                    "robust_z_score": round(robust_score, 4),
                    "method": "trailing_rolling_median_mad",
                })
        flags = []
        if len(points) < minimum_points:
            flags.append("insufficient_series_points")
        if duplicate_timestamps:
            flags.append("duplicate_timestamps")
        if gap_indexes:
            flags.append("sampling_gap_detected")
        if outlier_indexes:
            flags.append("robust_outlier_detected")
        if rolling_anomaly_evidence:
            flags.append("rolling_baseline_anomaly_detected")
        all_flags.update(flags)
        total_points += len(points)
        series_results.append({
            "variable_code": variable,
            "unit_code": unit,
            "point_count": len(points),
            "time_start": points[0][0].isoformat(),
            "time_end": points[-1][0].isoformat(),
            "max_gap_minutes": max(gaps, default=0),
            "duplicate_timestamps": duplicate_timestamps,
            "gap_after_record_ids": [points[index - 1][2] for index in gap_indexes],
            "gap_intervals": gap_intervals,
            "duplicate_timestamp_groups": duplicate_timestamp_groups,
            "outlier_record_ids": [points[index][2] for index in sorted(outlier_indexes)],
            "outlier_evidence": outlier_evidence,
            "rolling_baseline_anomaly_evidence": rolling_anomaly_evidence,
            "quality_flags": flags,
        })

    outcome = "success" if series_results and not rejected_records else "insufficient_data"
    limitations = [
        "This engine performs data-quality screening only; it does not infer biological stress or prescribe interventions.",
        "Robust outlier flags are statistical review signals, not evidence that an observation is erroneous.",
        "Rolling baseline anomalies compare each point only with preceding observations; no seasonal, diurnal or biological-stage adjustment is applied, so these signals require contextual review.",
    ]
    if rejected_records:
        limitations.append("Some records were excluded because required values, units, source context or timestamps were missing or invalid.")
    return {
        "outcome": outcome,
        "value": {
            "series": series_results,
            "summary": {
                "series_count": len(series_results),
                "record_count": total_points,
                "measurement_count": total_measurement_points,
                "environmental_observation_count": total_environmental_observation_points,
                "excluded_record_count": len(rejected_records),
                "excluded_records": rejected_records,
            },
        },
        "limitations": limitations,
        "quality_flags": sorted(all_flags),
        "provenance": {
            "algorithm": "environmental-timeseries-qc-mad-v1",
            "libraries": [],
            "source_references": sorted(source_references),
        },
    }


def run_environmental_timeseries_qc(request: Mapping[str, Any]) -> dict[str, Any]:
    """Convenience entrypoint returning the standard validated response envelope."""
    from .runner import EngineSpec, execute_engine

    return execute_engine(
        request,
        EngineSpec(
            engine_id="environmental.timeseries.qc",
            engine_version="0.2.0",
            execute=analyze_environmental_timeseries_qc,
        ),
    )
