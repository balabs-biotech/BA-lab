"""Private FastAPI boundary for normalized environmental analysis requests.

The API is service-to-service only. Supabase Edge Functions remain responsible
for end-user JWT validation and tenant authorization before forwarding requests.
"""

from __future__ import annotations

import os
import secrets
from datetime import date, datetime, time, timedelta, timezone
from typing import Annotated, Any, Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from uuid import UUID

from fastapi import Depends, FastAPI, Header, HTTPException, status
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictFloat, StrictInt, ValidationError, model_validator

from ba_environmental_engine.contexts.biological import BiologicalContext
from ba_environmental_engine.contexts.environment import EnvironmentContext
from ba_environmental_engine.interpretation.models import DomainProfile
from ba_environmental_engine.interpretation.service import interpret_analysis_for_biological_context
from ba_environmental_engine.interpretation.recommendations import resolve_recommendations
from ba_environmental_engine.interpretation.sensor_service import interpret_sensor_analysis_for_biological_context

from ba_environmental_engine import __version__
from ba_environmental_engine.climate.aggregation import AggregationMethod
from ba_environmental_engine.execution import run_environmental_analysis, run_sensor_analysis
from ba_environmental_engine.indicators.biological_pipeline import analyze_measurement_rows
from ba_environmental_engine.serialization.biological_performance import build_bal_biological_analysis
from ba_environmental_engine.sources.sensor import normalize_iot_measurement_row
from ba_environmental_engine.sources.sensor_temporal import assess_sensor_temporal_anomalies
from ba_environmental_engine.quality.sensor_health import assess_sensor_flatlines
from ba_environmental_engine.quality.sensor_drift import SensorDriftPolicy, assess_sensor_drift
from ba_environmental_engine.quality.sensor_transmission import (
    SensorDeviceTransmission,
    SensorTransmissionReceipt,
    assess_sensor_transmissions,
)
from ba_environmental_engine.sources.models import NormalizedEnvironmentalObservation
from ba_environmental_engine.sources.nasa_power import normalize_nasa_power_observation
from ba_environmental_engine.sources.sentinel2_worker import (
    Sentinel2PersistenceError,
    process_and_persist_sentinel2_batch,
)


class APIModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, allow_inf_nan=False)


class ObservationInput(APIModel):
    source_observation_id: UUID
    organization_id: UUID
    location_id: UUID
    data_family: Literal["weather", "satellite"]
    provider_code: str = Field(min_length=1, max_length=80)
    dataset_code: str = Field(min_length=1, max_length=120)
    source_parameter: str = Field(min_length=1, max_length=120)
    variable_code: str = Field(min_length=1, max_length=120)
    value: float
    unit: str = Field(min_length=1, max_length=40)
    source_value: float
    source_unit: str = Field(min_length=1, max_length=40)
    observed_at: datetime
    observed_date: date
    retrieved_at: datetime
    spatial_resolution_m: float | None = Field(default=None, gt=0)
    quality_flag: str | None = Field(default=None, max_length=120)
    source_url: str | None = Field(default=None, max_length=2048)
    source_time_standard: str = Field(min_length=1, max_length=120)
    source_metadata: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_timestamps(self) -> ObservationInput:
        for name, value in (("observed_at", self.observed_at), ("retrieved_at", self.retrieved_at)):
            if value.tzinfo is None or value.utcoffset() is None:
                raise ValueError(f"{name} must include a timezone")
        if self.observed_at.date() != self.observed_date:
            raise ValueError("observed_at date must match observed_date")
        return self

    def to_domain(self) -> NormalizedEnvironmentalObservation:
        return NormalizedEnvironmentalObservation(**self.model_dump())


class AnalysisScopeInput(APIModel):
    organization_id: UUID
    location_id: UUID
    from_date: date = Field(alias="from")
    to_date: date = Field(alias="to")

    @model_validator(mode="after")
    def validate_dates(self) -> AnalysisScopeInput:
        if self.to_date < self.from_date:
            raise ValueError("scope.to must be on or after scope.from")
        return self


