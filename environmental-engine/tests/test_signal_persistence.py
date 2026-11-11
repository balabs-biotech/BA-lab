from datetime import date
from uuid import uuid4

import pytest

from ba_environmental_engine.contexts.biological import BiologicalContext
from ba_environmental_engine.contexts.environment import (
    EnvironmentContext,
    EnvironmentType,
    ObservationOrigin,
)
from ba_environmental_engine.interpretation.models import DomainInterpretation, DomainSignal
from ba_environmental_engine.interpretation.signal_persistence import (
    BiologicalSignalPersistenceError,
    SupabaseBiologicalSignalRepository,
    _SIGNAL_BATCH_SIZE,
    _SIGNAL_CONFLICT_KEY,
)


class FakeResponse:
    def __init__(self, data):
        self.data = data


class FakeQuery:
    def __init__(self, client, table):
        self.client = client
        self.table_name = table
        self.payload = None
        self.filters = []

    def upsert(self, payload, *, on_conflict, ignore_duplicates):
        self.payload = payload
        self.client.upsert_calls.append(
            (self.table_name, payload, on_conflict, ignore_duplicates)
        )
        return self

    def select(self, columns):
        self.client.select_calls.append((self.table_name, columns))
        return self

    def eq(self, key, value):
        self.filters.append((key, "eq", value))
        return self

    def in_(self, key, values):
        self.filters.append((key, "in", values))
        return self

    def execute(self):
        if self.payload is not None:
            existing = {
                row["signal_id"]: row for row in self.client.rows
            }
            for row in self.payload:
                # Mimic the DB's immutable idempotency conflict: never replace
                # an existing row or its operational signal_status.
                existing.setdefault(row["signal_id"], row)
            self.client.rows = list(existing.values())
            return FakeResponse([])
        wanted = set()
        for key, operator, value in self.filters:
            if key == "signal_id" and operator == "in":
                wanted = set(value)
        organization = next(
            value for key, operator, value in self.filters
            if key == "organization_id" and operator == "eq"
        )
        return FakeResponse([
            row for row in self.client.rows
            if row["organization_id"] == organization
            and row["signal_id"] in wanted
        ])


class FakeSupabase:
    def __init__(self, rows=None):
        self.rows = list(rows or [])
        self.upsert_calls = []
        self.select_calls = []

    def table(self, name):
        assert name == "biological_signals"
        return FakeQuery(self, name)


def make_contexts():
    organization_id = uuid4()
    environment = EnvironmentContext(
        context_id=uuid4(),
        organization_id=organization_id,
        location_id=uuid4(),
        context_type=EnvironmentType.FRUITING_CHAMBER,
        label="Pleurotus fruiting room",
        timezone="Africa/Algiers",
        origin=ObservationOrigin.SENSOR,
        sensor_ids=[uuid4()],
        profile_code="fruiting-room",
        profile_version="1.2.0",
    )
    biological = BiologicalContext(
        context_id=uuid4(),
        subject_id=uuid4(),
        organization_id=organization_id,
        location_id=environment.location_id,
        environment_context_id=environment.context_id,
        domain="mycology",
        organism_kind="fungus",
        taxon_code="pleurotus_ostreatus",
        strain_code="BA-P80",
        culture_stage="fruiting",
        production_system="fruiting_chamber",
        valid_from=date(2026, 10, 1),
    )
    signal = DomainSignal(
        signal_id=uuid4(),
        profile_id="mycology-fruiting",
        profile_version="2.0.0",
        module="mycology",
        rule_id="temperature-review",
        signal_code="fruiting_environment_review",
        severity="moderate",
        message_code="temperature_deviation_review",
        recommendation_code="review_fruiting_airflow",
        source_analysis_id=uuid4(),
        source_finding_id=uuid4(),
        biological_context_id=biological.context_id,
        biological_subject_id=biological.subject_id,
        environment_context_id=environment.context_id,
        source_observation_ids=(uuid4(), uuid4()),
        variable_code="air_temperature_mean",
        observed_date=date(2026, 11, 11),
        observed_value=28.5,
        unit="degC",
        finding_status="suspect",
        context_tags=frozenset({"stage:fruiting", "strain:BA-P80"}),
    )
    interpretation = DomainInterpretation(
        profile_id="mycology-fruiting",
        profile_version="2.0.0",
        module="mycology",
        signals=(signal,),
        evaluated_findings=1,
        matched_findings=1,
    )
    return organization_id, biological, environment, interpretation, signal


