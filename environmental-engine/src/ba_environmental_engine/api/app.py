"""Private FastAPI boundary for normalized environmental analysis requests.

The API is service-to-service only. Supabase Edge Functions remain responsible
for end-user JWT validation and tenant authorization before forwarding requests.
"""

from __future__ import annotations

import os
import secrets
from datetime import date, datetime, time, timedelta, timezone
from typing import Annotated, Any, Literal
from zoneinfo import ZoneInfo
from uuid import UUID

from fastapi import Depends, FastAPI, Header, HTTPException, status
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, ConfigDict, Field, StrictInt, ValidationError, model_validator

from ba_environmental_engine.contexts.biological import BiologicalContext
from ba_environmental_engine.contexts.environment import EnvironmentContext
from ba_environmental_engine.interpretation.models import DomainProfile
from ba_environmental_engine.interpretation.service import interpret_analysis_for_biological_context
from ba_environmental_engine.interpretation.sensor_service import interpret_sensor_analysis_for_biological_context

from ba_environmental_engine import __version__
from ba_environmental_engine.climate.aggregation import AggregationMethod
from ba_environmental_engine.execution import run_environmental_analysis, run_sensor_analysis
from ba_environmental_engine.sources.sensor import normalize_iot_measurement_row
from ba_environmental_engine.sources.sensor_temporal import assess_sensor_temporal_anomalies
from ba_environmental_engine.quality.sensor_health import assess_sensor_flatlines
from ba_environmental_engine.sources.models import NormalizedEnvironmentalObservation
from ba_environmental_engine.sources.nasa_power import normalize_nasa_power_observation


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
    biological_interpretation: dict[str, Any] | None = None
    measurements: list[dict[str, Any]] = Field(min_length=1, max_length=5000)

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
        )
        return response

    response.update(
        interpretation_status="interpreted",
        domain_interpretation=interpretation.model_dump(mode="json"),
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
            interpretation_status = "not_requested"
            domain_interpretation = None
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
                except (KeyError, TypeError, ValueError, ValidationError):
                    interpretation_status = "context_invalid"

            return {
                "analysis_id": str(request.analysis_id),
                "source": "iot_sensor",
                "analysis": analysis,
                "temporal_screening": temporal_screening,
                "instrument_health": {"flatline_diagnostics": flatline_diagnostics},
                "interpretation_status": interpretation_status,
                "domain_interpretation": domain_interpretation,
            }
        except (ValueError, LookupError) as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    return app


app = create_app()