class PersistedObservationInput(APIModel):
    """Raw persisted environmental_observations row, normalized by its provider adapter."""

    id: UUID
    organization_id: UUID
    location_id: UUID
    data_family: Literal["weather", "satellite"]
    provider_code: str = Field(min_length=1, max_length=80)
    dataset_code: str = Field(min_length=1, max_length=120)
    variable_code: str = Field(min_length=1, max_length=120)
    value: float
    unit_code: str = Field(min_length=1, max_length=40)
    observed_at: datetime
    retrieved_at: datetime
    spatial_resolution_m: float | None = Field(default=None, gt=0)
    quality_flag: str | None = Field(default=None, max_length=120)
    source_url: str | None = Field(default=None, max_length=2048)
    source_metadata: dict[str, Any] = Field(alias="metadata", max_length=40)

    @model_validator(mode="after")
    def validate_timestamps(self) -> PersistedObservationInput:
        for name, value in (("observed_at", self.observed_at), ("retrieved_at", self.retrieved_at)):
            if value.tzinfo is None or value.utcoffset() is None:
                raise ValueError(f"{name} must include a timezone")
        return self

    def to_nasa_power_domain(self) -> NormalizedEnvironmentalObservation:
        row = self.model_dump(mode="json", by_alias=True)
        return normalize_nasa_power_observation(row)


class PersistedAnalysisRequest(APIModel):
    analysis_id: UUID
    scope: AnalysisScopeInput
    latitude_deg: float = Field(ge=-90, le=90)
    altitude_m: float = Field(ge=-500, le=9000)
    observations: list[PersistedObservationInput] = Field(min_length=1, max_length=5000)
    rolling_methods: dict[str, AggregationMethod] | None = Field(default=None, max_length=40)
    rolling_windows: tuple[StrictInt, ...] = Field(default=(7, 14, 30, 90), min_length=1, max_length=8)
    minimum_rolling_coverage: float = Field(default=1.0, gt=0, le=1)
    biological_interpretation: dict[str, Any] | None = None

    @model_validator(mode="after")
    def validate_observation_scope(self) -> PersistedAnalysisRequest:
        scope = self.scope
        for row in self.observations:
            if (row.organization_id, row.location_id) != (scope.organization_id, scope.location_id):
                raise ValueError("every observation must match the requested organization and location")
            if not scope.from_date <= row.observed_at.date() <= scope.to_date:
                raise ValueError("every observation date must be contained within the requested scope")
        if any(days <= 0 for days in self.rolling_windows):
            raise ValueError("rolling_windows must contain positive integers")
        if len(set(self.rolling_windows)) != len(self.rolling_windows):
            raise ValueError("rolling_windows must not contain duplicates")
        return self



class Sentinel2WorkerRequest(APIModel):
    organization_id: UUID
    location_id: UUID
    aoi_geojson: dict[str, Any]
    items: list[dict[str, Any]] = Field(min_length=1, max_length=100)
    retrieved_at: datetime
    processing_version: str = Field(min_length=1, max_length=80)
    minimum_valid_ratio: float = Field(default=0.2, ge=0.2, le=1)
    max_pixels: StrictInt = Field(default=4_000_000, ge=1, le=4_000_000)

    @model_validator(mode="after")
    def validate_worker_request(self) -> Sentinel2WorkerRequest:
        if self.retrieved_at.tzinfo is None or self.retrieved_at.utcoffset() is None:
            raise ValueError("retrieved_at must include a timezone")
        if self.aoi_geojson.get("type") not in {"Polygon", "MultiPolygon"}:
            raise ValueError("aoi_geojson must be a GeoJSON Polygon or MultiPolygon")
        for item in self.items:
            if item.get("type") != "Feature" or not isinstance(item.get("id"), str):
                raise ValueError("every item must be a STAC Feature with an id")
        return self


