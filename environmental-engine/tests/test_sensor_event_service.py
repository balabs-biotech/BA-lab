from datetime import date

import pytest

from ba_environmental_engine.execution import run_sensor_event_analysis
from ba_environmental_engine.interpretation.sensor_events import (
    SensorEventProfile,
    SensorEventRule,
)
from test_sensor_service import FakeRepository, ORG, ENV, make_row


def event_profile():
    return SensorEventProfile(
        profile_id="mycology-fruiting-v1",
        module="mycology",
        version="1.0.0",
        rules=(SensorEventRule(
            rule_id="air-temperature-high",
            variable_code="air_temperature",
            unit_code="degC",
            operator="above",
            threshold=28.0,
            minimum_observations=2,
            minimum_duration_seconds=60,
            maximum_gap_seconds=120,
            accepted_quality_states=frozenset({"validated"}),
            required_context_tags=frozenset({"stage:fruiting"}),
            severity="high",
            event_code="air_temperature_high",
            message_code="air_temperature_above_configured_limit",
        ),),
    )


def test_event_use_case_loads_tenant_scope_and_applies_trusted_profile():
    repository = FakeRepository([
        make_row(0, value=29.0),
        make_row(1, value=30.0),
        make_row(2, value=31.0),
    ])
    result = run_sensor_event_analysis(
        repository=repository,
        organization_id=str(ORG),
        environment_id=str(ENV),
        from_date=date(2026, 3, 1),
        to_date=date(2026, 3, 1),
        profile_timezone="Africa/Algiers",
        event_profile=event_profile(),
        context_tags=frozenset({"stage:fruiting"}),
    )
    assert len(result.events) == 1
    assert result.events[0].observation_count == 3
    assert len(result.events[0].source_observation_ids) == 3
    assert repository.calls[0]["organization_id"] == str(ORG)


def test_event_use_case_rejects_cross_tenant_repository_rows():
    from uuid import UUID

    repository = FakeRepository([
        make_row(0, organization_id=UUID("ffffffff-ffff-4fff-8fff-ffffffffffff"), value=29.0),
    ])
    with pytest.raises(ValueError, match="another tenant"):
        run_sensor_event_analysis(
            repository=repository,
            organization_id=str(ORG),
            environment_id=str(ENV),
            from_date=date(2026, 3, 1),
            to_date=date(2026, 3, 1),
            profile_timezone="Africa/Algiers",
            event_profile=event_profile(),
            context_tags=frozenset({"stage:fruiting"}),
        )
