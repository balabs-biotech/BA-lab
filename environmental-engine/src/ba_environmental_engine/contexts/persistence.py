"""CultureOps row mapping and injected PostgREST persistence adapter.

The row mappers are pure. The repository uses a duck-typed, already-authenticated
client supplied by the application boundary; it imports no Supabase SDK and does
not create clients, manage credentials, or own authentication.
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

class SupabaseBiologicalContextRepository:
    """Small PostgREST adapter for persisted biological contexts.

    The Supabase client is injected by the application boundary. This package
    does not create clients, read credentials, or own authentication. Tenant
    filtering is explicit even though PostgreSQL RLS remains authoritative.
    """

    _SELECT = (
        "*,environment:environments!biological_contexts_environment_fk(location_id)"
    )

    def __init__(self, client: Any):
        self._client = client

    @staticmethod
    def _data(response: Any) -> Any:
        if not hasattr(response, "data"):
            raise RuntimeError("Supabase response does not expose data")
        return response.data

    def get_by_id(
        self, *, organization_id: str, context_id: str
    ) -> BiologicalContext | None:
        response = (
            self._client.table("biological_contexts")
            .select(self._SELECT)
            .eq("organization_id", organization_id)
            .eq("id", context_id)
            .maybe_single()
            .execute()
        )
        record = self._data(response)
        return biological_context_from_record(record) if record else None

    def list_for_subject(
        self,
        *,
        organization_id: str,
        domain: BiologicalDomain,
        subject_id: str,
        on_date: str | None = None,
    ) -> tuple[BiologicalContext, ...]:
        subject_column = (
            "plant_culture_id"
            if domain is BiologicalDomain.GREENTECH
            else "culture_id"
        )
        response = (
            self._client.table("biological_contexts")
            .select(self._SELECT)
            .eq("organization_id", organization_id)
            .eq("domain", domain.value)
            .eq(subject_column, subject_id)
            .order("valid_from", desc=True)
            .execute()
        )
        records = self._data(response) or []
        contexts = tuple(biological_context_from_record(row) for row in records)
        if on_date is None:
            return contexts
        from datetime import date

        target_date = date.fromisoformat(on_date)
        return tuple(
            context
            for context in contexts
            if context.valid_from <= target_date
            and (context.valid_to is None or target_date <= context.valid_to)
        )

    def list_overlapping_scope(
        self,
        *,
        organization_id: str,
        domain: BiologicalDomain,
        subject_id: str,
        from_date: str,
        to_date: str,
    ) -> tuple[BiologicalContext, ...]:
        """Fetch only contexts whose validity interval intersects a date scope."""
        if to_date < from_date:
            raise ValueError("scope to_date must be on or after from_date")
        subject_column = (
            "plant_culture_id"
            if domain is BiologicalDomain.GREENTECH
            else "culture_id"
        )
        response = (
            self._client.table("biological_contexts")
            .select(self._SELECT)
            .eq("organization_id", organization_id)
            .eq("domain", domain.value)
            .eq(subject_column, subject_id)
            .lte("valid_from", to_date)
            .or_(f"valid_to.is.null,valid_to.gte.{from_date}")
            .order("valid_from", desc=True)
            .execute()
        )
        records = self._data(response) or []
        return tuple(biological_context_from_record(row) for row in records)

    def get_for_subject_on_date(
        self,
        *,
        organization_id: str,
        domain: BiologicalDomain,
        subject_id: str,
        on_date: str,
    ) -> BiologicalContext | None:
        """Resolve one context for a subject/date; reject overlapping matches."""
        matches = self.list_for_subject(
            organization_id=organization_id,
            domain=domain,
            subject_id=subject_id,
            on_date=on_date,
        )
        if len(matches) > 1:
            raise ValueError(
                "multiple biological contexts overlap this subject and date; "
                "resolve the validity intervals before interpretation"
            )
        return matches[0] if matches else None

    def create(self, context: BiologicalContext) -> BiologicalContext:
        response = (
            self._client.table("biological_contexts")
            .insert(biological_context_to_record(context))
            .select(self._SELECT)
            .single()
            .execute()
        )
        record = self._data(response)
        if not record:
            raise RuntimeError("Supabase insert returned no biological context")
        return biological_context_from_record(record)

    def update(self, context: BiologicalContext) -> BiologicalContext:
        record = biological_context_to_record(context)
        record.pop("id")
        record.pop("organization_id")
        response = (
            self._client.table("biological_contexts")
            .update(record)
            .eq("organization_id", str(context.organization_id))
            .eq("id", str(context.context_id))
            .select(self._SELECT)
            .maybe_single()
            .execute()
        )
        updated = self._data(response)
        if not updated:
            raise LookupError("biological context was not found or is not writable")
        return biological_context_from_record(updated)