class BiologicalPerformanceRequest(APIModel):
    analysis_id: UUID
    organization_id: UUID
    subject_id: UUID
    subject_type: Literal["culture", "plant_culture", "sample", "experimental_unit"]
    variable_code: str = Field(min_length=1, max_length=120)
    variable_registry: dict[str, str] = Field(min_length=1, max_length=500)
    accepted_quality_states: set[Literal["raw", "controlled", "validated", "excluded"]] = Field(min_length=1)
    measurements: list[dict[str, Any]] = Field(default_factory=list, max_length=5000)

    @model_validator(mode="after")
    def validate_measurement_scope(self) -> BiologicalPerformanceRequest:
        if self.variable_code not in self.variable_registry:
            raise ValueError("variable_code must exist in the supplied canonical variable registry")
        for row in self.measurements:
            if str(row.get("organization_id") or "") != str(self.organization_id):
                raise ValueError("every biological measurement must match the requested organization")
        return self


class SensorTransmissionDeviceInput(APIModel):
    device_id: UUID
    device_code: str = Field(min_length=1, max_length=100)
    enabled: StrictBool
    created_at: datetime
    profile_bound: StrictBool
    expected_from: date
    expected_to: date | None = None
    last_seen_at: datetime | None = None

    @model_validator(mode="after")
    def validate_device_timestamps(self) -> SensorTransmissionDeviceInput:
        for name, value in (
            ("created_at", self.created_at),
            ("last_seen_at", self.last_seen_at),
        ):
            if value is not None and (value.tzinfo is None or value.utcoffset() is None):
                raise ValueError(f"transmission device {name} must include a timezone")
        return self


class SensorTransmissionReceiptInput(APIModel):
    receipt_id: UUID
    device_id: UUID
    received_at: datetime

    @model_validator(mode="after")
    def validate_receipt_timestamp(self) -> SensorTransmissionReceiptInput:
        if self.received_at.tzinfo is None or self.received_at.utcoffset() is None:
            raise ValueError("transmission receipt received_at must include a timezone")
        return self


class SensorDriftPolicyInput(APIModel):
    target_sensor_id: UUID
    reference_sensor_id: UUID
    variable_code: str = Field(min_length=1, max_length=120)
    reference_binding_verified: StrictBool
    maximum_pair_offset_seconds: StrictInt = Field(ge=1, le=86400)
    minimum_pairs: StrictInt = Field(ge=3, le=5000)
    minimum_duration_seconds: StrictInt = Field(ge=1, le=2592000)
    maximum_abs_drift_rate_per_hour: StrictFloat | StrictInt = Field(gt=0)


