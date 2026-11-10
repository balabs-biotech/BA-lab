from datetime import date, datetime, timedelta, timezone
from uuid import UUID

import pytest

from ba_environmental_engine.contexts.measurement import EnvironmentalMeasurement
from ba_environmental_engine.execution.sensor_service import run_sensor_analysis
from ba_environmental_engine.sources.sensor import SensorMeasurementEnvelope


ORG = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
LOC = UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")
ENV = UUID("cccccccc-cccc-4ccc-8ccc-cccccccccccc")
SENSOR = UUID("dddddddd-dddd-4ddd-8ddd-dddddddddddd")


class FakeRepository:
    def __init__(self, rows):
        self.rows = tuple(rows)
        self.calls = []

    def list_for_scope(self, **kwargs):
        self.calls.append(kwargs)
        return self.rows


def make_row(index: int, *, organization_id=ORG, context_id=ENV, value=21.0):
    observed = datetime(2026, 3, 1, tzinfo=timezone.utc) + timedelta(minutes=index)
    observation_id = UUID(f"eeeeeeee-eeee-4eee-8eee-{index:012d}")
    measurement = EnvironmentalMeasurement(
        observation_id=observation_id,
        organization_id=organization_id,
        location_id=LOC,
        context_id=context_id,
        sensor_id=SENSOR,
        variable_code="air_temperature",
        value=value,
        unit_code="degC",
        observed_at=observed,
        source_observation_ids=[observation_id],
    )
    return SensorMeasurementEnvelope(
        measurement=measurement,
        quality_state="validated",
        exclusion_reason=None,
        method=None,
        instrument=None,
        device_code="sensor-01",
        device_type="environmental",
        metadata={"source": "iot"},
    )


def test_sensor_use_case_loads_scope_and_runs_independent_analysis():
    repository = FakeRepository([make_row(0, value=20), make_row(1, value=22)])
    result = run_sensor_analysis(
        repository=repository,
        organization_id=str(ORG),
        environment_id=str(ENV),
        from_date=date(2026, 3, 1),
        to_date=date(2026, 3, 1),
        profile_timezone="Africa/Algiers",
        expected_interval_seconds=60,
    )
    assert repository.calls == [{
        "organization_id": str(ORG),
        "environment_id": str(ENV),
        "from_date": date(2026, 3, 1),
        "to_date": date(2026, 3, 1),
    }]
    assert result.total_observations == 2
    assert result.series[0].mean == 21
    assert result.from_at == datetime(2026, 2, 28, 23, tzinfo=timezone.utc)


def test_sensor_use_case_rejects_cross_tenant_repository_rows():
    repository = FakeRepository([make_row(0, organization_id=UUID("ffffffff-ffff-4fff-8fff-ffffffffffff"))])
    with pytest.raises(ValueError, match="another tenant"):
        run_sensor_analysis(
            repository=repository,
            organization_id=str(ORG),
            environment_id=str(ENV),
            from_date=date(2026, 3, 1),
            to_date=date(2026, 3, 1),
            profile_timezone="Africa/Algiers",
        )


def test_sensor_use_case_rejects_cross_environment_repository_rows():
    repository = FakeRepository([make_row(0, context_id=UUID("ffffffff-ffff-4fff-8fff-ffffffffffff"))])
    with pytest.raises(ValueError, match="another environment"):
        run_sensor_analysis(
            repository=repository,
            organization_id=str(ORG),
            environment_id=str(ENV),
            from_date=date(2026, 3, 1),
            to_date=date(2026, 3, 1),
            profile_timezone="Africa/Algiers",
        )


def test_sensor_use_case_rejects_invalid_profile_timezone():
    with pytest.raises(ValueError, match="IANA timezone"):
        run_sensor_analysis(
            repository=FakeRepository([]),
            organization_id=str(ORG),
            environment_id=str(ENV),
            from_date=date(2026, 3, 1),
            to_date=date(2026, 3, 1),
            profile_timezone="Mars/Olympus",
        )
