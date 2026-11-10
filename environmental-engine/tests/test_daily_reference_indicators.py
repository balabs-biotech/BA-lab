from datetime import date, datetime, timezone
from uuid import uuid4

import pytest

from ba_environmental_engine.climate.daily_reference import (
    calculate_daily_reference_indicators,
)
from ba_environmental_engine.sources.models import NormalizedEnvironmentalObservation


REQUIRED = {
    "air_temperature_mean": (20.0, "degC"),
    "air_temperature_max": (25.0, "degC"),
    "air_temperature_min": (15.0, "degC"),
    "wind_speed_mean": (2.0, "m/s"),
    "solar_radiation_all_sky": (20.0, "MJ/m2"),
    "relative_humidity_mean": (60.0, "%"),
}


def make_observation(variable_code, value, canonical_unit, **changes):
    now = datetime(2026, 6, 21, 12, tzinfo=timezone.utc)
    fields = dict(
        source_observation_id=uuid4(),
        organization_id=uuid4(),
        location_id=uuid4(),
        data_family="weather",
        provider_code="NASA_POWER",
        dataset_code="POWER_DAILY_AGRO",
        source_parameter=variable_code,
        variable_code=variable_code,
        value=value,
        unit=canonical_unit,
        source_value=value,
        source_unit=canonical_unit,
        observed_at=now,
        observed_date=date(2026, 6, 21),
        retrieved_at=now,
        spatial_resolution_m=55_000.0,
        quality_flag=None,
        source_url=None,
        source_time_standard="NASA POWER daily local solar time",
        source_metadata={},
    )
    fields.update(changes)
    return NormalizedEnvironmentalObservation(**fields)


def complete_observations():
    organization_id = uuid4()
    location_id = uuid4()
    rows = []
    for variable, (value, unit) in REQUIRED.items():
        rows.append(
            make_observation(
                variable,
                value,
                unit,
                organization_id=organization_id,
                location_id=location_id,
            )
        )
    return rows


def test_calculates_daily_net_radiation_and_et0_from_normalized_observations():
    result = calculate_daily_reference_indicators(
        complete_observations(),
        latitude_deg=45.0,
        altitude_m=100.0,
    )

    assert result.status == "available"
    assert result.missing_variables == ()
    assert result.net_radiation is not None
    assert result.et0 is not None
    assert result.net_radiation.net_radiation_mj_m2_day == pytest.approx(12.2618, abs=0.002)
    assert result.et0.reference_evapotranspiration_mm_day > 0
    assert len(result.source_observation_ids) == 6
    assert result.formula_profiles == (
        "fao56_daily_net_radiation_v1",
        "fao56_penman_monteith_daily_v1",
    )


def test_returns_insufficient_data_instead_of_imputing_missing_variables():
    rows = [
        row for row in complete_observations()
        if row.variable_code != "relative_humidity_mean"
    ]
    result = calculate_daily_reference_indicators(
        rows,
        latitude_deg=45.0,
        altitude_m=100.0,
    )

    assert result.status == "insufficient_data"
    assert result.net_radiation is None
    assert result.et0 is None
    assert result.missing_variables == ("relative_humidity_mean",)


def test_rejects_duplicate_required_variable_instead_of_choosing_one():
    rows = complete_observations()
    duplicate = rows[0]
    rows.append(
        make_observation(
            duplicate.variable_code,
            duplicate.value + 1,
            duplicate.unit,
            organization_id=duplicate.organization_id,
            location_id=duplicate.location_id,
        )
    )
    with pytest.raises(ValueError, match="duplicate required variable"):
        calculate_daily_reference_indicators(rows, latitude_deg=45.0, altitude_m=100.0)


@pytest.mark.parametrize(
    "changes",
    [
        {"unit": "K"},
        {"provider_code": "OTHER"},
        {"location_id": uuid4()},
        {"observed_date": date(2026, 6, 20)},
        {"data_family": "satellite"},
    ],
)
def test_rejects_mixed_or_noncanonical_daily_sources(changes):
    rows = complete_observations()
    first = rows[0]
    overrides = {
        "organization_id": first.organization_id,
        "location_id": first.location_id,
    }
    overrides.update(changes)
    rows[0] = make_observation(
        first.variable_code,
        first.value,
        first.unit,
        **overrides,
    )
    with pytest.raises(ValueError):
        calculate_daily_reference_indicators(rows, latitude_deg=45.0, altitude_m=100.0)


def test_rejects_timestamp_date_mismatch():
    rows = complete_observations()
    first = rows[0]
    rows[0] = make_observation(
        first.variable_code,
        first.value,
        first.unit,
        organization_id=first.organization_id,
        location_id=first.location_id,
        observed_at=datetime(2026, 6, 20, 12, tzinfo=timezone.utc),
    )
    with pytest.raises(ValueError, match="observed_at date"):
        calculate_daily_reference_indicators(rows, latitude_deg=45.0, altitude_m=100.0)
