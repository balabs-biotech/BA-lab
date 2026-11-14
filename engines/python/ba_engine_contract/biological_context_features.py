"""Deterministic biological context features and scoped threshold findings.

Rule-based findings require an exact biological-context match and a versioned
rule-registry dataset manifest. They remain limited evidence, not diagnosis or
intervention recommendations.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime
import hashlib
import json
from math import isfinite
import re
from statistics import fmean
from typing import Any, Mapping

from .validation import validate_request, _stable_sha256 as _contract_stable_sha256


def _timestamp(value: Any, field: str) -> datetime:
    if not isinstance(value, str) or not value:
        raise ValueError(f"{field}_required")
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError(f"{field}_timezone_required")
    return parsed


def _iso(value: datetime) -> str:
    return value.isoformat().replace("+00:00", "Z")




def _stable_sha256(value: Any) -> str:
    """Match the TypeScript stable JSON encoding used by the authenticated resolver."""
    encoded = json.dumps(
        value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


_RULE_ID = re.compile(r"^[a-z][a-z0-9_.-]{1,79}$")
_RULE_VERSION = re.compile(r"^[0-9]+\.[0-9]+\.[0-9]+$")
_RULE_CONTEXT_FIELDS = {
    "organism_kind", "taxon_code", "strain_code", "cultivar_code",
    "culture_stage", "substrate_code", "production_system",
}

_REFERENCE_ASSERTION_SUBJECT_TYPES = {
    "taxon", "strain", "cultivar", "substrate", "culture_stage",
    "production_system", "environmental_parameter", "biological_process",
}
_REFERENCE_ASSERTION_EVIDENCE_LEVELS = {"L0", "L1", "L2", "L3", "L4", "L5", "unassessed"}


def _evaluate_biological_reference_assertions(
    state: Any,
    assertions: Any,
    biological_contexts: list[dict[str, Any]],
    datasets: Any,
) -> tuple[str, list[dict[str, Any]], list[str]]:
    """Validate immutable assertion manifests and assess explicit context_match applicability."""
    if state not in {"documented", "not_documented", "conflicting", "not_applicable"}:
        raise ValueError("invalid_biological_reference_assertion_state")
    if not isinstance(assertions, list) or len(assertions) > 500:
        raise ValueError("invalid_biological_reference_assertions")
    if not isinstance(datasets, list):
        raise ValueError("invalid_biological_reference_assertion_datasets")

    manifests: dict[tuple[str, str], dict[str, Any]] = {}
    for dataset in datasets:
        if not isinstance(dataset, dict) or dataset.get("provider") != "BA_LABS_BIOLOGICAL_REFERENCE_ASSERTION":
            continue
        key = (dataset.get("dataset_id"), dataset.get("dataset_version"))
        if not all(isinstance(value, str) and value for value in key):
            raise ValueError("invalid_biological_reference_assertion_manifest")
        if key in manifests:
            raise ValueError("duplicate_biological_reference_assertion_manifest")
        manifests[key] = dataset

    resolved: list[dict[str, Any]] = []
    sources: set[str] = set()
    seen: set[tuple[str, str]] = set()
    semantic_values: dict[tuple[str, str, str], set[str]] = defaultdict(set)
    for assertion in assertions:
        if not isinstance(assertion, dict):
            raise ValueError("invalid_biological_reference_assertion")
        code = assertion.get("assertion_code")
        version = assertion.get("assertion_version")
        subject_type = assertion.get("subject_type")
        subject_ref = assertion.get("subject_ref")
        predicate = assertion.get("predicate_code")
        digest = assertion.get("content_sha256")
        source = assertion.get("source")
        applicability = assertion.get("applicability")
        uncertainty = assertion.get("uncertainty")
        if (
            not isinstance(code, str) or not _RULE_ID.fullmatch(code)
            or not isinstance(version, str) or not _RULE_VERSION.fullmatch(version)
            or subject_type not in _REFERENCE_ASSERTION_SUBJECT_TYPES
            or not isinstance(subject_ref, str) or not subject_ref
            or not isinstance(predicate, str) or not _RULE_ID.fullmatch(predicate)
            or not isinstance(digest, str) or not re.fullmatch(r"[0-9a-f]{64}", digest)
            or not isinstance(source, dict)
            or not isinstance(applicability, dict) or not isinstance(uncertainty, dict)
            or assertion.get("evidence_level") not in _REFERENCE_ASSERTION_EVIDENCE_LEVELS
            or "object_value" not in assertion
        ):
            raise ValueError("invalid_biological_reference_assertion")
        if assertion.get("unit_code") is not None and not isinstance(assertion.get("unit_code"), str):
            raise ValueError("invalid_biological_reference_assertion_unit")
        if assertion.get("source_locator") is not None and not isinstance(assertion.get("source_locator"), str):
            raise ValueError("invalid_biological_reference_assertion_source_locator")
        if not isinstance(assertion.get("reviewed_at"), str):
            raise ValueError("invalid_biological_reference_assertion_review_timestamp")
        source_id = assertion.get("reference_registry_id")
        if not isinstance(source_id, str) or not re.fullmatch(
            r"[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}", source_id, re.I
        ):
            raise ValueError("invalid_biological_reference_assertion_source_id")
        source_reference_id = source.get("reference_id")
        source_version = source.get("reference_version")
        source_digest = source.get("content_sha256")
        source_reviewed_at = source.get("reviewed_at")
        if (
            not isinstance(source_reference_id, str) or not source_reference_id
            or not isinstance(source_version, str) or not source_version
            or not isinstance(source_digest, str) or not re.fullmatch(r"[0-9a-f]{64}", source_digest)
            or not isinstance(source_reviewed_at, str)
            or (source.get("source_url") is not None and not isinstance(source.get("source_url"), str))
        ):
            raise ValueError("invalid_biological_reference_assertion_source")
        key = (code, version)
        if key in seen:
            raise ValueError("duplicate_biological_reference_assertion_identity")
        seen.add(key)
        manifest = manifests.get(key)
        if not manifest or manifest.get("content_sha256") != digest:
            raise ValueError("biological_reference_assertion_manifest_missing_or_mismatched")

        payload = {
            "assertion_code": code,
            "assertion_version": version,
            "subject_type": subject_type,
            "subject_ref": subject_ref,
            "predicate_code": predicate,
            "object_value": assertion["object_value"],
            "unit_code": assertion.get("unit_code"),
            "reference_registry_id": source_id,
            "source_locator": assertion.get("source_locator"),
            "evidence_level": assertion["evidence_level"],
            "applicability": applicability,
            "uncertainty": uncertainty,
        }
        if _contract_stable_sha256(payload) != digest:
            raise ValueError("biological_reference_assertion_content_hash_mismatch")

        context_match = applicability.get("context_match")
        matching_context_ids: list[str] = []
        applicability_state = "not_assessed"
        if context_match is not None:
            if (
                not isinstance(context_match, dict) or not context_match
                or not set(context_match).issubset(_RULE_CONTEXT_FIELDS)
                or any(not isinstance(value, str) or not value.strip() for value in context_match.values())
            ):
                raise ValueError("invalid_biological_reference_assertion_applicability")
            unknown_contexts = 0
            for context in biological_contexts:
                if not isinstance(context, dict):
                    continue
                known = all(context.get(field) is not None for field in context_match)
                if not known:
                    unknown_contexts += 1
                    continue
                if all(context.get(field) == expected for field, expected in context_match.items()):
                    context_id = context.get("context_id")
                    if isinstance(context_id, str):
                        matching_context_ids.append(context_id)
            if matching_context_ids:
                applicability_state = "matched"
            elif unknown_contexts:
                applicability_state = "undetermined"
            else:
                applicability_state = "not_applicable"

        semantic_values[(subject_type, subject_ref, predicate)].add(
            _contract_stable_sha256(assertion["object_value"])
        )
        resolved_item = {
            **payload,
            "content_sha256": digest,
            "applicability_state": applicability_state,
            "matching_context_ids": sorted(set(matching_context_ids)),
            "source": {
                "reference_id": source_reference_id,
                "reference_version": source_version,
                "content_sha256": source_digest,
                "reviewed_at": source_reviewed_at,
                **({"source_url": source["source_url"]} if isinstance(source.get("source_url"), str) else {}),
            },
            "reviewed_at": assertion["reviewed_at"],
        }
        resolved.append(resolved_item)
        sources.add(f"BA_LABS_BIOLOGICAL_REFERENCE_ASSERTION/{code}@{version}#sha256={digest}")
        sources.add(f"BA_LABS_BIOLOGICAL_REFERENCE_SOURCE/{source_reference_id}@{source_version}#sha256={source_digest}")

    has_conflicts = any(len(values) > 1 for values in semantic_values.values())
    if has_conflicts or state == "conflicting":
        state = "conflicting"
    elif resolved:
        state = "documented"
    elif state == "documented":
        raise ValueError("documented_biological_reference_assertions_require_assertions")
    elif state != "not_applicable":
        state = "not_documented"
    return state, resolved, sorted(sources)



def _evaluate_interpretation_rules(
    rules: Any,
    biological_contexts: list[dict[str, Any]],
    derived_features: list[dict[str, Any]],
    datasets: Any,
    identity_state: str = "not_documented",
    identity_assertions: list[dict[str, Any]] | None = None,
) -> tuple[list[dict[str, Any]], list[str]]:
    """Evaluate explicitly scoped, versioned thresholds without asserting diagnosis."""
    if not isinstance(rules, list) or len(rules) > 100:
        raise ValueError("invalid_interpretation_rules")
    if not isinstance(datasets, list):
        raise ValueError("invalid_interpretation_rule_datasets")

    findings: list[dict[str, Any]] = []
    reference_sources: set[str] = set()
    profile_manifests = [
        dataset for dataset in datasets
        if isinstance(dataset, dict)
        and dataset.get("provider") == "BA_LABS_INTERPRETATION_PROFILE"
    ]
    if rules:
        if len(profile_manifests) != 1:
            raise ValueError("interpretation_profile_manifest_required")
        profile_manifest = profile_manifests[0]
        profile_id = profile_manifest.get("profile_id")
        profile_version = profile_manifest.get("profile_version")
        profile_digest = profile_manifest.get("content_sha256")
        if (
            profile_manifest.get("dataset_id") != "biological.context.features"
            or not isinstance(profile_manifest.get("dataset_version"), str)
            or not _RULE_VERSION.fullmatch(profile_manifest["dataset_version"])
            or not isinstance(profile_id, str)
            or not _RULE_ID.fullmatch(profile_id)
            or not isinstance(profile_version, str)
            or not _RULE_VERSION.fullmatch(profile_version)
            or not isinstance(profile_digest, str)
            or not re.fullmatch(r"[0-9a-f]{64}", profile_digest)
        ):
            raise ValueError("invalid_interpretation_profile_manifest")
        profile_content = {
            "profile_id": profile_id,
            "profile_version": profile_version,
            "rules": rules,
        }
        if _stable_sha256(profile_content) != profile_digest:
            raise ValueError("interpretation_profile_content_hash_mismatch")
        reference_sources.add(
            "BA_LABS_INTERPRETATION_PROFILE/"
            f"{profile_id}@{profile_version}"
            f"#sha256={profile_digest}"
        )
    for rule in rules:
        required = {
            "rule_id", "rule_version", "feature_code", "operator", "threshold",
            "unit_code", "statement", "context_match", "reference_id",
            "reference_version",
        }
        optional = {"identity_match"}
        if not isinstance(rule, dict) or not required.issubset(rule) or not set(rule).issubset(required | optional):
            raise ValueError("invalid_interpretation_rule_shape")

        rule_id = rule["rule_id"]
        rule_version = rule["rule_version"]
        feature_code = rule["feature_code"]
        operator = rule["operator"]
        threshold = rule["threshold"]
        unit_code = rule["unit_code"]
        statement = rule["statement"]
        context_match = rule["context_match"]
        reference_id = rule["reference_id"]
        reference_version = rule["reference_version"]

        if not isinstance(rule_id, str) or not _RULE_ID.fullmatch(rule_id):
            raise ValueError("invalid_interpretation_rule_id")
        if not isinstance(rule_version, str) or not _RULE_VERSION.fullmatch(rule_version):
            raise ValueError("invalid_interpretation_rule_version")
        if not isinstance(feature_code, str) or not _RULE_ID.fullmatch(feature_code):
            raise ValueError("invalid_interpretation_feature_code")
        if not isinstance(operator, str) or operator not in {"gt", "gte", "lt", "lte"}:
            raise ValueError("unsupported_interpretation_operator")
        if isinstance(threshold, bool) or not isinstance(threshold, (int, float)) or not isfinite(threshold):
            raise ValueError("invalid_interpretation_threshold")
        if not isinstance(unit_code, str) or not unit_code:
            raise ValueError("invalid_interpretation_unit")
        if not isinstance(statement, str) or not statement.strip() or len(statement) > 700:
            raise ValueError("invalid_interpretation_statement")
        if (
            not isinstance(reference_id, str) or not reference_id.strip()
            or len(reference_id) > 160
            or not isinstance(reference_version, str) or not reference_version.strip()
            or len(reference_version) > 80
        ):
            raise ValueError("invalid_interpretation_reference")
        if (
            not isinstance(context_match, dict) or not context_match
            or not set(context_match).issubset(_RULE_CONTEXT_FIELDS)
            or any(not isinstance(value, str) or not value.strip() for value in context_match.values())
        ):
            raise ValueError("interpretation_rule_requires_biological_context_scope")
        identity_match = rule.get("identity_match")
        if identity_match is not None and (
            not isinstance(identity_match, dict)
            or set(identity_match) != {"assertion_type", "assertion_value"}
            or not isinstance(identity_match.get("assertion_type"), str)
            or not identity_match["assertion_type"].strip()
            or not isinstance(identity_match.get("assertion_value"), str)
            or not identity_match["assertion_value"].strip()
        ):
            raise ValueError("invalid_interpretation_identity_match")
        reference_manifest = next((
            dataset for dataset in datasets
            if isinstance(dataset, dict)
            and dataset.get("provider") == "BA_LABS_RULE_REGISTRY"
            and dataset.get("dataset_id") == reference_id
            and dataset.get("dataset_version") == reference_version
        ), None)
        if reference_manifest is None:
            raise ValueError("interpretation_rule_reference_not_in_dataset_manifest")

        matching_contexts = [
            context for context in biological_contexts
            if all(context.get(field) == expected for field, expected in context_match.items())
        ]
        if identity_match is not None:
            if identity_state != "documented" or not identity_assertions:
                continue
            # Context and identity constraints must resolve against the same
            # dated biological context. Combining a matching context A with
            # an identity assertion belonging to context B is invalid.
            matching_contexts = [
                context for context in matching_contexts
                if any(
                    assertion.get("assertion_type") == identity_match["assertion_type"]
                    and assertion.get("assertion_value") == identity_match["assertion_value"]
                    and (
                        (
                            assertion.get("subject_type") == "strain"
                            and assertion.get("strain_id") == (context.get("genetic_reference") or {}).get("strain_id")
                        ) or (
                            assertion.get("subject_type") == "organism"
                            and assertion.get("organism_id") == (context.get("genetic_reference") or {}).get("organism_id")
                        )
                    )
                    for assertion in identity_assertions
                )
            ]
        if not matching_contexts:
            continue
        reference_sources.add(f"BA_LABS_RULE_REGISTRY/{reference_id}@{reference_version}#sha256={reference_manifest['content_sha256']}")

        matching_features = [
            feature for feature in derived_features
            if feature["feature_code"] == feature_code and feature["unit_code"] == unit_code
        ]
        if not matching_features:
            continue

        def matches(value: float) -> bool:
            if operator == "gt":
                return value > threshold
            if operator == "gte":
                return value >= threshold
            if operator == "lt":
                return value < threshold
            return value <= threshold

        triggered = [feature for feature in matching_features if matches(feature["value"])]
        if not triggered:
            continue

        supporting_ids = sorted({
            record_id
            for feature in triggered
            for record_id in feature["source_record_ids"]
        })
        observed_values = sorted({feature["value"] for feature in triggered})
        findings.append({
            "finding_code": rule_id,
            "statement": (
                f"{statement} [observed_values={observed_values} {unit_code}; "
                f"threshold={operator} {threshold} {unit_code}; "
                f"rule_version={rule_version}; "
                f"reference={reference_id}@{reference_version}]"
            ),
            "evidence_state": "limited",
            "supporting_record_ids": supporting_ids,
            "contradicting_record_ids": [],
            "derived_feature_codes": [feature_code],
        })

    return findings, sorted(reference_sources)


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
        if observed_at < window_start or observed_at >= window_end:
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
    profile_state = parameters.get("interpretation_profile_state")
    if profile_state == "not_configured":
        missing_context.append("no_active_interpretation_profile")
    elif profile_state == "context_not_stable":
        missing_context.append("biological_context_not_stable_for_full_window")
    elif profile_state == "domain_ambiguous":
        missing_context.append("biological_domain_ambiguous_for_full_window")
    elif parameters.get("interpretation_profile_state") == "context_not_stable":
        missing_context.append("biological_context_not_stable_for_profile")
    elif parameters.get("interpretation_profile_state") == "domain_ambiguous":
        missing_context.append("biological_interpretation_domain_ambiguous")
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

    identity_state = parameters.get("biological_identity_state", "not_documented")
    identity_assertions = parameters.get("biological_identity_assertions", [])
    if identity_state not in {"documented", "not_documented", "conflicting"}:
        raise ValueError("invalid_biological_identity_state")
    if not isinstance(identity_assertions, list) or len(identity_assertions) > 500:
        raise ValueError("invalid_biological_identity_assertions")
    identity_sources: set[str] = set()
    identity_manifests = [
        dataset for dataset in request.get("datasets", [])
        if isinstance(dataset, dict) and dataset.get("provider") == "BA_LABS_BIOLOGICAL_IDENTITY"
    ]
    manifest_keys = {
        (dataset.get("dataset_id"), dataset.get("dataset_version")): dataset
        for dataset in identity_manifests
    }
    for assertion in identity_assertions:
        if not isinstance(assertion, dict):
            raise ValueError("invalid_biological_identity_assertion")
        code = assertion.get("assertion_code")
        version = assertion.get("assertion_version")
        digest = assertion.get("content_sha256")
        if (
            not isinstance(code, str) or not code
            or not isinstance(version, str) or not _RULE_VERSION.fullmatch(version)
            or not isinstance(digest, str) or not re.fullmatch(r"[0-9a-f]{64}", digest)
        ):
            raise ValueError("invalid_biological_identity_assertion")
        manifest = manifest_keys.get((code, version))
        if (
            not manifest
            or not isinstance(manifest.get("content_sha256"), str)
            or not re.fullmatch(r"[0-9a-f]{64}", manifest["content_sha256"])
        ):
            raise ValueError("biological_identity_manifest_missing")
        if _stable_sha256(assertion) != manifest["content_sha256"]:
            raise ValueError("biological_identity_manifest_hash_mismatch")
        source_digest = assertion.get("source_reference_sha256")
        if not isinstance(source_digest, str) or not re.fullmatch(r"[0-9a-f]{64}", source_digest):
            raise ValueError("invalid_biological_identity_source_digest")
        identity_sources.add(
            f"BA_LABS_BIOLOGICAL_IDENTITY/{code}@{version}"
            f"#sha256={manifest['content_sha256']}"
        )
    if identity_state == "documented" and not identity_assertions:
        raise ValueError("documented_biological_identity_requires_assertions")
    if identity_state == "not_documented" and identity_assertions:
        raise ValueError("undocumented_biological_identity_has_assertions")
    if identity_state == "conflicting":
        missing_context.append("biological_identity_assertions_conflict")
    elif identity_state == "not_documented":
        missing_context.append("biological_identity_not_documented")

    reference_assertion_state, reference_assertions, reference_assertion_sources = (
        _evaluate_biological_reference_assertions(
            parameters.get("biological_reference_assertion_state", "not_documented"),
            parameters.get("biological_reference_assertions", []),
            biological_contexts,
            request.get("datasets", []),
        )
    )
    if reference_assertion_state == "conflicting":
        quality_flags_reference = ["biological_reference_assertions_conflict"]
    elif reference_assertions:
        quality_flags_reference = ["biological_reference_assertions_present"]
    else:
        quality_flags_reference = ["biological_reference_assertions_not_documented"]

    interpretation_rules = parameters.get("interpretation_rules", [])
    if interpretation_rules and profile_state != "loaded":
        raise ValueError("interpretation_profile_not_loaded_for_rules")
    findings, interpretation_sources = _evaluate_interpretation_rules(interpretation_rules, biological_contexts, derived_features, request.get("datasets", []), identity_state, identity_assertions)
    if findings:
        quality_flags = ["biological_diagnosis_not_performed", "rule_based_interpretation_performed"]
    elif interpretation_rules:
        quality_flags = ["rule_based_interpretation_evaluated_no_findings"]
    else:
        quality_flags = ["biological_interpretation_not_performed"]
    quality_flags.extend(quality_flags_reference)
    if reference_assertion_state == "conflicting":
        missing_context.append("biological_reference_assertions_conflict")
    if identity_state == "conflicting":
        quality_flags.append("biological_identity_conflict")
    elif identity_state == "documented":
        quality_flags.append("biological_identity_assertions_present")
    if profile_state == "not_configured":
        quality_flags.append("interpretation_profile_not_available")
    elif profile_state == "context_not_stable":
        quality_flags.append("interpretation_profile_not_applied_context_changed")
    elif profile_state == "domain_ambiguous":
        quality_flags.append("interpretation_profile_not_applied_domain_ambiguous")
    elif parameters.get("interpretation_profile_state") == "context_not_stable":
        quality_flags.append("interpretation_profile_context_not_stable")
    elif parameters.get("interpretation_profile_state") == "domain_ambiguous":
        quality_flags.append("interpretation_profile_domain_ambiguous")
    if environment_link_state == "ambiguous":
        quality_flags.append("environment_context_ambiguous")
    if environment_link_state == "conflict" or "conflict" in measurement_environment_states:
        quality_flags.append("environment_context_conflict")
    if "ambiguous" in measurement_environment_states:
        quality_flags.append("measurement_environment_context_ambiguous")
    if "missing" in measurement_environment_states:
        quality_flags.append("measurement_environment_context_missing")
    upstream_qc = (request.get("upstream_artifacts") or [None])[0]
    environmental_quality_control = None
    if upstream_qc is not None:
        qc_result = upstream_qc["result"]
        qc_flags = sorted(set(qc_result["quality_flags"]))
        qc_review_required = qc_result["outcome"] != "success" or bool(qc_flags)
        environmental_quality_control = {
            "state": "review_required" if qc_review_required else "passed",
            "upstream_execution_id": upstream_qc["execution_id"],
            "upstream_result_id": upstream_qc["result_id"],
            "artifact_sha256": upstream_qc["artifact_sha256"],
            "outcome": qc_result["outcome"],
            "quality_flags": qc_flags,
            "limitations": qc_result["limitations"],
            "provenance": qc_result["provenance"],
            "value": qc_result["value"],
        }
        quality_flags.append("environmental_qc_artifact_attached")
        if qc_review_required:
            quality_flags.append("environmental_qc_review_required")

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

    profile_sources = {
        f"BA_LABS_INTERPRETATION_PROFILE/{dataset['dataset_id']}@{dataset.get('dataset_version', '')}#sha256={dataset['content_sha256']}"
        for dataset in request.get("datasets", [])
        if isinstance(dataset, dict) and dataset.get("provider") == "BA_LABS_INTERPRETATION_PROFILE"
    }

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
                "identity_assertion_state": identity_state,
                "identity_assertions": identity_assertions,
                "biological_reference_assertion_state": reference_assertion_state,
                "biological_reference_assertions": reference_assertions,
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
            "findings": findings,
            "hypotheses": [],
            **({"environmental_quality_control": environmental_quality_control}
               if environmental_quality_control is not None else {}),
        },
        "limitations": [
            "This engine reports traceable coverage and descriptive features; optional rules produce limited threshold findings only, not biological diagnoses or intervention recommendations.",
            "Provider-derived environmental observations remain distinct from local in-situ measurements.",
            "A biological-subject-to-environment relationship must be verified by the trusted source adapter before environmental observations are included.",
            "Validated biological reference assertions are contextual evidence; applicability is evaluated only when an explicit exact context_match is supplied, and assertions do not independently trigger threshold findings.",
            "Conflicting biological reference assertions are surfaced for review and are never resolved by choosing one claim automatically.",
        ],
        "quality_flags": sorted(set(quality_flags)),
        "provenance": {
            "algorithm": "biological-context-features-v2" if engine_identity["engine_version"] == "0.2.0" else "biological-context-features-v1",
            "libraries": [],
            "source_references": sorted({
                *(f"{provider}/{dataset}" for provider, dataset in environmental_sources),
                *interpretation_sources, *profile_sources, *identity_sources, *reference_assertion_sources,
                *([f"BA_LABS_ENGINE_RESULT/environmental.timeseries.qc@0.2.0#execution={upstream_qc['execution_id']}#result={upstream_qc['result_id']}#sha256={upstream_qc['artifact_sha256']}"] if upstream_qc is not None else []),
            }),
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