def test_repository_persists_signal_with_full_tenant_and_profile_lineage():
    organization_id, biological, environment, interpretation, signal = make_contexts()
    client = FakeSupabase()
    repository = SupabaseBiologicalSignalRepository(client)

    persisted = repository.persist_interpretation(
        organization_id=organization_id,
        interpretation=interpretation,
        biological_context=biological,
        environment_context=environment,
    )

    assert len(persisted) == 1
    row = persisted[0]
    assert row["signal_id"] == str(signal.signal_id)
    assert row["organization_id"] == str(organization_id)
    assert row["source_analysis_id"] == str(signal.source_analysis_id)
    assert row["source_finding_id"] == str(signal.source_finding_id)
    assert row["biological_context_id"] == str(biological.context_id)
    assert row["biological_subject_id"] == str(biological.subject_id)
    assert row["environment_id"] == str(environment.context_id)
    assert row["domain_profile_code"] == interpretation.profile_id
    assert row["domain_profile_version"] == interpretation.profile_version
    assert row["environment_profile_code"] == environment.profile_code
    assert row["environment_profile_version"] == environment.profile_version
    assert row["source_observation_ids"] == [
        str(item) for item in signal.source_observation_ids
    ]
    assert row["context_tags"] == ["stage:fruiting", "strain:BA-P80"]

    table, payload, conflict_key, ignore_duplicates = client.upsert_calls[0]
    assert table == "biological_signals"
    assert payload[0]["signal_id"] == str(signal.signal_id)
    assert conflict_key == _SIGNAL_CONFLICT_KEY
    assert ignore_duplicates is True
    assert client.select_calls == [("biological_signals", "*")]


def test_repository_empty_interpretation_does_not_call_supabase():
    organization_id, biological, environment, interpretation, _ = make_contexts()
    empty = interpretation.model_copy(update={"signals": ()})
    client = FakeSupabase()

    result = SupabaseBiologicalSignalRepository(client).persist_interpretation(
        organization_id=organization_id,
        interpretation=empty,
        biological_context=biological,
        environment_context=environment,
    )

    assert result == ()
    assert client.upsert_calls == []
    assert client.select_calls == []


def test_repository_rejects_cross_tenant_context_before_database_write():
    organization_id, biological, environment, interpretation, _ = make_contexts()
    other_org = uuid4()
    foreign_context = biological.model_copy(update={"organization_id": other_org})
    client = FakeSupabase()

    with pytest.raises(ValueError, match="another organization"):
        SupabaseBiologicalSignalRepository(client).persist_interpretation(
            organization_id=organization_id,
            interpretation=interpretation,
            biological_context=foreign_context,
            environment_context=environment,
        )

    assert client.upsert_calls == []


def test_repository_rejects_signal_with_mismatched_environment_lineage():
    organization_id, biological, environment, interpretation, signal = make_contexts()
    bad_signal = signal.model_copy(update={"environment_context_id": uuid4()})
    bad_interpretation = interpretation.model_copy(update={"signals": (bad_signal,)})
    client = FakeSupabase()

    with pytest.raises(ValueError, match="environment differs"):
        SupabaseBiologicalSignalRepository(client).persist_interpretation(
            organization_id=organization_id,
            interpretation=bad_interpretation,
            biological_context=biological,
            environment_context=environment,
        )

    assert client.upsert_calls == []


