"""Sensor registry and traceable environmental measurement contracts."""

from datetime import datetime
from enum import Enum
from math import isfinite
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class CalibrationStatus(str, Enum):
    CALIBRATED = "calibrated"
    EXPIRED = "expired"
    NOT_CALIBRATED = "not_calibrated"
    NOT_APPLICABLE = "not_applicable"


class MeasurementOrigin(str, Enum):
    SENSOR = "sensor"
    WEATHER_PROVIDER = "weather_provider"
    SATELLITE = "satellite"
    MANUAL = "manual"
    DERIVED = "derived"


class MeasurementContract(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, allow_inf_nan=False)


class SensorDescriptor(MeasurementContract):
    sensor_id: UUID
    organization_id: UUID
    location_id: UUID
    context_id: UUID
    label: str = Field(min_length=1, max_length=120)
    manufacturer: str | None = Field(default=None, max_length=100)
    model: str = Field(min_length=1, max_length=100)
    serial_number: str | None = Field(default=None, max_length=120)
    measures: list[str] = Field(min_length=1)
    installed_at: datetime
    removed_at: datetime | None = None
    calibration_status: CalibrationStatus
    calibrated_at: datetime | None = None
    calibration_due_at: datetime | None = None

    @field_validator("installed_at", "removed_at", "calibrated_at", "calibration_due_at")
    @classmethod
    def timestamps_are_aware(cls, value: datetime | None) -> datetime | None:
        if value is not None and (value.tzinfo is None or value.utcoffset() is None):
            raise ValueError("sensor timestamps must include a valid timezone")
        return value

    @field_validator("measures")
    @classmethod
    def measures_are_unique(cls, value: list[str]) -> list[str]:
        if any(not item.strip() for item in value):
            raise ValueError("measures cannot contain empty codes")
        if len(value) != len(set(value)):
            raise ValueError("measures must be unique")
        return value

    @model_validator(mode="after")
    def validate_lifecycle_and_calibration(self):
        if self.removed_at is not None and self.removed_at <= self.installed_at:
            raise ValueError("removed_at must be after installed_at")
        if self.calibration_status is CalibrationStatus.CALIBRATED and self.calibrated_at is None:
            raise ValueError("calibrated sensors require calibrated_at")
        if (
            self.calibration_due_at is not None
            and self.calibrated_at is not None
            and self.calibration_due_at <= self.calibrated_at
        ):
            raise ValueError("calibration_due_at must be after calibrated_at")
        return self


class EnvironmentalMeasurement(MeasurementContract):
    observation_id: UUID
    organization_id: UUID
    location_id: UUID
    context_id: UUID
    origin: MeasurementOrigin = MeasurementOrigin.SENSOR
    sensor_id: UUID | None = None
    variable_code: str = Field(min_length=1, max_length=120)
    value: float
    unit_code: str = Field(min_length=1, max_length=40)
    observed_at: datetime
    source_observation_ids: list[UUID] = Field(default_factory=list)
    formula_code: str | None = Field(default=None, max_length=120)
    formula_version: str | None = Field(default=None, max_length=32)

    @field_validator("observed_at")
    @classmethod
    def timestamp_is_aware(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("observed_at must include a valid timezone")
        return value

    @field_validator("value", mode="before")
    @classmethod
    def value_is_finite(cls, value: float) -> float:
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not isfinite(value):
            raise ValueError("measurement value must be finite and numeric")
        return float(value)

    @field_validator("source_observation_ids")
    @classmethod
    def source_ids_are_unique(cls, value: list[UUID]) -> list[UUID]:
        if len(value) != len(set(value)):
            raise ValueError("source_observation_ids must be unique")
        return value

    @model_validator(mode="after")
    def validate_origin_lineage(self):
        if self.origin is MeasurementOrigin.SENSOR and self.sensor_id is None:
            raise ValueError("sensor-origin measurements require sensor_id")
        if self.origin is not MeasurementOrigin.SENSOR and self.sensor_id is not None:
            raise ValueError("non-sensor measurements must not include sensor_id")
        if self.origin is MeasurementOrigin.DERIVED:
            if not self.source_observation_ids or not self.formula_code or not self.formula_version:
                raise ValueError("derived measurements require source IDs and formula code/version")
        elif self.formula_code is not None or self.formula_version is not None:
            raise ValueError("formula metadata is only valid for derived measurements")
        return self
