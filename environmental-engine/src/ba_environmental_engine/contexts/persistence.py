"""Persistence mapping between CultureOps rows and biological context contracts.

This module is intentionally database-client agnostic. Supabase/PostgREST access
stays at the application boundary; these functions only validate and translate
the stable row contract.
"""

from collections.abc import Mapping
from typing import Any

from ba_environmental_engine.contexts.biological import BiologicalContext, BiologicalDomain


def biological_context_from_record(record: Mapping[str, Any]) -> BiologicalContext:
    """Build a validated context from a row with its joined environment location.

    Expected relation shape is PostgREST's many-to-one object:
    environment:environments!inner(location_id).
    """
    culture_id = record.get("culture_id")
    plant_culture_id = record.get("plant_culture_id")
    if (culture_id is None) == (plant_culture_id is None):
        raise ValueError("database biological context must reference exactly one subject")

    domain = BiologicalDomain(record["domain"])
    if domain is BiologicalDomain.GREENTECH:
        if plant_culture_id is None or culture_id is not None:
            raise ValueError("biological context domain does not match its subject reference")
        subject_id = plant_culture_id
    else:
        if culture_id is None or plant_culture_id is not None:
            raise ValueError("biological context domain does not match its subject reference")
        subject_id = culture_id

    environment = record.get("environment")
    if not isinstance(environment, Mapping) or not environment.get("location_id"):
        raise ValueError("joined environment location is required for biological context analysis")

    tags = record.get("context_tags", [])
    if not isinstance(tags, (list, tuple)):
        raise ValueError("database context_tags must be an array")

    return BiologicalContext(
        context_id=record["id"],
        subject_id=subject_id,
        organization_id=record["organization_id"],
        location_id=environment["location_id"],
        environment_context_id=record["environment_id"],
        domain=domain,
        organism_kind=record["organism_kind"],
        taxon_code=record.get("taxon_code"),
        strain_code=record.get("strain_code"),
        cultivar_code=record.get("cultivar_code"),
        culture_stage=record["culture_stage"],
        substrate_code=record.get("substrate_code"),
        production_system=record["production_system"],
        context_tags=frozenset(tags),
        valid_from=record["valid_from"],
        valid_to=record.get("valid_to"),
    )


def biological_context_to_record(context: BiologicalContext) -> dict[str, Any]:
    """Serialize a context into insert/update columns for biological_contexts.

    location_id and subject_id are deliberately omitted: the database derives
    location through environments and stores the subject in its typed FK.
    """
    is_plant = context.domain is BiologicalDomain.GREENTECH
    return {
        "id": str(context.context_id),
        "organization_id": str(context.organization_id),
        "domain": context.domain.value,
        "culture_id": None if is_plant else str(context.subject_id),
        "plant_culture_id": str(context.subject_id) if is_plant else None,
        "environment_id": str(context.environment_context_id),
        "organism_kind": context.organism_kind.value,
        "taxon_code": context.taxon_code,
        "strain_code": context.strain_code,
        "cultivar_code": context.cultivar_code,
        "culture_stage": context.culture_stage,
        "substrate_code": context.substrate_code,
        "production_system": context.production_system,
        "context_tags": sorted(context.context_tags),
        "valid_from": context.valid_from.isoformat(),
        "valid_to": context.valid_to.isoformat() if context.valid_to else None,
    }