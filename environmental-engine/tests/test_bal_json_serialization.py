from dataclasses import replace
from datetime import date, datetime, timezone
from uuid import uuid4

import pytest

from ba_environmental_engine.climate.aggregation import DailyAggregation
from ba_environmental_engine.climate.daily_reference import DailyReferenceIndicators
from ba_environmental_engine.climate.windows import ClimateWindowIndicator
from ba_environmental_engine.quality.coverage import DailyCoverage
from ba_environmental_engine.sources.models import NormalizedEnvironmentalObservation
from ba_environmental_engine.serialization.bal_json import build_bal_analysis


VARIABLES = {
    "air_temperature_mean": ("degC", 20.0),
    "air_temperature_max": ("degC", 25.0),
    "air_temperature_min": ("degC", 15.0),
    "wind_speed_mean": ("m/s", 2.0),
    "solar_radiation_all_sky": ("MJ/m2", 18.0),
    "relative_humidity_mean": ("%", 60.0),
}


def observations_for(day=date(2026, 11, 1), variables=None):
    organization_id, location_id = uuid4(), uuid4()
    selected = VARIABLES if variables is None else variables
    rows = []
    for variable, (unit, value) in selected.items():
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
                value=value,
                unit=unit,
                source_value=value,
                source_unit=unit,
                observed_at=datetime(day.year, day.month, day.day, tzinfo=timezone.utc),
                observed_date=day,
                retrieved_at=datetime(2026, 11, 2, tzinfo=timezone.utc),
                spatial_resolution_m=55000.0,
                quality_flag=None,
                source_url="https://power.larc.nasa.gov/",
                source_time_standard="NASA POWER daily local solar time",
                source_metadata={"private_note": "must not leak"},
            )
        )
    return rows


def daily_result(rows, status="available"):
    first = rows[0]
    return DailyReferenceIndicators(
        observed_date=first.observed_date,
        organization_id=first.organization_id,
        location_id=first.location_id,
        latitude_deg=36.19,
        altitude_m=1000.0,
        status=status,
        source_observation_ids=tuple(row.source_observation_id for row in rows),
        source_variable_codes=tuple(row.variable_code for row in rows),
        missing_variables=tuple(
            code for code in VARIABLES if code not in {row.variable_code for row in rows}
        ),
        net_radiation=None,
        et0=None,
        formula_profiles=("fao56_daily_net_radiation_v1", "fao56_penman_monteith_daily_v1")
        if status == "available" else (),
        diagnostics=("cloudiness_ratio_clamped_low",) if status == "available" else
        ("missing_required_daily_weather_inputs",),
    )


def test_daily_result_serializes_with_exact_source_lineage_and_gridded_quality():
    rows = observations_for()
    base = daily_result(rows)
    # Supply calculation-result values without re-running the scientific formulas.
    from types import SimpleNamespace
    result = DailyReferenceIndicators(
        observed_date=base.observed_date,
        organization_id=base.organization_id,
        location_id=base.location_id,
        latitude_deg=base.latitude_deg,
        altitude_m=base.altitude_m,
        status="available",
        source_observation_ids=base.source_observation_ids,
        source_variable_codes=base.source_variable_codes,
        missing_variables=(),
        net_radiation=SimpleNamespace(
            net_radiation_mj_m2_day=12.5,
            formula_profile="fao56_daily_net_radiation_v1",
            diagnostics=("cloudiness_ratio_clamped_low",),
        ),
        et0=SimpleNamespace(
            reference_evapotranspiration_mm_day=3.2,
            formula_profile="fao56_penman_monteith_daily_v1",
            diagnostics=(),
        ),
        formula_profiles=("fao56_daily_net_radiation_v1", "fao56_penman_monteith_daily_v1"),
        diagnostics=("cloudiness_ratio_clamped_low",),
    )
    analysis = build_bal_analysis(
        observations=rows,
        daily_indicators=[result],
        analysis_id=uuid4(),
        generated_at=datetime(2026, 11, 2, tzinfo=timezone.utc),
        engine_version="0.1.0",
        scope_from=date(2026, 11, 1),
        scope_to=date(2026, 11, 1),
    )
    assert [item.code for item in analysis.indicators] == [
        "net_radiation_fao56_daily",
        "reference_et0_fao56_daily",
    ]
    assert analysis.indicators[0].value == 12.5
    assert analysis.indicators[1].unit == "mm/day"
    inputs = analysis.indicators[0].inputs
    assert {str(item.source_observation_ids[0]) for item in inputs} == {
        str(row.source_observation_id) for row in rows
    }
    assert analysis.source_summary[0].quality_class == "gridded_estimate"
    assert "cloudiness_ratio_clamped_low" in analysis.indicators[0].quality.flags
    assert "private_note" not in analysis.model_dump_json()


def test_incomplete_daily_result_serializes_null_and_missing_variable_warning():
    rows = observations_for(variables={
        key: value for key, value in VARIABLES.items() if key != "wind_speed_mean"
    })
    result = daily_result(rows, status="insufficient_data")
    analysis = build_bal_analysis(
        observations=rows,
        daily_indicators=[result],
        analysis_id=uuid4(),
        generated_at=datetime(2026, 11, 2, tzinfo=timezone.utc),
        engine_version="0.1.0",
        scope_from=date(2026, 11, 1),
        scope_to=date(2026, 11, 1),
    )
    et0 = next(item for item in analysis.indicators if item.code == "reference_et0_fao56_daily")
    assert et0.value is None
    assert et0.status == "insufficient_data"
    assert et0.coverage.expected == 6
    assert et0.coverage.observed == 5
    assert any("wind_speed_mean" in warning for warning in analysis.warnings)


