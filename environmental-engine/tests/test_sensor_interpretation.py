from datetime import datetime, timezone, date
from uuid import uuid4

from ba_environmental_engine.interpretation import interpret_sensor_analysis
from ba_environmental_engine.interpretation.models import DomainProfile, InterpretationRule
from ba_environmental_engine.sources.sensor_analysis import (
    SensorAnalysis,
    SensorSeriesSummary,
)


def make_analysis(*, availability=1.0, status="ok"):
    sensor_id = uuid4()
    source_ids = (uuid4(), uuid4())
    return SensorAnalysis(
        from_at=datetime(2026, 11, 10, tzinfo=timezone.utc),
        to_at_exclusive=datetime(2026, 11, 11, tzinfo=timezone.utc),
        total_observations=2,
        excluded_observations=0,
        series=(SensorSeriesSummary(
            sensor_id=sensor_id,
            variable_code="air_temperature",
            unit_code="degC",
            status=status,
            observation_count=2,
            usable_count=2 if status == "ok" else 0,
            excluded_count=0,
            quality_counts={"validated": 2},
            minimum=20.0 if status == "ok" else None,
            maximum=24.0 if status == "ok" else None,
            mean=22.0 if status == "ok" else None,
            median=22.0 if status == "ok" else None,
            standard_deviation=2.0 if status == "ok" else None,
            expected_count=2,
            availability_ratio=availability,
            gap_count=0,
            maximum_gap_seconds=0.0,
            source_observation_ids=source_ids,
        ),),
    )


def test_sensor_interpretation_routes_normal_series_with_context():
    analysis = make_analysis()
    profile = DomainProfile(
        profile_id="mycology-sensor-v1",
        module="mycology",
        version="1.0.0",
        rules=(InterpretationRule(
            rule_id="fruiting-temperature-available",
            variable_code="air_temperature",
            finding_status="normal",
            required_context_tags=frozenset({"stage:fruiting"}),
            signal_code="sensor_available",
            severity="info",
            message_code="sensor_temperature_available",
        ),),
    )
    result = interpret_sensor_analysis(
        analysis,
        profile,
        source_analysis_id=uuid4(),
        observed_date=date(2026, 11, 10),
        context_tags=frozenset({"stage:fruiting"}),
    )
    assert result.evaluated_findings == 1
    assert result.matched_findings == 1
    assert result.signals[0].observed_value == 22.0
    assert len(result.signals[0].source_observation_ids) == 2


def test_sensor_interpretation_routes_coverage_gaps_without_inventing_thresholds():
    analysis = make_analysis(availability=0.5)
    profile = DomainProfile(
        profile_id="lab-sensor-v1",
        module="lab",
        version="1.0.0",
        rules=(InterpretationRule(
            rule_id="coverage-review",
            variable_code="air_temperature",
            finding_status="insufficient_coverage",
            signal_code="sensor_coverage_review",
            severity="moderate",
            message_code="sensor_coverage_insufficient",
        ),),
    )
    result = interpret_sensor_analysis(
        analysis,
        profile,
        source_analysis_id=uuid4(),
        observed_date=date(2026, 11, 10),
    )
    assert result.matched_findings == 1
    assert result.signals[0].finding_status == "insufficient_coverage"


def test_sensor_interpretation_does_not_invent_biological_threshold_events():
    analysis = make_analysis()
    profile = DomainProfile(
        profile_id="mycology-empty-v1",
        module="mycology",
        version="1.0.0",
        rules=(),
    )
    result = interpret_sensor_analysis(
        analysis,
        profile,
        source_analysis_id=uuid4(),
        observed_date=date(2026, 11, 10),
    )
    assert result.signals == ()
