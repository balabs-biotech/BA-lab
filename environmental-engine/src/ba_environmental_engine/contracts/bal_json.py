"""Pydantic models for the versioned BA Labs analysis envelope."""

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ContractModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, allow_inf_nan=False)


class EngineIdentity(ContractModel):
    name: Literal["ba-environmental-intelligence"]
    version: str = Field(min_length=1, max_length=32)


class AnalysisScope(ContractModel):
    organization_id: UUID
    location_id: UUID
    from_date: date = Field(alias="from")
    to_date: date = Field(alias="to")

    @model_validator(mode="after")
    def validate_window(self):
        if self.to_date < self.from_date:
            raise ValueError("scope.to must be on or after scope.from")
        return self


class SourceSummary(ContractModel):
    provider_code: str = Field(min_length=1, max_length=80)
    dataset_code: str = Field(min_length=1, max_length=120)
    data_family: Literal["weather", "satellite"]
    variables: list[str] = Field(min_length=1)
    observations_count: int = Field(ge=1)
    observed_from: date
    observed_to: date
    latest_retrieved_at: datetime
    quality_class: Literal["measured", "gridded_estimate", "satellite_derived", "mixed"]
    spatial_resolution_m: float | None = Field(default=None, gt=0)
    source_urls: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_dates(self):
        if self.observed_to < self.observed_from:
            raise ValueError("source observed_to must not precede observed_from")
        return self


class IndicatorPeriod(ContractModel):
    from_date: date = Field(alias="from")
    to_date: date = Field(alias="to")
    aggregation: str = Field(min_length=1, max_length=40)

    @model_validator(mode="after")
    def validate_window(self):
        if self.to_date < self.from_date:
            raise ValueError("indicator period.to must be on or after period.from")
        return self


class IndicatorCoverage(ContractModel):
    expected: int = Field(gt=0)
    observed: int = Field(ge=0)
    ratio: float = Field(ge=0, le=1)

    @model_validator(mode="after")
    def validate_ratio(self):
        if self.observed > self.expected:
            raise ValueError("coverage.observed cannot exceed expected")
        expected_ratio = self.observed / self.expected
        if abs(self.ratio - expected_ratio) > 1e-9:
            raise ValueError("coverage.ratio must equal observed / expected")
        return self


class IndicatorQuality(ContractModel):
    quality_class: Literal["measured", "gridded_estimate", "satellite_derived", "mixed"] = Field(alias="class")
    flags: list[str] = Field(default_factory=list)


class IndicatorMethod(ContractModel):
    name: str = Field(min_length=1, max_length=80)
    version: str = Field(min_length=1, max_length=32)


class IndicatorInput(ContractModel):
    variable_code: str = Field(min_length=1, max_length=120)
    unit: str = Field(min_length=1, max_length=40)
    source_observation_ids: list[UUID] = Field(default_factory=list)


class Indicator(ContractModel):
    code: str = Field(min_length=1, max_length=120)
    label: str = Field(min_length=1, max_length=160)
    value: float | None
    unit: str = Field(min_length=1, max_length=40)
    period: IndicatorPeriod
    status: Literal["available", "insufficient_data", "not_applicable", "invalid_input"]
    coverage: IndicatorCoverage
    quality: IndicatorQuality
    method: IndicatorMethod
    inputs: list[IndicatorInput] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_value_status(self):
        if self.status == "available" and self.value is None:
            raise ValueError("available indicators must have a numeric value")
        if self.status != "available" and self.value is not None:
            raise ValueError("unavailable indicators must have value=null")
        return self


class AnomalyFinding(ContractModel):
    """A statistical signal, not a biological diagnosis or recommendation."""

    finding_id: UUID
    variable_code: str = Field(min_length=1, max_length=120)
    unit: str = Field(min_length=1, max_length=40)
    observed_date: date
    observed_value: float
    status: Literal[
        "normal",
        "suspect",
        "insufficient_history",
        "insufficient_coverage",
        "indeterminate",
    ]
    baseline_median: float | None
    baseline_mad: float | None
    robust_z_score: float | None
    history_count: int = Field(ge=0)
    coverage_ratio: float = Field(ge=0, le=1)
    flags: list[str] = Field(default_factory=list)
    method: IndicatorMethod
    source_observation_ids: list[UUID] = Field(default_factory=list)


class BALAnalysis(ContractModel):
    contract_version: Literal["1.0.0"]
    engine: EngineIdentity
    analysis_id: UUID
    generated_at: datetime
    scope: AnalysisScope
    source_summary: list[SourceSummary]
    indicators: list[Indicator]
    findings: list[AnomalyFinding] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_envelope(self):
        if self.generated_at.tzinfo is None or self.generated_at.utcoffset() is None:
            raise ValueError("generated_at must include a timezone")
        for finding in self.findings:
            if not self.scope.from_date <= finding.observed_date <= self.scope.to_date:
                raise ValueError("anomaly finding date must be contained within analysis scope")
        for indicator in self.indicators:
            if (
                indicator.period.from_date < self.scope.from_date
                or indicator.period.to_date > self.scope.to_date
            ):
                raise ValueError("indicator period must be contained within analysis scope")
        return self