def test_repository_fails_closed_when_persisted_signal_cannot_be_reloaded():
    organization_id, biological, environment, interpretation, _ = make_contexts()
    client = FakeSupabase()
    client.rows = []
    original_table = client.table

    def table_without_rows(name):
        query = original_table(name)
        if client.upsert_calls:
            query.execute = lambda: FakeResponse([])
        return query

    client.table = table_without_rows
    with pytest.raises(BiologicalSignalPersistenceError, match="could not be verified"):
        SupabaseBiologicalSignalRepository(client).persist_interpretation(
            organization_id=organization_id,
            interpretation=interpretation,
            biological_context=biological,
            environment_context=environment,
        )


def test_repository_replay_does_not_overwrite_operational_signal_status():
    organization_id, biological, environment, interpretation, _ = make_contexts()
    client = FakeSupabase()
    repository = SupabaseBiologicalSignalRepository(client)

    repository.persist_interpretation(
        organization_id=organization_id,
        interpretation=interpretation,
        biological_context=biological,
        environment_context=environment,
    )
    client.rows[0]["signal_status"] = "acknowledged"

    persisted = repository.persist_interpretation(
        organization_id=organization_id,
        interpretation=interpretation,
        biological_context=biological,
        environment_context=environment,
    )

    assert persisted[0]["signal_status"] == "acknowledged"


def test_repository_rejects_replay_with_changed_immutable_scientific_content():
    organization_id, biological, environment, interpretation, signal = make_contexts()
    client = FakeSupabase()
    repository = SupabaseBiologicalSignalRepository(client)
    repository.persist_interpretation(
        organization_id=organization_id,
        interpretation=interpretation,
        biological_context=biological,
        environment_context=environment,
    )
    changed_signal = signal.model_copy(
        update={"message_code": "different_scientific_interpretation"}
    )
    changed_interpretation = interpretation.model_copy(
        update={"signals": (changed_signal,)}
    )

    with pytest.raises(
        BiologicalSignalPersistenceError,
        match="conflicting immutable content",
    ):
        repository.persist_interpretation(
            organization_id=organization_id,
            interpretation=changed_interpretation,
            biological_context=biological,
            environment_context=environment,
        )


def test_repository_rejects_mixed_source_analyses_in_one_batch():
    organization_id, biological, environment, interpretation, signal = make_contexts()
    second_signal = signal.model_copy(
        update={"signal_id": uuid4(), "source_analysis_id": uuid4()}
    )
    mixed = interpretation.model_copy(
        update={"signals": (signal, second_signal)}
    )
    client = FakeSupabase()

    with pytest.raises(ValueError, match="one source analysis"):
        SupabaseBiologicalSignalRepository(client).persist_interpretation(
            organization_id=organization_id,
            interpretation=mixed,
            biological_context=biological,
            environment_context=environment,
        )

    assert client.upsert_calls == []


def test_repository_chunks_large_batches_below_postgrest_row_cap():
    organization_id, biological, environment, interpretation, signal = make_contexts()
    signals = tuple(
        signal.model_copy(
            update={
                "signal_id": uuid4(),
                "source_finding_id": uuid4(),
                "rule_id": f"rule-{index}",
            }
        )
        for index in range(_SIGNAL_BATCH_SIZE + 1)
    )
    large_interpretation = interpretation.model_copy(
        update={"signals": signals, "evaluated_findings": len(signals),
                "matched_findings": len(signals)}
    )
    client = FakeSupabase()

    persisted = SupabaseBiologicalSignalRepository(client).persist_interpretation(
        organization_id=organization_id,
        interpretation=large_interpretation,
        biological_context=biological,
        environment_context=environment,
    )

    assert len(persisted) == _SIGNAL_BATCH_SIZE + 1
    assert [len(call[1]) for call in client.upsert_calls] == [
        _SIGNAL_BATCH_SIZE,
        1,
    ]
