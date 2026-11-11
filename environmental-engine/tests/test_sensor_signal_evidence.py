from datetime import date, datetime, timezone
from uuid import uuid4

from ba_environmental_engine.interpretation import interpret_sensor_analysis
from ba_environmental_engine.interpretation.models import DomainProfile, InterpretationRule
from ba_environmental_engine.sources.sensor_analysis import SensorAnalysis, SensorSeriesSummary


def test_series_signal_preserves_the_complete_descriptive_evidence():
    sensor_id = uuid4()
    source_ids = (uuid4(), uuid4(), uuid4())
    analysis = SensorAnalysis(
        from_at=datetime(2026, 11, 10, tzinfo=timezone.utc),
        to_at_exclusive=datetime(2026, 11, 11, tzinfo=timezone.utc),
        series=(SensorSeriesSummary(
            sensor_id=sensor_id,
            variable_code="air_temperature",
            unit_code="degC",
            status="ok",
            observation_count=3,
            usable_count=2,
            excluded_count=1,
            quality_counts={"validated": 2, "excluded": 1},
            minimum=19.0,
            maximum=25.0,
            mean=22.0,
            median=22.0,
            standard_deviation=3.0,
            expected_count=4,
            availability_ratio=0.5,
            gap_count=1,
            maximum_gap_seconds=21600.0,
            source_observation_ids=source_ids,
        ),),
        total_observations=3,
        excluded_observations=1,
    )
    profile = DomainProfile(
        profile_id="lab-sensor-evidence-v1",
        module="lab",
        version="1.0.0",
        rules=(InterpretationRule(
            rule_id="coverage-review",
            variable_code="air_temperature",
            finding_status="insufficient_coverage",
            signal_code="sensor_series_review",
            severity="info",
            message_code="sensor_series_summary_available",
        ),),
    )

    result = interpret_sensor_analysis(
        analysis,
        profile,
        source_analysis_id=uuid4(),
        observed_date=date(2026, 11, 10),
    )

    evidence = result.signals[0].evidence
    assert evidence["assessment_type"] == "sensor_series_summary"
    assert evidence["sensor_id"] == str(sensor_id)
    assert evidence["window_from"] == "2026-11-10T00:00:00+00:00"
    assert evidence["window_to_exclusive"] == "2026-11-11T00:00:00+00:00"
    assert evidence["observation_count"] == 3
    assert evidence["usable_count"] == 2
    assert evidence["excluded_count"] == 1
    assert evidence["quality_counts"] == {"validated": 2, "excluded": 1}
    assert evidence["minimum"] == 19.0
    assert evidence["maximum"] == 25.0
    assert evidence["mean"] == 22.0
    assert evidence["median"] == 22.0
    assert evidence["standard_deviation"] == 3.0
    assert evidence["expected_count"] == 4
    assert evidence["availability_ratio"] == 0.5
    assert evidence["gap_count"] == 1
    assert evidence["maximum_gap_seconds"] == 21600.0
    assert result.signals[0].source_observation_ids == source_ids


def test_series_signal_does_not_fabricate_sampling_coverage_when_cadence_is_unknown():
    analysis = SensorAnalysis(
        from_at=datetime(2026, 11, 10, tzinfo=timezone.utc),
        to_at_exclusive=datetime(2026, 11, 11, tzinfo=timezone.utc),
        series=(SensorSeriesSummary(
            sensor_id=uuid4(),
            variable_code="air_temperature",
            unit_code="degC",
            status="ok",
            observation_count=1,
            usable_count=1,
            excluded_count=0,
            quality_counts={"validated": 1},
            minimum=22.0,
            maximum=22.0,
            mean=22.0,
            median=22.0,
            standard_deviation=0.0,
            expected_count=None,
            availability_ratio=None,
            gap_count=None,
            maximum_gap_seconds=None,
            source_observation_ids=(uuid4(),),
        ),),
        total_observations=1,
        excluded_observations=0,
    )
    profile = DomainProfile(
        profile_id="lab-sensor-evidence-v1",
        module="lab",
        version="1.0.0",
        rules=(InterpretationRule(
            rule_id="series-available",
            variable_code="air_temperature",
            finding_status="indeterminate",
            signal_code="sensor_series_available",
            severity="info",
            message_code="sensor_series_available",
        ),),
    )

    result = interpret_sensor_analysis(
        analysis,
        profile,
        source_analysis_id=uuid4(),
        observed_date=date(2026, 11, 10),
    )

    evidence = result.signals[0].evidence
    assert evidence["expected_count"] is None
    assert evidence["availability_ratio"] is None
    assert evidence["gap_count"] is None
    assert evidence["maximum_gap_seconds"] is None
