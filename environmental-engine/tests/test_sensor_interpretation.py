from datetime import datetime, timezone, date
from dataclasses import replace
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


def test_insufficient_history_signal_does_not_fabricate_zero_measurement():
    analysis = make_analysis(status="insufficient_data")
    profile = DomainProfile(
        profile_id="lab-history-v1",
        module="lab",
        version="1.0.0",
        rules=(InterpretationRule(
            rule_id="history-review",
            variable_code="air_temperature",
            finding_status="insufficient_history",
            signal_code="sensor_history_insufficient",
            severity="moderate",
            message_code="sensor_history_insufficient",
        ),),
    )
    result = interpret_sensor_analysis(
        analysis,
        profile,
        source_analysis_id=uuid4(),
        observed_date=date(2026, 11, 10),
    )
    assert result.matched_findings == 1
    assert result.signals[0].observed_value is None


def test_sensor_interpretation_does_not_claim_full_coverage_without_declared_cadence():
    analysis = make_analysis()
    summary = analysis.series[0]
    analysis = SensorAnalysis(
        from_at=analysis.from_at,
        to_at_exclusive=analysis.to_at_exclusive,
        total_observations=analysis.total_observations,
        excluded_observations=analysis.excluded_observations,
        series=(replace(
            summary,
            expected_count=None,
            availability_ratio=None,
            gap_count=None,
            maximum_gap_seconds=None,
        ),),
    )
    profile = DomainProfile(
        profile_id="lab-cadence-unknown-v1",
        module="lab",
        version="1.0.0",
        rules=(InterpretationRule(
            rule_id="cadence-unknown",
            variable_code="air_temperature",
            finding_status="indeterminate",
            signal_code="sensor_coverage_unknown",
            severity="info",
            message_code="sensor_sampling_interval_not_declared",
        ),),
    )
    result = interpret_sensor_analysis(
        analysis,
        profile,
        source_analysis_id=uuid4(),
        observed_date=date(2026, 11, 10),
    )
    assert result.matched_findings == 1
    assert result.signals[0].finding_status == "indeterminate"


def test_sensor_interpretation_marks_coverage_indeterminate_when_no_cadence_was_declared():
    analysis = make_analysis(availability=None)
    profile = DomainProfile(
        profile_id="lab-sensor-unknown-coverage",
        module="lab",
        version="1.0.0",
        rules=(InterpretationRule(
            rule_id="coverage-unknown",
            variable_code="air_temperature",
            finding_status="indeterminate",
            signal_code="sensor_coverage_unknown",
            severity="info",
            message_code="sensor_expected_interval_not_configured",
        ),),
    )
    result = interpret_sensor_analysis(
        analysis,
        profile,
        source_analysis_id=uuid4(),
        observed_date=date(2026, 11, 10),
    )
    assert result.matched_findings == 1
    assert result.signals[0].finding_status == "indeterminate"


def test_biological_sensor_bridge_rejects_analysis_outside_declared_date_scope():
    from ba_environmental_engine.contexts.biological import (
        BiologicalContext,
        BiologicalDomain,
        OrganismKind,
    )
    from ba_environmental_engine.contexts.environment import (
        EnvironmentContext,
        EnvironmentType,
        ObservationOrigin,
    )
    from ba_environmental_engine.interpretation import (
        interpret_sensor_analysis_for_biological_context,
    )

    analysis = make_analysis()
    organization_id, location_id = uuid4(), uuid4()
    sensor_id = analysis.series[0].sensor_id
    environment = EnvironmentContext(
        context_id=uuid4(),
        organization_id=organization_id,
        location_id=location_id,
        context_type=EnvironmentType.FRUITING_CHAMBER,
        label="Fruiting room",
        timezone="Africa/Algiers",
        origin=ObservationOrigin.SENSOR,
        sensor_ids=[sensor_id],
        profile_code="ba_fruiting_room",
        profile_version="1.0.0",
    )
    biological = BiologicalContext(
        context_id=uuid4(),
        subject_id=uuid4(),
        organization_id=organization_id,
        location_id=location_id,
        environment_context_id=environment.context_id,
        domain=BiologicalDomain.MYCOLOGY,
        organism_kind=OrganismKind.FUNGUS,
        taxon_code="pleurotus_ostreatus",
        strain_code="BA-P80",
        culture_stage="fruiting",
        production_system="fruiting_chamber",
        valid_from=date(2026, 10, 1),
        valid_to=date(2026, 12, 31),
    )

    with pytest.raises(ValueError, match="sensor analysis interval falls outside"):
        interpret_sensor_analysis_for_biological_context(
            analysis,
            DomainProfile(
                profile_id="mycology-sensor-v1",
                module="mycology",
                version="1.0.0",
            ),
            biological,
            environment,
            source_analysis_id=uuid4(),
            from_date=date(2026, 11, 1),
            to_date=date(2026, 11, 5),
        )
