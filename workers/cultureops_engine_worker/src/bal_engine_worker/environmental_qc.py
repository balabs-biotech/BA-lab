"""Deterministic quality checks for normalized environmental observations.

This engine validates supplied metadata and explicit caller-provided rules. It
does not infer agronomic thresholds, convert units, interpolate missing data,
or make biological recommendations.
"""
from __future__ import annotations

from datetime import datetime, timezone
import math
from typing import Any, Mapping

from .registry import EngineExecutionContext, EngineResult

_REQUIRED_FIELDS = (
    "variable_code",
    "value",
    "unit_code",
    "observed_at",
    "provider_code",
    "dataset_code",
)


def _finite_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _parse_timestamp(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        return None
    return parsed.astimezone(timezone.utc)


def _normalize_rules(raw_rules: Any) -> dict[str, dict[str, Any]]:
    if raw_rules is None:
        return {}
    if not isinstance(raw_rules, Mapping):
        raise ValueError("rules must be an object keyed by variable_code")
    normalized: dict[str, dict[str, Any]] = {}
    for code, raw_rule in raw_rules.items():
        if not isinstance(code, str) or not code.strip() or not isinstance(raw_rule, Mapping):
            raise ValueError("each rule must map a non-empty variable code to an object")
        unknown = set(raw_rule) - {"min", "max", "expected_unit"}
        if unknown:
            raise ValueError(f"unsupported rule fields for {code}: {', '.join(sorted(unknown))}")
        rule = dict(raw_rule)
        for bound in ("min", "max"):
            if bound in rule and not _finite_number(rule[bound]):
                raise ValueError(f"{code}.{bound} must be a finite number")
        if "min" in rule and "max" in rule and rule["min"] > rule["max"]:
            raise ValueError(f"{code} minimum cannot exceed maximum")
        if "expected_unit" in rule and (
            not isinstance(rule["expected_unit"], str) or not rule["expected_unit"].strip()
        ):
            raise ValueError(f"{code}.expected_unit must be a non-empty string")
        normalized[code.strip()] = rule
    return normalized


class EnvironmentalQualityEngine:
    engine_code = "environmental.qc"
    engine_version = "1.0.0"

    def execute(
        self,
        context: EngineExecutionContext,
        payload: Mapping[str, Any],
    ) -> EngineResult:
        raw_observations = payload.get("observations")
        if not isinstance(raw_observations, list) or not raw_observations:
            raise ValueError("payload.observations must be a non-empty array")
        rules = _normalize_rules(payload.get("rules"))

        seen: set[tuple[str, str]] = set()
        results: list[dict[str, Any]] = []
        provider_counts: dict[str, int] = {}
        dataset_counts: dict[str, int] = {}

        for index, raw in enumerate(raw_observations):
            if not isinstance(raw, Mapping):
                results.append({
                    "index": index,
                    "qc_status": "invalid",
                    "qc_flags": ["observation_must_be_object"],
                })
                continue

            observation = dict(raw)
            flags: list[str] = []
            for field in _REQUIRED_FIELDS:
                if field not in observation or observation[field] is None:
                    flags.append(f"missing_{field}")

            code = observation.get("variable_code")
            if not isinstance(code, str) or not code.strip():
                if "missing_variable_code" not in flags:
                    flags.append("invalid_variable_code")
                code = ""

            value = observation.get("value")
            if "value" not in observation or value is None:
                pass
            elif not _finite_number(value):
                flags.append("value_must_be_finite_number")
                # Keep persisted output strict JSON; preserve bad input as a diagnostic.
                observation["value_diagnostic"] = str(value)[:80]
                observation["value"] = None

            unit = observation.get("unit_code")
            if unit is not None and (not isinstance(unit, str) or not unit.strip()):
                flags.append("invalid_unit_code")

            provider = observation.get("provider_code")
            dataset = observation.get("dataset_code")
            if isinstance(provider, str) and provider.strip():
                provider_counts[provider] = provider_counts.get(provider, 0) + 1
            if isinstance(dataset, str) and dataset.strip():
                dataset_counts[dataset] = dataset_counts.get(dataset, 0) + 1

            timestamp = _parse_timestamp(observation.get("observed_at"))
            if observation.get("observed_at") is not None and timestamp is None:
                flags.append("observed_at_must_be_timezone_aware_iso8601")

            if timestamp is not None and code:
                duplicate_key = (code, timestamp.isoformat())
                if duplicate_key in seen:
                    flags.append("duplicate_variable_timestamp")
                else:
                    seen.add(duplicate_key)

            if "spatial_resolution_m" in observation:
                resolution = observation["spatial_resolution_m"]
                if resolution is not None and (
                    not _finite_number(resolution) or resolution < 0
                ):
                    flags.append("invalid_spatial_resolution_m")
                    observation["spatial_resolution_diagnostic"] = str(resolution)[:80]
                    observation["spatial_resolution_m"] = None

            rule = rules.get(code, {})
            if rule.get("expected_unit") and unit != rule["expected_unit"]:
                flags.append("unit_mismatch")
            if _finite_number(value):
                if "min" in rule and value < rule["min"]:
                    flags.append("below_configured_minimum")
                if "max" in rule and value > rule["max"]:
                    flags.append("above_configured_maximum")

            invalid_flags = {
                "missing_variable_code",
                "invalid_variable_code",
                "missing_value",
                "value_must_be_finite_number",
                "missing_unit_code",
                "invalid_unit_code",
                "missing_observed_at",
                "observed_at_must_be_timezone_aware_iso8601",
                "missing_provider_code",
                "missing_dataset_code",
                "unit_mismatch",
                "below_configured_minimum",
                "above_configured_maximum",
                "invalid_spatial_resolution_m",
            }
            status = "invalid" if invalid_flags.intersection(flags) else (
                "warning" if flags else "valid"
            )
            results.append({
                "index": index,
                "observation": observation,
                "qc_status": status,
                "qc_flags": flags,
            })

        counts = {
            state: sum(1 for item in results if item["qc_status"] == state)
            for state in ("valid", "warning", "invalid")
        }
        data = {
            "engine": {"code": self.engine_code, "version": self.engine_version},
            "quality_summary": {
                "total": len(results),
                **counts,
                "pass_rate": round(counts["valid"] / len(results), 4),
            },
            "observations": results,
            "source_inventory": {
                "providers": provider_counts,
                "datasets": dataset_counts,
            },
            "limitations": [
                "No unit conversion was performed.",
                "No agronomic or biological thresholds were inferred.",
                "Configured range checks are only as valid as the supplied rules.",
                "A valid QC result is not a biological diagnosis.",
            ],
        }
        summary = (
            f"QC completed: {counts['valid']} valid, "
            f"{counts['warning']} warning, {counts['invalid']} invalid "
            f"of {len(results)} observations."
        )
        provenance = {
            "engine_code": self.engine_code,
            "engine_version": self.engine_version,
            "job_id": context.job_id,
            "organization_id": context.organization_id,
            "attempt_number": context.attempt_number,
            "rule_variable_count": len(rules),
            "unit_conversion": False,
        }
        return EngineResult(status="succeeded", data=data, summary=summary, provenance=provenance)
