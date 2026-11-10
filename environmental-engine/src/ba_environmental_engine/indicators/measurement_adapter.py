"""Strict adapter from Supabase measurement rows to biological evidence."""

from __future__ import annotations

from collections.abc import Mapping
from datetime import datetime
from math import isfinite
from typing import Any

from ba_environmental_engine.indicators.biological_performance import (
    BiologicalMeasurement,
)


_PRIMARY_SUBJECT_LINKS = {
    "culture_id": "culture",
    "plant_culture_id": "plant_culture",
}
_FALLBACK_SUBJECT_LINKS = {
    "sample_id": "sample",
    "experimental_unit_id": "experimental_unit",
}


def _timestamp(value: Any) -> datetime:
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError as exc:
            raise ValueError("measured_at must be a valid ISO-8601 timestamp") from exc
    else:
        raise ValueError("measured_at must be a datetime or ISO-8601 string")
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError("measured_at must include a valid timezone")
    return parsed


def _numeric(value: Any, *, field: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{field} must be numeric")
    numeric = float(value)
    if not isfinite(numeric):
        raise ValueError(f"{field} must be finite")
    return numeric


def measurement_row_to_biological_measurement(
    row: Mapping[str, Any],
    *,
    variable_registry: Mapping[str, str],
) -> BiologicalMeasurement:
    """Map one tenant-scoped measurement row without guessing units or subjects.

    The variable registry maps each variable_code to its canonical unit code.
    Exactly one direct biological subject link must be present. A normalized
    value is preferred only when its unit is exactly canonical; otherwise a
    raw value is accepted only when its raw unit is already canonical.
    """
    variable_code = str(row.get("variable_code") or "").strip()
    if not variable_code:
        raise ValueError("variable_code is required")
    canonical_unit = variable_registry.get(variable_code)
    if not isinstance(canonical_unit, str) or not canonical_unit.strip():
        raise ValueError("variable_code is missing from the variable registry")

    primary_links = [
        (field, row.get(field))
        for field in _PRIMARY_SUBJECT_LINKS
        if row.get(field) is not None
    ]
    if len(primary_links) > 1:
        raise ValueError("measurement cannot reference multiple primary biological subjects")
    if primary_links:
        subject_field, subject_id = primary_links[0]
    else:
        fallback_links = [
            (field, row.get(field))
            for field in _FALLBACK_SUBJECT_LINKS
            if row.get(field) is not None
        ]
        if len(fallback_links) != 1:
            raise ValueError("measurement must resolve to exactly one biological subject")
        subject_field, subject_id = fallback_links[0]

    normalized_value = row.get("normalized_value")
    normalized_unit = row.get("normalized_unit_code")
    if normalized_value is not None and normalized_unit == canonical_unit:
        value = _numeric(normalized_value, field="normalized_value")
        value_source = "normalized"
        source_unit = str(normalized_unit)
    elif row.get("raw_unit_code") == canonical_unit:
        value = _numeric(row.get("raw_value"), field="raw_value")
        value_source = "raw"
        source_unit = str(row.get("raw_unit_code"))
    else:
        raise ValueError("measurement has no numeric value proven to use the canonical unit")

    organization_id = str(row.get("organization_id") or "").strip()
    source_record_id = str(row.get("id") or "").strip()
    if not organization_id or not source_record_id:
        raise ValueError("measurement id and organization_id are required")

    return BiologicalMeasurement(
        source_record_id=source_record_id,
        organization_id=organization_id,
        subject_id=str(subject_id),
        subject_type=(_PRIMARY_SUBJECT_LINKS | _FALLBACK_SUBJECT_LINKS)[subject_field],
        variable_code=variable_code,
        value=value,
        canonical_unit_code=canonical_unit,
        source_unit_code=source_unit,
        value_source=value_source,
        measured_at=_timestamp(row.get("measured_at")),
        quality_state=str(row.get("quality_state") or ""),
        sample_id=str(row["sample_id"]) if row.get("sample_id") is not None else None,
        experimental_unit_id=(
            str(row["experimental_unit_id"])
            if row.get("experimental_unit_id") is not None else None
        ),
        event_id=str(row["event_id"]) if row.get("event_id") is not None else None,
        result_id=str(row["result_id"]) if row.get("result_id") is not None else None,
        method=str(row["method"]) if row.get("method") is not None else None,
        instrument=str(row["instrument"]) if row.get("instrument") is not None else None,
    )
