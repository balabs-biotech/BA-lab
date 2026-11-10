from datetime import datetime, timedelta, timezone

from ba_environmental_engine.interpretation.sensor_events import (
    SensorEventProfile,
    SensorEventRule,
    detect_sensor_events,
)
from ba_environmental_engine.sources.sensor import normalize_iot_measurement_row

from test_sensor_adapter import joined_row


def make_envelopes(values, *, quality="validated", interval_seconds=60):
    start = datetime(2026, 11, 10, 9, tzinfo=timezone.utc)
    return tuple(
        normalize_iot_measurement_row(joined_row(
            measured_at=start + timedelta(seconds=index * interval_seconds),
            raw_value=value,
            quality_state=quality,
        ))
        for index, value in enumerate(values)
    )


def profile(**overrides):
    rule = SensorEventRule(
        rule_id="temperature-high-v1",
        variable_code="temperature",
        unit_code="degC",
        operator="above",
        threshold=28.0,
        minimum_observations=2,
        minimum_duration_seconds=60,
        maximum_gap_seconds=90,
        accepted_quality_states=frozenset({"validated"}),
        required_context_tags=frozenset({"stage:fruiting"}),
        severity="high",
        event_code="temperature_above_configured_limit",
        message_code="temperature_threshold_exceeded",
        **overrides,
    )
    return SensorEventProfile(
        profile_id="mycology-fruiting-room",
        module="mycology",
        version="1.2.0",
        rules=(rule,),
    )


def test_detects_sustained_threshold_event_with_observation_lineage():
    envelopes = make_envelopes([27.0, 29.0, 30.0, 31.0, 27.5])
    result = detect_sensor_events(
        envelopes,
        profile(),
        context_tags=frozenset({"stage:fruiting"}),
    )
    assert result.evaluated_series == 1
    assert len(result.events) == 1
    event = result.events[0]
    assert event.threshold == 28.0
    assert event.minimum_value == 29.0
    assert event.maximum_value == 31.0
    assert event.observation_count == 3
    assert len(event.source_observation_ids) == 3
    assert event.duration_seconds == 120.0


def test_quality_state_and_context_gate_event_generation():
    envelopes = make_envelopes([29.0, 30.0], quality="raw")
    result = detect_sensor_events(
        envelopes,
        profile(),
        context_tags=frozenset({"stage:incubation"}),
    )
    assert result.events == ()


def test_maximum_gap_splits_non_contiguous_threshold_runs():
    envelopes = make_envelopes([29.0, 30.0, 31.0], interval_seconds=120)
    result = detect_sensor_events(
        envelopes,
        profile(minimum_observations=2, minimum_duration_seconds=60),
        context_tags=frozenset({"stage:fruiting"}),
    )
    assert result.events == ()


def test_rule_profile_rejects_duplicate_rule_ids():
    rule = profile().rules[0]
    try:
        SensorEventProfile(
            profile_id="duplicate",
            module="lab",
            version="1",
            rules=(rule, rule),
        )
    except ValueError as exc:
        assert "unique" in str(exc)
    else:
        raise AssertionError("duplicate rule IDs must be rejected")