class SensorAnalysisRequest(APIModel):
    analysis_id: UUID
    organization_id: UUID
    environment_id: UUID
    from_date: date
    to_date: date
    profile_timezone: str = Field(min_length=1, max_length=80)
    expected_interval_seconds: StrictInt | None = Field(default=None, gt=0)
    temporal_window_seconds: StrictInt | None = Field(default=None, gt=0)
    temporal_minimum_history: StrictInt | None = Field(default=None, gt=0)
    temporal_threshold: float | None = Field(default=None, gt=0)
    flatline_minimum_repeated_observations: StrictInt | None = Field(default=None, ge=2)
    flatline_minimum_duration_seconds: StrictInt | None = Field(default=None, gt=0)
    transmission_expected_interval_seconds: StrictInt | None = Field(default=None, gt=0)
    transmission_gap_tolerance_factor: StrictFloat | StrictInt | None = Field(default=None, gt=1)
    transmission_current_window: StrictBool = False
    transmission_devices: list[SensorTransmissionDeviceInput] | None = Field(default=None, max_length=100)
    transmission_receipts: list[SensorTransmissionReceiptInput] | None = Field(default=None, max_length=5000)
    drift_policies: list[SensorDriftPolicyInput] = Field(default_factory=list, max_length=100)
    biological_interpretation: dict[str, Any] | None = None
    measurements: list[dict[str, Any]] = Field(min_length=0, max_length=5000)

    @model_validator(mode="after")
    def validate_sensor_scope(self) -> SensorAnalysisRequest:
        if self.to_date < self.from_date:
            raise ValueError("to_date must be on or after from_date")
        if self.expected_interval_seconds is not None and self.expected_interval_seconds <= 0:
            raise ValueError("expected_interval_seconds must be positive")
        temporal_options = (
            self.temporal_window_seconds,
            self.temporal_minimum_history,
            self.temporal_threshold,
        )
        if any(value is not None for value in temporal_options) and not all(
            value is not None for value in temporal_options
        ):
            raise ValueError("temporal screening parameters must be supplied together")
        flatline_options = (
            self.flatline_minimum_repeated_observations,
            self.flatline_minimum_duration_seconds,
        )
        if any(value is not None for value in flatline_options) and not all(
            value is not None for value in flatline_options
        ):
            raise ValueError("flatline diagnostic parameters must be supplied together")
        transmission_options = (
            self.transmission_expected_interval_seconds,
            self.transmission_gap_tolerance_factor,
            self.transmission_devices,
            self.transmission_receipts,
        )
        if any(value is not None for value in transmission_options) and not all(
            value is not None for value in transmission_options
        ):
            raise ValueError("transmission diagnostics policy, devices and receipts must be supplied together")
        if self.transmission_devices is not None:
            if not self.transmission_devices:
                raise ValueError("transmission diagnostics require at least one profile-bound device")
            device_ids = [item.device_id for item in self.transmission_devices]
            if len(device_ids) != len(set(device_ids)):
                raise ValueError("transmission device IDs must be unique")
            known_device_ids = set(device_ids)
            if any(item.device_id not in known_device_ids for item in self.transmission_receipts or []):
                raise ValueError("every transmission receipt must reference a supplied device")
        elif self.transmission_current_window:
            raise ValueError("transmission_current_window requires transmission diagnostics")
        if self.transmission_current_window:
            try:
                current_profile_date = datetime.now(ZoneInfo(self.profile_timezone)).date()
            except (ZoneInfoNotFoundError, ValueError) as exc:
                raise ValueError("profile_timezone must be a valid IANA timezone") from exc
            if self.to_date != current_profile_date:
                raise ValueError("current transmission silence can only be evaluated through the current profile-local date")
        drift_keys = [
            (item.target_sensor_id, item.reference_sensor_id, item.variable_code)
            for item in self.drift_policies
        ]
        if len(drift_keys) != len(set(drift_keys)):
            raise ValueError("drift policies must be unique per target/reference/variable")
        for item in self.drift_policies:
            if item.target_sensor_id == item.reference_sensor_id:
                raise ValueError("drift target and reference sensors must differ")
        if self.drift_policies and not self.measurements:
            raise ValueError("drift diagnostics require sensor measurements")
        if not self.measurements and self.transmission_expected_interval_seconds is None:
            raise ValueError("at least one sensor measurement or transmission diagnostics policy is required")
        for row in self.measurements:
            if row.get("organization_id") != str(self.organization_id):
                raise ValueError("every sensor measurement must match the requested organization")
            if row.get("environment_id") != str(self.environment_id):
                raise ValueError("every sensor measurement must match the requested environment")
        return self


class AnalysisRequest(APIModel):
    analysis_id: UUID
    scope: AnalysisScopeInput
    latitude_deg: float = Field(ge=-90, le=90)
    altitude_m: float = Field(ge=-500, le=9000)
    observations: list[ObservationInput] = Field(min_length=1, max_length=5000)
    rolling_methods: dict[str, AggregationMethod] | None = Field(default=None, max_length=40)
    rolling_windows: tuple[StrictInt, ...] = Field(default=(7, 14, 30, 90), min_length=1, max_length=8)
    minimum_rolling_coverage: float = Field(default=1.0, gt=0, le=1)

    @model_validator(mode="after")
    def validate_observation_scope(self) -> AnalysisRequest:
        scope = self.scope
        for row in self.observations:
            if (row.organization_id, row.location_id) != (scope.organization_id, scope.location_id):
                raise ValueError("every observation must match the requested organization and location")
            if not scope.from_date <= row.observed_date <= scope.to_date:
                raise ValueError("every observation date must be contained within the requested scope")
        if any(isinstance(days, bool) or days <= 0 for days in self.rolling_windows):
            raise ValueError("rolling_windows must contain positive integers")
        if len(set(self.rolling_windows)) != len(self.rolling_windows):
            raise ValueError("rolling_windows must not contain duplicates")
        return self



