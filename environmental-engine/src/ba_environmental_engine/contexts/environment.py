"""Versioned context metadata for environmental observations."""

from enum import Enum
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class EnvironmentType(str, Enum):
    OUTDOOR = "outdoor"
    GREENHOUSE = "greenhouse"
    FRUITING_CHAMBER = "fruiting_chamber"
    LABORATORY = "laboratory"


class ObservationOrigin(str, Enum):
    SENSOR = "sensor"
    WEATHER_PROVIDER = "weather_provider"
    SATELLITE = "satellite"
    MANUAL = "manual"


class EnvironmentContext(BaseModel):
    """A named physical or virtual environment in which observations are produced.

    This model identifies the context; it does not itself represent a sensor
    reading or assert that the context's data are scientifically valid.
    """

    model_config = ConfigDict(extra="forbid", frozen=True)

    context_id: UUID
    organization_id: UUID
    location_id: UUID
    context_type: EnvironmentType
    label: str = Field(min_length=1, max_length=120)
    timezone: str = Field(min_length=1, max_length=64)
    origin: ObservationOrigin
    sensor_ids: list[UUID] = Field(default_factory=list)
    profile_code: str = Field(min_length=1, max_length=100)
    profile_version: str = Field(min_length=1, max_length=32)

    @field_validator("timezone")
    @classmethod
    def validate_iana_timezone(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ValueError("timezone must be a valid IANA timezone") from exc
        return value

    @model_validator(mode="after")
    def validate_origin_and_sensors(self):
        if len(self.sensor_ids) != len(set(self.sensor_ids)):
            raise ValueError("sensor_ids must be unique")
        if self.origin is ObservationOrigin.SENSOR and not self.sensor_ids:
            raise ValueError("sensor origin requires at least one sensor")
        if self.origin is not ObservationOrigin.SENSOR and self.sensor_ids:
            raise ValueError("non-sensor origin must not include sensor_ids")
        if (
            self.origin in {ObservationOrigin.WEATHER_PROVIDER, ObservationOrigin.SATELLITE}
            and self.context_type is not EnvironmentType.OUTDOOR
        ):
            raise ValueError("gridded provider and satellite origins are restricted to outdoor contexts")
        return self
