"""Provider-neutral normalized observation contract and source-row checks."""

from dataclasses import dataclass
from datetime import date, datetime
from typing import Any, Literal
from uuid import UUID


@dataclass(frozen=True, slots=True)
class NormalizedEnvironmentalObservation:
    """Canonical in-memory representation shared by environmental providers.

    Source values and metadata are retained alongside canonical values. The
    object is not a database row and never performs persistence.
    """

    source_observation_id: UUID
    organization_id: UUID
    location_id: UUID
    data_family: Literal["weather", "satellite"]
    provider_code: str
    dataset_code: str
    source_parameter: str
    variable_code: str
    value: float
    unit: str
    source_value: float
    source_unit: str
    observed_at: datetime
    observed_date: date
    retrieved_at: datetime
    spatial_resolution_m: float | None
    quality_flag: str | None
    source_url: str | None
    source_time_standard: str
    source_metadata: dict[str, Any]


@dataclass(frozen=True, slots=True)
class DuplicateSourceKey:
    key: tuple[str, str, str, str, str]
    count: int


def find_duplicate_source_keys(rows: list[dict[str, Any]]) -> list[DuplicateSourceKey]:
    """Report repeated tenant/provider/dataset/variable/time keys.

    Rows are reported, never collapsed or silently discarded.
    """
    counts: dict[tuple[str, str, str, str, str], int] = {}
    for row in rows:
        key = (
            str(row.get("organization_id", "")),
            str(row.get("location_id", "")),
            str(row.get("provider_code", "")),
            str(row.get("dataset_code", "")),
            str(row.get("variable_code", "")) + "|" + str(row.get("observed_at", "")),
        )
        counts[key] = counts.get(key, 0) + 1
    return [
        DuplicateSourceKey(key=key, count=count)
        for key, count in sorted(counts.items())
        if count > 1
    ]
