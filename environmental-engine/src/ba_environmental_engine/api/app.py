"""Private FastAPI boundary for normalized environmental analysis requests.

The API is service-to-service only. Supabase Edge Functions remain responsible
for end-user JWT validation and tenant authorization before forwarding requests.
"""

from __future__ import annotations

import os
import secrets
from datetime import date, datetime, timezone
from typing import Annotated, Any, Literal
from uuid import UUID

from fastapi import Depends, FastAPI, Header, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field, model_validator

from ba_environmental_engine import __version__
from ba_environmental_engine.climate.aggregation import AggregationMethod
from ba_environmental_engine.execution import run_environmental_analysis
from ba_environmental_engine.sources.models import NormalizedEnvironmentalObservation


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


class AnalysisRequest(APIModel):
    analysis_id: UUID
    scope: AnalysisScopeInput
    latitude_deg: float = Field(ge=-90, le=90)
    altitude_m: float = Field(ge=-500, le=9000)
    observations: list[ObservationInput] = Field(min_length=1, max_length=5000)
    rolling_methods: dict[str, AggregationMethod] | None = None
    rolling_windows: tuple[int, ...] = (7, 14, 30, 90)
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


def create_app(engine_api_key: str | None = None) -> FastAPI:
    """Create the private API; inject a key explicitly in tests or use the env."""
    configured_key = engine_api_key or os.getenv("BA_ENVIRONMENTAL_ENGINE_API_KEY")
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

    return app


app = create_app()
