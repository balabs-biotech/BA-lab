"""Typed contracts for configurable biological-domain interpretation.

Rules are supplied by a domain profile. This package deliberately ships no
species-, crop-, strain-, substrate-, or laboratory-specific thresholds.
"""

from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


DomainModule = Literal["mycology", "greentech", "lab"]
FindingStatus = Literal[
    "normal",
    "suspect",
    "insufficient_history",
    "insufficient_coverage",
    "indeterminate",
]
SignalSeverity = Literal["info", "low", "moderate", "high", "critical"]


class InterpretationModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class InterpretationRule(InterpretationModel):
    rule_id: str = Field(min_length=1, max_length=100)
    variable_code: str = Field(min_length=1, max_length=120)
    finding_status: FindingStatus
    required_context_tags: frozenset[str] = frozenset()
    signal_code: str = Field(min_length=1, max_length=100)
    severity: SignalSeverity
    message_code: str = Field(min_length=1, max_length=120)
    recommendation_code: str | None = Field(default=None, max_length=120)


class DomainProfile(InterpretationModel):
    profile_id: str = Field(min_length=1, max_length=100)
    module: DomainModule
    version: str = Field(min_length=1, max_length=32)
    rules: tuple[InterpretationRule, ...] = ()

    @model_validator(mode="after")
    def validate_rule_ids(self):
        ids = [rule.rule_id for rule in self.rules]
        if len(ids) != len(set(ids)):
            raise ValueError("interpretation rule IDs must be unique within a profile")
        return self


class DomainSignal(InterpretationModel):
    signal_id: UUID
    profile_id: str
    profile_version: str
    module: DomainModule
    rule_id: str
    signal_code: str
    severity: SignalSeverity
    message_code: str
    recommendation_code: str | None
    source_analysis_id: UUID
    source_finding_id: UUID
    biological_context_id: UUID | None = None
    biological_subject_id: UUID | None = None
    environment_context_id: UUID | None = None
    source_observation_ids: tuple[UUID, ...]
    variable_code: str
    observed_date: date
    observed_value: float
    unit: str
    finding_status: FindingStatus
    context_tags: frozenset[str] = frozenset()


class DomainInterpretation(InterpretationModel):
    profile_id: str
    profile_version: str
    module: DomainModule
    signals: tuple[DomainSignal, ...] = ()
    evaluated_findings: int = Field(ge=0)
    matched_findings: int = Field(ge=0)
