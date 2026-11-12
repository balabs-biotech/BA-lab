"""Deterministic biological context features from an authorized immutable snapshot.

This first slice reports traceable observations, coverage and descriptive
statistics only. It does not diagnose organisms or recommend interventions.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from math import isfinite
from statistics import fmean
from typing import Any, Mapping

from .validation import validate_request


def _timestamp(value: Any, field: str) -> datetime:
    if not isinstance(value, str) or not value:
        raise ValueError(f"{field}_required")
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError(f"{field}_timezone_required")
    return parsed


def _iso(value: datetime) -> str:
    return value.isoformat().replace("+00:00", "Z")


def analyze_biological_context_features(request: Mapping[str, Any]) -> dict[str, Any]:
    """Build a bounded, provenance-preserving context assessment."""
    validate_request(request)
    engine_identity = request["engine"]
    if engine_identity.get("engine_id") != "biological.context.features" or engine_identity.get("engine_version") not in {"0.1.0", "0.2.0"}:
        raise ValueError("unsupported_engine_identity")

    scope = request["scope"]
    culture_id = scope.get("culture_id")
    plant_culture_id = scope.get("plant_culture_id")
    batch_id = scope.get("batch_id")
    subject_values = [culture_id, plant_culture_id, batch_id]
    if sum(value is not None for value in subject_values) != 1:
        raise ValueError("exactly_one_biological_subject_required")
    if batch_id:
        raise ValueError("batch_subject_adapter_not_yet_supported")
    if plant_culture_id and engine_identity["engine_version"] != "0.2.0":
        raise ValueError("plant_subject_requires_engine_version_0_2_0")
    subject_field = "plant_culture_id" if plant_culture_id else "culture_id"
    subject_id = plant_culture_id or culture_id
    subject_type = "plant" if plant_culture_id else "culture"

    parameters = request["parameters"]
    window_start = _timestamp(parameters.get("window_start"), "window_start")
    window_end = _timestamp(parameters.get("window_end"), "window_end")
    if window_end <= window_start:
        raise ValueError("analysis_window_end_must_follow_start")
    timezone_name = parameters.get("timezone", "UTC")
    if not isinstance(timezone_name, str) or not timezone_name:
        raise ValueError("analysis_timezone_required")
    biological_contexts = parameters.get("biological_contexts", [])
    if not isinstance(biological_contexts, list) or len(biological_contexts) > 500:
        raise ValueError("invalid_biological_context_snapshot")
    if any(not isinstance(item, dict) for item in biological_contexts):
        raise ValueError("invalid_biological_context_snapshot")

    grouped: dict[tuple[str, str, str, str], list[tuple[datetime, float, str]]] = defaultdict(list)
    observed_facts: list[dict[str, Any]] = []
    excluded: list[dict[str, str]] = []
    accepted_by_type: dict[str, int] = defaultdict(int)
    environmental_sources: set[tuple[str, str]] = set()

    for record in request["input"]["records"]:
        record_id = record["record_id"]
        record_type = record["record_type"]
        data = record["data"]
        context = record.get("context") or {}

        if record_type == "measurement":
            if data.get("quality_state") == "excluded":
                excluded.append({"record_id": record_id, "reason": "measurement_quality_state_excluded"})
                continue
            if context.get(subject_field) != subject_id:
                excluded.append({"record_id": record_id, "reason": f"measurement_{subject_type}_scope_mismatch"})
                continue
            variable = data.get("variable_code")
            value = data.get("normalized_value")
            unit = data.get("normalized_unit_code")
            timestamp_value = data.get("measured_at")
            source_label = "local_measurement"
        elif record_type == "environmental_observation":
            location_id = scope.get("location_id")
            if not location_id or context.get("location_id") != location_id:
                excluded.append({"record_id": record_id, "reason": "environmental_location_scope_mismatch"})
                continue
            if data.get("data_family") != "weather":
                excluded.append({"record_id": record_id, "reason": "unsupported_environmental_data_family"})
                continue
            provider = data.get("provider_code")
            dataset = data.get("dataset_code")
            if not isinstance(provider, str) or not provider or not isinstance(dataset, str) or not dataset:
                excluded.append({"record_id": record_id, "reason": "missing_environmental_source_identity"})
                continue
            environmental_sources.add((provider, dataset))
            variable = data.get("variable_code")
            value = data.get("value")
            unit = data.get("unit_code")
            timestamp_value = data.get("observed_at")
            source_label = f"gridded_or_provider_observation:{provider}/{dataset}"
        else:
            excluded.append({"record_id": record_id, "reason": "unsupported_record_type"})
            continue

        if not isinstance(variable, str) or not variable:
            excluded.append({"record_id": record_id, "reason": "missing_variable_code"})
            continue
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not isfinite(value):
            excluded.append({"record_id": record_id, "reason": "invalid_numeric_value"})
            continue
        if not isinstance(unit, str) or not unit:
            excluded.append({"record_id": record_id, "reason": "missing_unit"})
            continue
        try:
            observed_at = _timestamp(timestamp_value, "observation_timestamp")
        except (TypeError, ValueError):
            excluded.append({"record_id": record_id, "reason": "invalid_or_timezone_naive_timestamp"})
            continue
        if observed_at < window_start or observed_at > window_end:
            excluded.append({"record_id": record_id, "reason": "outside_requested_window"})
            continue

        key = (record_type, source_label, variable, unit)
        grouped[key].append((observed_at, float(value), record_id))
        accepted_by_type[record_type] += 1
        observed_facts.append({
            "fact_code": f"{record_type}.{variable}",
            "statement": f"{source_label}: {variable} = {value} {unit}",
            "observed_at": _iso(observed_at),
            "source_record_ids": [record_id],
            "value": value,
            "unit_code": unit,
        })

    derived_features: list[dict[str, Any]] = []
    temporal_gaps: list[dict[str, Any]] = []
    observed_times: list[datetime] = []
    for (record_type, source_label, variable, unit), points in sorted(grouped.items()):
        points.sort(key=lambda item: (item[0], item[2]))
        times = [point[0] for point in points]
        values = [point[1] for point in points]
        source_ids = [point[2] for point in points]
        observed_times.extend(times)
        prefix = f"{record_type}.{variable}"
        for suffix, value, method in (
            ("mean", fmean(values), "arithmetic_mean"),
            ("minimum", min(values), "minimum"),
            ("maximum", max(values), "maximum"),
            ("count", len(values), "record_count"),
        ):
            derived_features.append({
                "feature_code": f"series.{prefix}.{suffix}",
                "value": value,
                "method": method,
                "method_version": "1.0.0",
                "unit_code": "count" if suffix == "count" else unit,
                "source_record_ids": source_ids,
            })
        # The expected cadence is explicit and source-sensitive; this is a
        # coverage signal, not a claim that a missing observation is biological stress.
        default_gap_minutes = 2160 if record_type == "environmental_observation" else 180
        max_gap_minutes = parameters.get("max_gap_minutes", default_gap_minutes)
        if isinstance(max_gap_minutes, bool) or not isinstance(max_gap_minutes, (int, float)) or not isfinite(max_gap_minutes) or max_gap_minutes <= 0:
            raise ValueError("invalid_max_gap_minutes")
        for previous, current in zip(times, times[1:]):
            duration = (current - previous).total_seconds()
            if duration > max_gap_minutes * 60:
                temporal_gaps.append({
                    "from": _iso(previous),
                    "to": _iso(current),
                    "duration_seconds": duration,
                })

    observed_window = None
    if observed_times:
        observed_window = {
            "start": _iso(min(observed_times)),
            "end": _iso(max(observed_times)),
            "timezone": timezone_name,
        }

    missing_context = []
    if not accepted_by_type.get("measurement"):
        missing_context.append("no_eligible_local_measurements")
    if not accepted_by_type.get("environmental_observation"):
        missing_context.append("no_linked_environmental_observations_supplied")
    if excluded:
        missing_context.append("some_input_records_were_excluded")
    if not biological_contexts:
        missing_context.append("biological_context_not_recorded")
    if any(
        (item.get("genetic_reference") or {}).get("status") == "unresolved"
        for item in biological_contexts
    ):
        missing_context.append("genetic_reference_unresolved")
    environment_link_state = parameters.get("environment_link_state")
    if environment_link_state == "unlinked":
        missing_context.append("plant_environment_not_linked" if plant_culture_id else "culture_environment_not_linked")
    elif environment_link_state == "environment_without_location":
        missing_context.append("plant_environment_location_missing" if plant_culture_id else "culture_environment_location_missing")
    elif environment_link_state == "ambiguous":
        missing_context.append("analysis_window_environment_ambiguous")
    elif environment_link_state == "conflict":
        missing_context.append("analysis_window_environment_conflict")
    elif environment_link_state == "missing":
        missing_context.append("analysis_window_environment_not_resolved")

    measurement_environment_states = {
        (record.get("context") or {}).get("environment_resolution", {}).get("status")
        for record in request["input"]["records"]
        if record.get("record_type") == "measurement"
    }
    if "ambiguous" in measurement_environment_states:
        missing_context.append("measurement_environment_context_ambiguous")
    if "conflict" in measurement_environment_states:
        missing_context.append("measurement_environment_context_conflict")
    if "missing" in measurement_environment_states:
        missing_context.append("measurement_environment_context_missing")

    quality_flags = ["biological_interpretation_not_performed"]
    if environment_link_state == "ambiguous":
        quality_flags.append("environment_context_ambiguous")
    if environment_link_state == "conflict" or "conflict" in measurement_environment_states:
        quality_flags.append("environment_context_conflict")
    if "ambiguous" in measurement_environment_states:
        quality_flags.append("measurement_environment_context_ambiguous")
    if "missing" in measurement_environment_states:
        quality_flags.append("measurement_environment_context_missing")
    if not observed_times:
        quality_flags.append("insufficient_data")
    if any(
        (item.get("genetic_reference") or {}).get("status") == "unresolved"
        for item in biological_contexts
    ):
        quality_flags.append("genetic_reference_unresolved")
    if temporal_gaps:
        quality_flags.append("temporal_gaps_detected")
    if excluded:
        quality_flags.append("input_records_excluded")
    if environmental_sources:
        quality_flags.append("external_environmental_estimates_present")

    return {
        "outcome": "success" if observed_times else "insufficient_data",
        "value": {
            "result_type": "biological.context_assessment",
            "result_version": "1.0.0",
            "subject": {
                "organization_id": scope["organization_id"],
                "subject_type": subject_type,
                "subject_id": subject_id,
                "culture_id": culture_id,
                "plant_culture_id": plant_culture_id,
                "batch_id": None,
                "experimental_unit_id": None,
                "experiment_id": None,
                "genetic_reference_ids": sorted({
                    reference_id
                    for item in biological_contexts
                    for reference_id in [
                        (item.get("genetic_reference") or {}).get("strain_id")
                    ]
                    if isinstance(reference_id, str) and reference_id
                }),
                "biological_contexts": biological_contexts,
            },
            "coverage": {
                "requested_window": {
                    "start": _iso(window_start),
                    "end": _iso(window_end),
                    "timezone": timezone_name,
                },
                "observed_window": observed_window,
                "source_record_count": sum(accepted_by_type.values()),
                "excluded_record_count": len(excluded),
                "record_counts_by_type": dict(sorted(accepted_by_type.items())),
                "missing_context": missing_context,
                "temporal_gaps": temporal_gaps,
            },
            "observed_facts": observed_facts,
            "derived_features": derived_features,
            "findings": [],
            "hypotheses": [],
        },
        "limitations": [
            "This engine reports coverage and descriptive features only; it does not diagnose biological state or recommend interventions.",
            "Provider-derived environmental observations remain distinct from local in-situ measurements.",
            "A biological-subject-to-environment relationship must be verified by the trusted source adapter before environmental observations are included.",
        ],
        "quality_flags": sorted(set(quality_flags)),
        "provenance": {
            "algorithm": "biological-context-features-v2" if engine_identity["engine_version"] == "0.2.0" else "biological-context-features-v1",
            "libraries": [],
            "source_references": sorted(f"{provider}/{dataset}" for provider, dataset in environmental_sources),
        },
    }


def run_biological_context_features(request: Mapping[str, Any]) -> dict[str, Any]:
    """Convenience entrypoint returning the standard validated response envelope."""
    from .runner import EngineSpec, execute_engine

    return execute_engine(
        request,
        EngineSpec(
            engine_id="biological.context.features",
            engine_version=request["engine"]["engine_version"],
            execute=analyze_biological_context_features,
        ),
    )