def test_mixed_tenant_observations_are_rejected():
    rows = observations_for()
    other = observations_for()[0]
    rows.append(other)
    result = daily_result(rows[:6])
    with pytest.raises(ValueError, match="same organization and location"):
        build_bal_analysis(
            observations=rows,
            daily_indicators=[result],
            analysis_id=uuid4(),
            generated_at=datetime(2026, 11, 2, tzinfo=timezone.utc),
            engine_version="0.1.0",
            scope_from=date(2026, 11, 1),
            scope_to=date(2026, 11, 1),
        )


def test_rolling_indicator_preserves_coverage_and_does_not_invent_lineage():
    rows = observations_for()
    temperature_row = next(
        row for row in rows if row.variable_code == "air_temperature_mean"
    )
    for day in (
        date(2026, 10, 26), date(2026, 10, 27), date(2026, 10, 28),
        date(2026, 10, 29), date(2026, 10, 31),
    ):
        rows.append(
            replace(
                temperature_row,
                source_observation_id=uuid4(),
                observed_at=datetime(day.year, day.month, day.day, tzinfo=timezone.utc),
                observed_date=day,
            )
        )
    coverage = DailyCoverage(
        start=date(2026, 10, 26),
        end=date(2026, 11, 1),
        expected=7,
        observed=6,
        ratio=6 / 7,
        available=False,
        missing_dates=[date(2026, 10, 30)],
    )
    rolling = ClimateWindowIndicator(
        variable_code="air_temperature_mean",
        window_days=7,
        period_start=date(2026, 10, 26),
        period_end=date(2026, 11, 1),
        aggregation=DailyAggregation(
            value=None, unit="degC", status="insufficient_data",
            method="mean", coverage=coverage,
        ),
    )
    analysis = build_bal_analysis(
        observations=rows,
        rolling_indicators=[rolling],
        analysis_id=uuid4(),
        generated_at=datetime(2026, 11, 2, tzinfo=timezone.utc),
        engine_version="0.1.0",
        scope_from=date(2026, 10, 26),
        scope_to=date(2026, 11, 1),
    )
    item = analysis.indicators[0]
    assert item.status == "insufficient_data"
    assert item.value is None
    assert item.coverage.observed == 6
    assert item.inputs[0].source_observation_ids == [
        row.source_observation_id for row in rows
        if row.variable_code == "air_temperature_mean"
    ]


def test_observations_outside_analysis_scope_are_rejected():
    rows = observations_for(day=date(2026, 10, 31))
    with pytest.raises(ValueError, match="contained within analysis scope"):
        build_bal_analysis(
            observations=rows,
            analysis_id=uuid4(),
            generated_at=datetime(2026, 11, 2, tzinfo=timezone.utc),
            engine_version="0.1.0",
            scope_from=date(2026, 11, 1),
            scope_to=date(2026, 11, 1),
        )


def test_duplicate_source_observation_ids_are_rejected():
    rows = observations_for()
    rows.append(rows[0])
    with pytest.raises(ValueError, match="duplicate source observation IDs"):
        build_bal_analysis(
            observations=rows,
            analysis_id=uuid4(),
            generated_at=datetime(2026, 11, 2, tzinfo=timezone.utc),
            engine_version="0.1.0",
            scope_from=date(2026, 11, 1),
            scope_to=date(2026, 11, 1),
        )


def test_rolling_result_rejects_coverage_for_a_different_window():
    rows = observations_for()
    coverage = DailyCoverage(
        start=date(2026, 10, 25),
        end=date(2026, 11, 1),
        expected=8,
        observed=6,
        ratio=6 / 8,
        available=False,
        missing_dates=[date(2026, 10, 25), date(2026, 10, 30)],
    )
    rolling = ClimateWindowIndicator(
        variable_code="air_temperature_mean",
        window_days=7,
        period_start=date(2026, 10, 26),
        period_end=date(2026, 11, 1),
        aggregation=DailyAggregation(
            value=None, unit="degC", status="insufficient_data",
            method="mean", coverage=coverage,
        ),
    )
    with pytest.raises(ValueError, match="coverage must match its declared period"):
        build_bal_analysis(
            observations=rows,
            rolling_indicators=[rolling],
            analysis_id=uuid4(),
            generated_at=datetime(2026, 11, 2, tzinfo=timezone.utc),
            engine_version="0.1.0",
            scope_from=date(2026, 10, 26),
            scope_to=date(2026, 11, 1),
        )


def test_empty_analysis_is_rejected():
    rows = observations_for()
    with pytest.raises(ValueError, match="at least one daily or rolling indicator"):
        build_bal_analysis(
            observations=rows,
            analysis_id=uuid4(),
            generated_at=datetime(2026, 11, 2, tzinfo=timezone.utc),
            engine_version="0.1.0",
            scope_from=date(2026, 11, 1),
            scope_to=date(2026, 11, 1),
        )
