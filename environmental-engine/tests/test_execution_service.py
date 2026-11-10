from dataclasses import replace
from datetime import date, datetime, timedelta, timezone
from uuid import uuid4

import pytest

from ba_environmental_engine.execution import run_environmental_analysis
from ba_environmental_engine.sources.models import NormalizedEnvironmentalObservation


VALUES = {
    "air_temperature_mean": (20.0, "degC"),
    "air_temperature_max": (25.0, "degC"),
    "air_temperature_min": (15.0, "degC"),
    "wind_speed_mean": (2.0, "m/s"),
    "solar_radiation_all_sky": (20.0, "MJ/m2"),
    "relative_humidity_mean": (60.0, "%"),
}


def observations_for_days(count=1):
    organization_id = uuid4()
    location_id = uuid4()
    start = date(2026, 10, 25)
    rows = []
    for offset in range(count):
        observed_date = start + timedelta(days=offset)
        observed_at = datetime(
            observed_date.year, observed_date.month, observed_date.day, 12,
            tzinfo=timezone.utc,
        )
        for variable, (value, unit) in VALUES.items():
            rows.append(
                NormalizedEnvironmentalObservation(
                    source_observation_id=uuid4(),
                    organization_id=organization_id,
                    location_id=location_id,
                    data_family="weather",
                    provider_code="NASA_POWER",
                    dataset_code="POWER_DAILY_AGRO",
                    source_parameter=variable,
                    variable_code=variable,
                    value=value + offset if variable == "air_temperature_mean" else value,
                    unit=unit,
                    source_value=value,
                    source_unit=unit,
                    observed_at=observed_at,
                    observed_date=observed_date,
                    retrieved_at=observed_at + timedelta(hours=2),
                    spatial_resolution_m=55_000.0,
                    quality_flag=None,
                    source_url="https://power.larc.nasa.gov/",
                    source_time_standard="NASA POWER daily local solar time",
                    source_metadata={},
                )
            )
    return rows


def run(rows, *, rolling_methods=None):
    return run_environmental_analysis(
        observations=rows,
        analysis_id=uuid4(),
        generated_at=datetime(2026, 11, 2, tzinfo=timezone.utc),
        engine_version="0.1.0",
        scope_from=min(row.observed_date for row in rows),
        scope_to=max(row.observed_date for row in rows),
        latitude_deg=36.19,
        altitude_m=1000.0,
        rolling_methods=rolling_methods,
        rolling_windows=(7,),
    )


def test_execution_service_runs_daily_fao56_and_returns_bal_json():
    result = run(observations_for_days())

    assert result.contract_version == "1.0.0"
    assert len(result.indicators) == 2
    assert {item.code for item in result.indicators} == {
        "net_radiation_fao56_daily",
        "reference_et0_fao56_daily",
    }
    assert all(item.status == "available" for item in result.indicators)
    assert result.scope.location_id is not None


def test_execution_service_runs_explicit_rolling_policy_and_preserves_lineage():
    rows = observations_for_days(7)
    result = run(rows, rolling_methods={"air_temperature_mean": "mean"})

    rolling = next(item for item in result.indicators if item.code == "air_temperature_mean_7d")
    assert rolling.value == pytest.approx(23.0)
    assert rolling.coverage.expected == 7
    assert rolling.coverage.observed == 7
    assert len(rolling.inputs[0].source_observation_ids) == 7


def test_execution_service_rejects_duplicate_daily_values_for_rolling_variable():
    rows = observations_for_days(7)
    duplicate = rows[0]
    rows.append(duplicate)

    with pytest.raises(ValueError, match="at most one observation per variable and date"):
        run(rows, rolling_methods={"air_temperature_mean": "mean"})


def test_execution_service_rejects_observations_outside_requested_scope():
    rows = observations_for_days()
    with pytest.raises(ValueError, match="contained within the requested scope"):
        run_environmental_analysis(
            observations=rows,
            analysis_id=uuid4(),
            generated_at=datetime(2026, 11, 2, tzinfo=timezone.utc),
            engine_version="0.1.0",
            scope_from=date(2026, 10, 26),
            scope_to=date(2026, 10, 26),
            latitude_deg=36.19,
            altitude_m=1000.0,
        )


def test_execution_service_requires_weather_observations():
    rows = observations_for_days()
    satellite_rows = [replace(row, data_family="satellite") for row in rows]

    with pytest.raises(ValueError, match="at least one weather observation"):
        run(satellite_rows)


def test_execution_service_rejects_rolling_window_larger_than_scope():
    rows = observations_for_days()
    with pytest.raises(ValueError, match="full length of every rolling window"):
        run(rows, rolling_methods={"air_temperature_mean": "mean"})
