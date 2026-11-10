from datetime import date, datetime, timedelta, timezone
from uuid import uuid4

from ba_environmental_engine.execution import run_environmental_analysis
from ba_environmental_engine.interpretation import interpret_findings
from ba_environmental_engine.interpretation.models import (
    DomainProfile,
    InterpretationRule,
)
from ba_environmental_engine.sources.models import NormalizedEnvironmentalObservation


def make_analysis():
    organization_id, location_id = uuid4(), uuid4()
    rows = []
    start = date(2026, 10, 25)
    for offset in range(8):
        day = start + timedelta(days=offset)
        observed_at = datetime(day.year, day.month, day.day, 12, tzinfo=timezone.utc)
        for variable, value, unit in (
            ("air_temperature_mean", 80.0 if offset == 7 else 20.0, "degC"),
            ("air_temperature_max", 25.0, "degC"),
            ("air_temperature_min", 15.0, "degC"),
            ("wind_speed_mean", 2.0, "m/s"),
            ("solar_radiation_all_sky", 20.0, "MJ/m2"),
            ("relative_humidity_mean", 60.0, "%"),
        ):
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
                    observed_at=observed_at,
                    observed_date=day,
                    retrieved_at=observed_at + timedelta(hours=2),
                    spatial_resolution_m=55000.0,
                    quality_flag=None,
                    source_url="https://power.larc.nasa.gov/",
                    source_time_standard="NASA POWER daily local solar time",
                    source_metadata={},
                )
            )
    return run_environmental_analysis(
        observations=rows,
        analysis_id=uuid4(),
        generated_at=datetime(2026, 11, 3, tzinfo=timezone.utc),
        engine_version="0.1.0",
        scope_from=start,
        scope_to=start + timedelta(days=7),
        latitude_deg=36.19,
        altitude_m=1000.0,
        temporal_variables=("air_temperature_mean",),
        temporal_window=7,
        temporal_minimum_history=7,
        temporal_minimum_coverage=1.0,
    )


def test_domain_profile_routes_only_explicitly_configured_findings():
    analysis = make_analysis()
    profile = DomainProfile(
        profile_id="mycology-fruiting-v1",
        module="mycology",
        version="1.0.0",
        rules=(
            InterpretationRule(
                rule_id="temperature-review",
                variable_code="air_temperature_mean",
                finding_status="suspect",
                required_context_tags=frozenset({"stage:fruiting"}),
                signal_code="environmental_review",
                severity="high",
                message_code="temperature_deviation_review",
            ),
        ),
    )

    result = interpret_findings(
        analysis,
        profile,
        context_tags=frozenset({"stage:fruiting"}),
    )

    assert result.module == "mycology"
    assert result.evaluated_findings == 8
    assert result.matched_findings == 1
    signal = result.signals[0]
    assert signal.finding_status == "suspect"
    assert signal.variable_code == "air_temperature_mean"
    assert signal.source_analysis_id == analysis.analysis_id
    assert len(signal.source_observation_ids) == 1
    assert signal.recommendation_code is None


def test_domain_profile_requires_context_and_does_not_invent_recommendations():
    analysis = make_analysis()
    profile = DomainProfile(
        profile_id="greentech-context-v1",
        module="greentech",
        version="1.0.0",
        rules=(
            InterpretationRule(
                rule_id="heat-review",
                variable_code="air_temperature_mean",
                finding_status="suspect",
                required_context_tags=frozenset({"crop:tomato", "stage:fruiting"}),
                signal_code="review",
                severity="moderate",
                message_code="review_environmental_deviation",
            ),
        ),
    )

    result = interpret_findings(analysis, profile, context_tags=frozenset({"crop:tomato"}))

    assert result.signals == ()
    assert result.matched_findings == 0


def test_domain_profile_ids_are_stable_for_same_inputs():
    analysis = make_analysis()
    profile = DomainProfile(
        profile_id="lab-v1",
        module="lab",
        version="1.0.0",
        rules=(
            InterpretationRule(
                rule_id="temperature-alert",
                variable_code="air_temperature_mean",
                finding_status="suspect",
                signal_code="review",
                severity="high",
                message_code="review_temperature",
            ),
        ),
    )

    first = interpret_findings(analysis, profile)
    second = interpret_findings(analysis, profile)

    assert first.signals[0].signal_id == second.signals[0].signal_id
