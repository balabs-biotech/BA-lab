from uuid import uuid4

import pytest

from ba_environmental_engine.contexts.environment import (
    EnvironmentContext,
    EnvironmentType,
    ObservationOrigin,
)


def build_context(**overrides):
    values = {
        "context_id": uuid4(),
        "organization_id": uuid4(),
        "location_id": uuid4(),
        "context_type": EnvironmentType.FRUITING_CHAMBER,
        "label": "Chambre Pleurotes 01",
        "timezone": "Africa/Algiers",
        "origin": ObservationOrigin.SENSOR,
        "sensor_ids": [uuid4()],
        "profile_code": "fruiting_chamber_standard",
        "profile_version": "1.0.0",
    }
    values.update(overrides)
    return values


def test_accepts_sensor_context_with_explicit_timezone_and_profile():
    context = EnvironmentContext.model_validate(build_context())
    assert context.context_type is EnvironmentType.FRUITING_CHAMBER
    assert context.timezone == "Africa/Algiers"
    assert context.origin is ObservationOrigin.SENSOR
    assert len(context.sensor_ids) == 1
    assert context.profile_version == "1.0.0"


def test_provider_weather_data_is_only_allowed_for_outdoor_context():
    values = build_context(
        context_type=EnvironmentType.OUTDOOR,
        origin=ObservationOrigin.WEATHER_PROVIDER,
        sensor_ids=[],
    )
    assert EnvironmentContext.model_validate(values).origin is ObservationOrigin.WEATHER_PROVIDER

    values["context_type"] = EnvironmentType.GREENHOUSE
    with pytest.raises(ValueError, match="outdoor"):
        EnvironmentContext.model_validate(values)


def test_sensor_origin_requires_unique_sensor_ids():
    values = build_context(sensor_ids=[])
    with pytest.raises(ValueError, match="at least one sensor"):
        EnvironmentContext.model_validate(values)

    sensor_id = uuid4()
    values = build_context(sensor_ids=[sensor_id, sensor_id])
    with pytest.raises(ValueError, match="unique"):
        EnvironmentContext.model_validate(values)


def test_non_sensor_origin_cannot_claim_sensor_ids():
    values = build_context(origin=ObservationOrigin.MANUAL, sensor_ids=[uuid4()])
    with pytest.raises(ValueError, match="must not include"):
        EnvironmentContext.model_validate(values)


@pytest.mark.parametrize("timezone", ["Algiers", "Not/A_Timezone"])
def test_rejects_unknown_iana_timezone(timezone):
    with pytest.raises(ValueError, match="IANA"):
        EnvironmentContext.model_validate(build_context(timezone=timezone))


def test_context_is_immutable_and_rejects_unknown_fields():
    context = EnvironmentContext.model_validate(build_context())
    with pytest.raises(Exception):
        context.label = "Changed"

    values = build_context(unexpected_field="no")
    with pytest.raises(ValueError):
        EnvironmentContext.model_validate(values)


def test_rejects_empty_timezone():
    with pytest.raises(ValueError):
        EnvironmentContext.model_validate(build_context(timezone=""))
