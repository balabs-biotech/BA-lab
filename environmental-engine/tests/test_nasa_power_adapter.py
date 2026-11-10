from datetime import datetime, timezone
from uuid import UUID

import pytest

from ba_environmental_engine.sources.nasa_power import (
    normalize_nasa_power_observation,
)


def source_row(**overrides):
    row = {
        "id": "f08a9c31-7fd8-4e6c-9b84-2e99d0f1a001",
        "organization_id": "a08a9c31-7fd8-4e6c-9b84-2e99d0f1a002",
        "location_id": "b08a9c31-7fd8-4e6c-9b84-2e99d0f1a003",
        "provider_code": "NASA_POWER",
        "dataset_code": "POWER_DAILY_AGRO",
        "variable_code": "precipitation_corrected",
        "value": 12.5,
        "unit_code": "mm/day",
        "observed_at": "2026-10-19T12:00:00+00:00",
        "retrieved_at": "2026-10-20T04:30:00+00:00",
        "quality_flag": "gridded_estimate",
        "source_url": "https://power.larc.nasa.gov/api/temporal/daily/point",
        "metadata": {
            "source_parameter": "PRECTOTCORR",
            "source_date": "2026-10-19",
            "source_time_standard": "NASA POWER daily local solar time",
        },
    }
    row.update(overrides)
    return row


def test_normalizes_nasa_daily_precipitation_and_preserves_source_provenance():
    result = normalize_nasa_power_observation(source_row())

    assert result.variable_code == "precipitation_corrected"
    assert result.value == pytest.approx(12.5)
    assert result.unit == "mm"
    assert result.source_unit == "mm/day"
    assert result.source_parameter == "PRECTOTCORR"
    assert result.source_observation_id == UUID("f08a9c31-7fd8-4e6c-9b84-2e99d0f1a001")
    assert result.observed_date.isoformat() == "2026-10-19"
    assert result.quality_flag == "gridded_estimate"


def test_normalizes_daily_solar_radiation_to_mj_per_square_metre():
    row = source_row(
        variable_code="solar_radiation_all_sky",
        value=5.0,
        unit_code="kWh/m2/day",
        metadata={
            "source_parameter": "ALLSKY_SFC_SW_DWN",
            "source_date": "2026-10-19",
            "source_time_standard": "NASA POWER daily local solar time",
        },
    )
    result = normalize_nasa_power_observation(row)

    assert result.value == pytest.approx(18.0)
    assert result.unit == "MJ/m2"
    assert result.source_unit == "kWh/m2/day"


@pytest.mark.parametrize(
    "changes",
    [
        {"metadata": {}},
        {"unit_code": None},
        {"provider_code": "OTHER"},
        {"dataset_code": "OTHER"},
        {"observed_at": "2026-10-19T12:00:00"},
        {"variable_code": "air_temperature_mean"},
    ],
)
def test_rejects_rows_that_do_not_match_the_versioned_provider_contract(changes):
    with pytest.raises(ValueError):
        normalize_nasa_power_observation(source_row(**changes))


def test_rejects_duplicate_source_keys_without_silently_collapsing_rows():
    from ba_environmental_engine.sources.nasa_power import find_duplicate_source_keys

    row = source_row()
    duplicates = find_duplicate_source_keys([row, row])

    assert len(duplicates) == 1
    assert duplicates[0].count == 2


def test_normalized_observation_retains_provider_independent_context():
    row = source_row(
        data_family="weather",
        spatial_resolution_m=55_000,
        metadata={
            "source_parameter": "PRECTOTCORR",
            "source_date": "2026-10-19",
            "source_time_standard": "NASA POWER daily local solar time",
            "coordinate_source": "user_confirmed",
            "coordinate_accuracy_m": 25,
        },
    )

    result = normalize_nasa_power_observation(row)

    assert result.data_family == "weather"
    assert result.spatial_resolution_m == 55_000
    assert result.source_metadata["coordinate_source"] == "user_confirmed"
    assert result.source_metadata["coordinate_accuracy_m"] == 25


@pytest.mark.parametrize(
    "changes",
    [
        {"data_family": "satellite"},
        {"data_family": "unknown"},
        {"spatial_resolution_m": 0},
        {"spatial_resolution_m": -1},
        {"spatial_resolution_m": float("inf")},
    ],
)
def test_rejects_invalid_nasa_source_context(changes):
    with pytest.raises(ValueError):
        normalize_nasa_power_observation(source_row(**changes))
