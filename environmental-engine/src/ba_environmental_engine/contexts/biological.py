"""Biological subject and cultivation context bound to an environment.

This contract describes what is being cultivated and where. It does not infer
biological identity, stage, substrate, or recommendations from sensor data.
"""

from datetime import date
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from ba_environmental_engine.contexts.environment import EnvironmentContext
from ba_environmental_engine.contracts.bal_json import AnalysisScope


class BiologicalDomain(str, Enum):
    MYCOLOGY = "mycology"
    GREENTECH = "greentech"
    LAB = "lab"


class OrganismKind(str, Enum):
    PLANT = "plant"
    FUNGUS = "fungus"
    FUNGAL_CONSORTIUM = "fungal_consortium"
    BACTERIUM = "bacterium"
    ARCHAEA = "archaea"
    MICROBIAL_CONSORTIUM = "microbial_consortium"
    OTHER = "other"


class BiologicalContext(BaseModel):
    """Version-neutral identity and operating context for one biological subject."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    context_id: str
    subject_id: str
    organization_id: str
    location_id: str
    environment_context_id: str
    domain: BiologicalDomain
    organism_kind: OrganismKind
    taxon_code: str | None = Field(default=None, min_length=1, max_length=120)
    strain_code: str | None = Field(default=None, min_length=1, max_length=120)
    cultivar_code: str | None = Field(default=None, min_length=1, max_length=120)
    culture_stage: str = Field(min_length=1, max_length=100)
    substrate_code: str | None = Field(default=None, min_length=1, max_length=120)
    production_system: str = Field(min_length=1, max_length=120)
    context_tags: frozenset[str] = frozenset()
    valid_from: date
    valid_to: date | None = None

    @field_validator(
        "context_id",
        "subject_id",
        "organization_id",
        "location_id",
        "environment_context_id",
    )
    @classmethod
    def identifiers_are_nonempty(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("identifiers must not be empty")
        return value

    @field_validator("context_tags")
    @classmethod
    def tags_are_nonempty(cls, value: frozenset[str]) -> frozenset[str]:
        if any(not tag.strip() for tag in value):
            raise ValueError("context_tags must not contain empty values")
        return value

    @model_validator(mode="after")
    def validate_biological_identity(self):
        if self.valid_to is not None and self.valid_to < self.valid_from:
            raise ValueError("valid_to must be on or after valid_from")
        if self.strain_code is not None and self.organism_kind not in {
            OrganismKind.FUNGUS,
            OrganismKind.FUNGAL_CONSORTIUM,
            OrganismKind.BACTERIUM,
            OrganismKind.ARCHAEA,
            OrganismKind.MICROBIAL_CONSORTIUM,
        }:
            raise ValueError("strain_code is only valid for microbial or fungal subjects")
        if self.cultivar_code is not None and self.organism_kind is not OrganismKind.PLANT:
            raise ValueError("cultivar_code is only valid for plant subjects")
        if self.domain is BiologicalDomain.MYCOLOGY and self.organism_kind not in {
            OrganismKind.FUNGUS,
            OrganismKind.FUNGAL_CONSORTIUM,
        }:
            raise ValueError("mycology domain requires a fungus or fungal consortium")
        if self.domain is BiologicalDomain.GREENTECH and self.organism_kind is not OrganismKind.PLANT:
            raise ValueError("greentech domain requires a plant subject")
        return self


def validate_biological_context_for_analysis(
    biological_context: BiologicalContext,
    environment_context: EnvironmentContext,
    analysis_scope: AnalysisScope,
) -> BiologicalContext:
    """Validate tenant, location, environment binding, and temporal overlap."""
    if (
        biological_context.organization_id != environment_context.organization_id
        or biological_context.location_id != environment_context.location_id
        or biological_context.environment_context_id != str(environment_context.context_id)
    ):
        raise ValueError("biological and environmental context organization and location binding must match")
    if (
        analysis_scope.organization_id != environment_context.organization_id
        or analysis_scope.location_id != environment_context.location_id
    ):
        raise ValueError("analysis scope organization and location must match the environment context")

    analysis_from = analysis_scope.from_date
    analysis_to = analysis_scope.to_date
    context_to = biological_context.valid_to or date.max
    if analysis_to < biological_context.valid_from or analysis_from > context_to:
        raise ValueError("analysis scope does not overlap biological context validity")
    return biological_context