def _analysis_with_optional_interpretation(
    analysis: Any,
    payload: dict[str, Any] | None,
) -> dict[str, Any]:
    """Attach a separately typed interpretation without failing climate analysis.

    The gateway resolves tenant-scoped records. This private API validates their
    domain contracts and bindings, but never accepts caller-defined rule logic
    outside the persisted profile payload supplied by that gateway.
    """
    response = analysis.model_dump(mode="json")
    if payload is None:
        response.update(
            interpretation_status="not_requested",
            domain_interpretation=None,
            recommendation_resolution=None,
        )
        return response

    try:
        biological_context = BiologicalContext.model_validate(
            payload["biological_context"]
        )
        environment_context = EnvironmentContext.model_validate(
            payload["environment_context"]
        )
        # This endpoint analyzes NASA POWER gridded weather. Do not let a
        # sensor-backed greenhouse/lab profile relabel those outdoor estimates.
        if (
            environment_context.origin.value != "weather_provider"
            or environment_context.context_type.value != "outdoor"
        ):
            raise ValueError(
                "NASA POWER analysis requires an outdoor weather-provider context"
            )
        domain_profile = DomainProfile.model_validate(payload["domain_profile"])
        interpretation = interpret_analysis_for_biological_context(
            analysis,
            domain_profile,
            biological_context,
            environment_context,
        )
    except (KeyError, TypeError, ValueError, ValidationError):
        response.update(
            interpretation_status="context_invalid",
            domain_interpretation=None,
            recommendation_resolution=None,
        )
        return response

    recommendation_resolution = resolve_recommendations(
        interpretation,
        domain_profile,
    )
    response.update(
        interpretation_status="interpreted",
        domain_interpretation=interpretation.model_dump(mode="json"),
        recommendation_resolution=recommendation_resolution.model_dump(mode="json"),
    )
    return response


