"""Versioned BAL envelope for biological performance calculations."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import Field, model_validator

from ba_environmental_engine.contracts.bal_json import ContractModel


class BiologicalEngineIdentity(ContractModel):
    name: Literal["ba-biological-performance"]
    version: str = Field(min_length=1, max_length=32)


class BiologicalSubject(ContractModel):
    id: str = Field(min_length=1, max_length=160)
    type: Literal["culture", "plant_culture", "sample", "experimental_unit"]


class BiologicalMetric(ContractModel):
    code: str = Field(min_length=1, max_length=120)
    value: float | None
    unit: str | None = Field(default=None, min_length=1, max_length=40)


class BiologicalFormula(ContractModel):
    code: str = Field(min_length=1, max_length=120)
    version: str = Field(min_length=1, max_length=32)


class BiologicalPeriod(ContractModel):
    from_datetime: datetime = Field(alias="from")
    to_datetime: datetime = Field(alias="to")

    @model_validator(mode="after")
    def validate_window(self):
        if self.to_datetime < self.from_datetime:
            raise ValueError("period.to must be on or after period.from")
        for value in (self.from_datetime, self.to_datetime):
            if value.tzinfo is None or value.utcoffset() is None:
                raise ValueError("biological period timestamps must include a timezone")
        return self


class BiologicalEvidence(ContractModel):
    accepted_source_record_ids: list[str] = Field(default_factory=list)
    excluded_source_record_ids: list[str] = Field(default_factory=list)
    accepted_count: int = Field(ge=0)
    excluded_count: int = Field(ge=0)

    @model_validator(mode="after")
    def validate_lineage(self):
        if self.accepted_count != len(self.accepted_source_record_ids):
            raise ValueError("accepted_count must match accepted source record IDs")
        if self.excluded_count != len(self.excluded_source_record_ids):
            raise ValueError("excluded_count must match excluded source record IDs")
        all_ids = self.accepted_source_record_ids + self.excluded_source_record_ids
        if len(all_ids) != len(set(all_ids)):
            raise ValueError("source record IDs must be unique and disjoint")
        if any(not item.strip() for item in all_ids):
            raise ValueError("source record IDs must not be empty")
        return self


class BALBiologicalAnalysis(ContractModel):
    contract_version: Literal["1.0.0"]
    engine: BiologicalEngineIdentity
    analysis_id: UUID
    generated_at: datetime
    organization_id: str = Field(min_length=1, max_length=160)
    subject: BiologicalSubject
    status: Literal["calculated", "insufficient_evidence"]
    metric: BiologicalMetric
    formula: BiologicalFormula
    period: BiologicalPeriod | None
    evidence: BiologicalEvidence
    reason: str | None = Field(default=None, max_length=240)

    @model_validator(mode="after")
    def validate_envelope(self):
        if self.generated_at.tzinfo is None or self.generated_at.utcoffset() is None:
            raise ValueError("generated_at must include a timezone")
        if self.status == "calculated":
            if self.metric.value is None or self.metric.unit is None:
                raise ValueError("calculated biological metrics require value and unit")
            if self.period is None:
                raise ValueError("calculated biological metrics require a period")
            if self.evidence.accepted_count < 2:
                raise ValueError("calculated biological metrics require at least two accepted observations")
            if self.reason is not None:
                raise ValueError("calculated biological metrics must not include an insufficiency reason")
        else:
            if self.metric.value is not None:
                raise ValueError("insufficient biological evidence must have value=null")
            if self.reason is None or not self.reason.strip():
                raise ValueError("insufficient biological evidence requires a reason")
        return self