def create_app(engine_api_key: str | None = None) -> FastAPI:
    """Create the private API; inject a key explicitly in tests or use the env."""
    configured_key = (
        engine_api_key
        if engine_api_key is not None
        else os.getenv("BA_ENVIRONMENTAL_ENGINE_API_KEY")
    )
    app = FastAPI(
        title="BA Labs Environmental Engine",
        version=__version__,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )

    def require_internal_key(
        supplied_key: Annotated[str | None, Header(alias="X-BA-Engine-Key")] = None,
    ) -> None:
        if not configured_key:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="internal engine authentication is not configured",
            )
        if supplied_key is None or not secrets.compare_digest(supplied_key, configured_key):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="invalid internal engine credentials",
            )

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "engine": "ba-environmental-intelligence", "version": __version__}

    @app.post("/v1/analyses", dependencies=[Depends(require_internal_key)])
    def create_analysis(request: AnalysisRequest):
        try:
            return run_environmental_analysis(
                observations=[row.to_domain() for row in request.observations],
                analysis_id=request.analysis_id,
                generated_at=datetime.now(timezone.utc),
                engine_version=__version__,
                scope_from=request.scope.from_date,
                scope_to=request.scope.to_date,
                latitude_deg=request.latitude_deg,
                altitude_m=request.altitude_m,
                rolling_methods=request.rolling_methods,
                rolling_windows=request.rolling_windows,
                minimum_rolling_coverage=request.minimum_rolling_coverage,
            )
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    @app.post("/v1/analyses/nasa-power", dependencies=[Depends(require_internal_key)])
    def create_nasa_power_analysis(request: PersistedAnalysisRequest):
        try:
            normalized = [
                row.to_nasa_power_domain()
                for row in request.observations
            ]
            analysis = run_environmental_analysis(
                observations=normalized,
                analysis_id=request.analysis_id,
                generated_at=datetime.now(timezone.utc),
                engine_version=__version__,
                scope_from=request.scope.from_date,
                scope_to=request.scope.to_date,
                latitude_deg=request.latitude_deg,
                altitude_m=request.altitude_m,
                rolling_methods=request.rolling_methods,
                rolling_windows=request.rolling_windows,
                minimum_rolling_coverage=request.minimum_rolling_coverage,
            )
            return _analysis_with_optional_interpretation(
                analysis,
                request.biological_interpretation,
            )
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc


    @app.post("/v1/analyses/biological-performance", dependencies=[Depends(require_internal_key)])
    def create_biological_performance_analysis(request: BiologicalPerformanceRequest):
        try:
            pipeline = analyze_measurement_rows(
                request.measurements,
                organization_id=str(request.organization_id),
                subject_id=str(request.subject_id),
                subject_type=request.subject_type,
                variable_code=request.variable_code,
                variable_registry=request.variable_registry,
                accepted_quality_states=request.accepted_quality_states,
            )
            analysis = build_bal_biological_analysis(
                calculation=pipeline.calculation,
                analysis_id=request.analysis_id,
                generated_at=datetime.now(timezone.utc),
                engine_version=__version__,
                organization_id=str(request.organization_id),
                subject_id=str(request.subject_id),
                subject_type=request.subject_type,
            )
            return {
                "analysis": analysis.model_dump(mode="json", by_alias=True),
                "pipeline": {
                    "input_row_count": pipeline.input_row_count,
                    "candidate_row_count": pipeline.candidate_row_count,
                    "ignored_out_of_scope_count": pipeline.ignored_out_of_scope_count,
                    "rejected_rows": jsonable_encoder(pipeline.rejected_rows),
                },
            }
        except (TypeError, ValueError) as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    @app.post("/v1/analyses/sensors", dependencies=[Depends(require_internal_key)])
    def create_sensor_analysis(request: SensorAnalysisRequest):
        try:
            envelopes = tuple(
                normalize_iot_measurement_row(row)
                for row in request.measurements
            )

            class RequestRepository:
                """Request-scoped adapter; all reads and authorization happened in the gateway."""
                def list_for_scope(self, **kwargs):
                    if kwargs != {
                        "organization_id": str(request.organization_id),
                        "environment_id": str(request.environment_id),
                        "from_date": request.from_date,
                        "to_date": request.to_date,
                    }:
                        raise ValueError("sensor repository scope mismatch")
                    return envelopes

            analysis = run_sensor_analysis(
                repository=RequestRepository(),
                organization_id=str(request.organization_id),
                environment_id=str(request.environment_id),
                from_date=request.from_date,
                to_date=request.to_date,
                profile_timezone=request.profile_timezone,
                expected_interval_seconds=request.expected_interval_seconds,
            )
            temporal_screening = {"status": "not_requested", "assessments": []}
            scoped_assessments = ()
            if request.temporal_window_seconds is not None:
                profile_zone = ZoneInfo(request.profile_timezone)
                evaluation_start = datetime.combine(
                    request.from_date, time.min, tzinfo=profile_zone
                ).astimezone(timezone.utc)
                evaluation_end = datetime.combine(
                    request.to_date + timedelta(days=1),
                    time.min,
                    tzinfo=profile_zone,
                ).astimezone(timezone.utc)
                assessments = assess_sensor_temporal_anomalies(
                    envelopes,
                    window_seconds=request.temporal_window_seconds,
                    minimum_history=request.temporal_minimum_history,
                    threshold=request.temporal_threshold,
                )
                scoped_assessments = tuple(
                    item for item in assessments
                    if evaluation_start <= item.observed_at < evaluation_end
                )
                temporal_screening = {
                    "status": "completed",
                    "assessments": jsonable_encoder(scoped_assessments),
                }
            flatline_diagnostics = {"status": "not_requested", "assessments": []}
            if request.flatline_minimum_repeated_observations is not None:
                profile_zone = ZoneInfo(request.profile_timezone)
                scoped_envelopes = tuple(
                    envelope for envelope in envelopes
                    if request.from_date <= envelope.measurement.observed_at.astimezone(profile_zone).date() <= request.to_date
                )
                flatline_assessments = assess_sensor_flatlines(
                    scoped_envelopes,
                    minimum_repeated_observations=request.flatline_minimum_repeated_observations,
                    minimum_duration_seconds=request.flatline_minimum_duration_seconds,
                )
                flatline_diagnostics = {
                    "status": "completed",
                    "assessments": jsonable_encoder(flatline_assessments),
                }
            drift_diagnostics = {"status": "not_requested", "assessments": []}
            if request.drift_policies:
                drift_policies = tuple(
                    SensorDriftPolicy(
                        target_sensor_id=item.target_sensor_id,
                        reference_sensor_id=item.reference_sensor_id,
                        variable_code=item.variable_code,
                        reference_binding_verified=item.reference_binding_verified,
                        maximum_pair_offset_seconds=item.maximum_pair_offset_seconds,
                        minimum_pairs=item.minimum_pairs,
                        minimum_duration_seconds=item.minimum_duration_seconds,
                        maximum_abs_drift_rate_per_hour=float(item.maximum_abs_drift_rate_per_hour),
                    )
                    for item in request.drift_policies
                )
                profile_zone = ZoneInfo(request.profile_timezone)
                drift_envelopes = tuple(
                    envelope for envelope in envelopes
                    if request.from_date <= envelope.measurement.observed_at.astimezone(profile_zone).date() <= request.to_date
                )
                drift_assessments = assess_sensor_drift(drift_envelopes, drift_policies)
                drift_diagnostics = {
                    "status": "completed",
                    "assessments": jsonable_encoder(drift_assessments),
                }

            transmission_diagnostics = {"status": "not_requested", "assessments": []}
            if request.transmission_expected_interval_seconds is not None:
                profile_zone = ZoneInfo(request.profile_timezone)
                evaluation_start = datetime.combine(
                    request.from_date, time.min, tzinfo=profile_zone
                ).astimezone(timezone.utc)
                evaluation_end = datetime.combine(
                    request.to_date + timedelta(days=1),
                    time.min,
                    tzinfo=profile_zone,
                ).astimezone(timezone.utc)
                device_inputs = tuple(
                    SensorDeviceTransmission(
                        device_id=item.device_id,
                        device_code=item.device_code,
                        enabled=item.enabled,
                        created_at=item.created_at,
                        profile_bound=item.profile_bound,
                        expected_from=datetime.combine(
                            item.expected_from, time.min, tzinfo=profile_zone
                        ).astimezone(timezone.utc),
                        expected_to=(
                            datetime.combine(
                                item.expected_to + timedelta(days=1),
                                time.min,
                                tzinfo=profile_zone,
                            ).astimezone(timezone.utc)
                            if item.expected_to is not None else None
                        ),
                        last_seen_at=item.last_seen_at,
                    )
                    for item in request.transmission_devices or []
                )
                receipt_inputs = tuple(
                    SensorTransmissionReceipt(
                        receipt_id=item.receipt_id,
                        device_id=item.device_id,
                        received_at=item.received_at,
                    )
                    for item in request.transmission_receipts or []
                )
                assessments = assess_sensor_transmissions(
                    device_inputs,
                    receipt_inputs,
                    evaluation_start=evaluation_start,
                    evaluation_end=evaluation_end,
                    evaluated_at=datetime.now(timezone.utc),
                    expected_interval_seconds=request.transmission_expected_interval_seconds,
                    gap_tolerance_factor=request.transmission_gap_tolerance_factor,
                    current_window=request.transmission_current_window,
                )
                transmission_diagnostics = {
                    "status": "completed",
                    "assessments": jsonable_encoder(assessments),
                }

            interpretation_status = "not_requested"
            domain_interpretation = None
            recommendation_resolution = None
            if request.biological_interpretation is not None:
                try:
                    biological_context = BiologicalContext.model_validate(
                        request.biological_interpretation["biological_context"]
                    )
                    environment_context = EnvironmentContext.model_validate(
                        request.biological_interpretation["environment_context"]
                    )
                    domain_profile = DomainProfile.model_validate(
                        request.biological_interpretation["domain_profile"]
                    )
                    if (
                        environment_context.context_id != request.environment_id
                        or environment_context.organization_id != request.organization_id
                        or environment_context.timezone != request.profile_timezone
                    ):
                        raise ValueError("resolved sensor environment profile does not match request scope")
                    if any(
                        envelope.measurement.location_id != environment_context.location_id
                        for envelope in envelopes
                    ):
                        raise ValueError("sensor measurements do not match the resolved environment location")
                    interpretation = interpret_sensor_analysis_for_biological_context(
                        analysis,
                        domain_profile,
                        biological_context,
                        environment_context,
                        source_analysis_id=request.analysis_id,
                        from_date=request.from_date,
                        to_date=request.to_date,
                        temporal_assessments=scoped_assessments,
                        temporal_parameters=(
                            {
                                "temporal_window_seconds": request.temporal_window_seconds,
                                "temporal_minimum_history": request.temporal_minimum_history,
                                "temporal_threshold": request.temporal_threshold,
                            }
                            if request.temporal_window_seconds is not None
                            else None
                        ),
                    )
                    interpretation_status = "interpreted"
                    domain_interpretation = jsonable_encoder(interpretation)
                    recommendation_resolution = jsonable_encoder(
                        resolve_recommendations(interpretation, domain_profile)
                    )
                except (KeyError, TypeError, ValueError, ValidationError):
                    interpretation_status = "context_invalid"

            return {
                "analysis_id": str(request.analysis_id),
                "source": "iot_sensor",
                "analysis": analysis,
                "temporal_screening": temporal_screening,
                "instrument_health": {
                    "flatline_diagnostics": flatline_diagnostics,
                    "transmission_diagnostics": transmission_diagnostics,
                    "drift_diagnostics": drift_diagnostics,
                },
                "interpretation_status": interpretation_status,
                "domain_interpretation": domain_interpretation,
                "recommendation_resolution": recommendation_resolution,
            }
        except (ValueError, LookupError) as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc


    @app.post("/v1/sentinel2/process-and-persist", dependencies=[Depends(require_internal_key)])
    def process_and_persist_sentinel2(
        request: Sentinel2WorkerRequest,
        authorization: Annotated[str | None, Header(alias="Authorization")] = None,
    ):
        ingest_url = os.getenv("BA_SENTINEL2_INGEST_URL")
        worker_secret = os.getenv("BA_SENTINEL2_WORKER_SECRET")
        if not ingest_url or not worker_secret:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Sentinel-2 worker persistence is not configured",
            )
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="caller bearer token is required",
            )
        try:
            result = process_and_persist_sentinel2_batch(
                items=request.items,
                aoi_geojson=request.aoi_geojson,
                organization_id=request.organization_id,
                location_id=request.location_id,
                retrieved_at=request.retrieved_at,
                processing_version=request.processing_version,
                user_authorization=authorization,
                ingest_url=ingest_url,
                worker_secret=worker_secret,
                minimum_valid_ratio=request.minimum_valid_ratio,
                max_pixels=request.max_pixels,
                max_scenes=100,
            )
            return {
                "ok": True,
                "provider": "EARTH_SEARCH",
                "dataset": "SENTINEL_2_L2A",
                "items_received": result.items_received,
                "scenes_processed": result.scenes_processed,
                "scenes_failed": result.scenes_failed,
                "scenes_duplicated": result.scenes_duplicated,
                "quality_rejected_scenes": result.quality_rejected_scenes,
                "observations_submitted": result.observations_submitted,
                "persistence": result.persistence_response,
            }
        except Sentinel2PersistenceError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Sentinel-2 persistence boundary unavailable",
            ) from exc
        except (TypeError, ValueError) as exc:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    return app


app = create_app()
