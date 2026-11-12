from uuid import uuid4

import pytest

from ba_environmental_engine.interpretation.supabase_outcome_comparison_repository import (
    OutcomeCohortAssignment,
    OutcomeComparisonRepositoryError,
    SupabaseOutcomeComparisonRepository,
)


class Response:
    def __init__(self, data):
        self.data = data
        self.error = None


class Query:
    def __init__(self, client, table):
        self.client = client
        self.table_name = table
        self.filters = {}

    def select(self, _columns):
        return self

    def eq(self, key, value):
        self.filters[key] = value
        return self

    def in_(self, key, values):
        self.filters[key] = list(values)
        return self

    def limit(self, value):
        self.client.limits[self.table_name] = value
        return self

    def execute(self):
        self.client.calls.append((self.table_name, dict(self.filters)))
        rows = self.client.rows.get(self.table_name, [])
        for key, value in self.filters.items():
            if isinstance(value, list):
                rows = [row for row in rows if row.get(key) in value]
            else:
                rows = [row for row in rows if row.get(key) == value]
        return Response(rows)


class Client:
    def __init__(self, rows):
        self.rows = rows
        self.calls = []
        self.limits = {}

    def table(self, name):
        return Query(self, name)


def setup_rows():
    org = str(uuid4())
    rec_a, rec_b = str(uuid4()), str(uuid4())
    sig_a, sig_b = str(uuid4()), str(uuid4())
    signal_rows = [
        {"signal_id": sig_a, "biological_subject_id": "culture-a",
         "environment_id": "room-1", "domain": "mycology",
         "environment_profile_code": "fruiting", "environment_profile_version": "1.0",
         "domain_profile_code": "fruiting", "domain_profile_version": "1.2"},
        {"signal_id": sig_b, "biological_subject_id": "culture-b",
         "environment_id": "room-1", "domain": "mycology",
         "environment_profile_code": "fruiting", "environment_profile_version": "1.0"},
    ]
    recommendations = [
        {"recommendation_id": rec_a, "lifecycle_status": "outcome_recorded",
         "profile_id": "fruiting", "profile_version": "1.2", "module": "mycology",
         "source_signal_id": sig_a},
        {"recommendation_id": rec_b, "lifecycle_status": "outcome_recorded",
         "profile_id": "fruiting", "profile_version": "1.2", "module": "mycology",
         "source_signal_id": sig_b},
    ]
    evidence = [
        {"recommendation_id": rec_a, "outcome_event_id": "event-a",
         "measurement_id": "measure-a", "measurement_observed_at": "2026-11-10T10:00:00+00:00",
         "variable_code": "growth_extent", "measurement_quality_state": "validated",
         "normalized_value": 12, "normalized_unit_code": "mm",
         "raw_value": 11, "raw_unit_code": "mm", "method": "caliper",
         "instrument": "caliper-1", "evidence_scope": "biological_subject"},
        {"recommendation_id": rec_b, "outcome_event_id": "event-b",
         "measurement_id": "measure-b", "measurement_observed_at": "2026-11-10T11:00:00+00:00",
         "variable_code": "growth_extent", "measurement_quality_state": "controlled",
         "normalized_value": None, "normalized_unit_code": None,
         "raw_value": 15, "raw_unit_code": "mm", "method": "caliper",
         "instrument": "caliper-2", "evidence_scope": "biological_subject"},
        {"recommendation_id": rec_b, "outcome_event_id": "event-b",
         "measurement_id": "measure-c", "measurement_observed_at": "2026-11-10T11:30:00+00:00",
         "variable_code": "humidity", "measurement_quality_state": "validated",
         "normalized_value": 80, "normalized_unit_code": "%",
         "raw_value": 80, "raw_unit_code": "%", "method": "sensor",
         "instrument": "hygrometer", "evidence_scope": "environmental_context"},
    ]
    return org, rec_a, rec_b, Client({
        "biological_recommendations": recommendations,
        "biological_recommendation_outcome_measurements": evidence,
        "biological_signals": signal_rows,
    })


def assignments(rec_a, rec_b):
    return [
        OutcomeCohortAssignment(UUID(rec_a), "control", "Témoin"),
        OutcomeCohortAssignment(UUID(rec_b), "treated", "Traitement A"),
    ]


def test_loads_only_persisted_outcome_snapshots_with_explicit_cohort_assignment():
    org, rec_a, rec_b, client = setup_rows()
    dataset = SupabaseOutcomeComparisonRepository(user_client=client).load_dataset(
        organization_id=UUID(org), assignments=assignments(rec_a, rec_b)
    )
    assert len(dataset.observations) == 2
    assert dataset.observations[0].value == 12
    assert dataset.observations[0].quality_state == "validated"
    assert dataset.observations[1].value == 15
    assert dataset.observations[1].quality_state == "controlled"
    assert dataset.observations[0].subject_type == "biological_subject"
    assert dataset.observations[0].method == "caliper"
    assert dataset.observations[0].instrument == "caliper-1"
    assert dataset.observations[0].context_signature == dataset.observations[1].context_signature
    assert dataset.excluded_environmental_context_links == 1
    assert client.limits["biological_recommendations"] == 201
    assert client.limits["biological_recommendation_outcome_measurements"] == 2001
    assert all(filters["organization_id"] == org for _, filters in client.calls)


def test_refuses_recommendations_without_recorded_outcomes():
    org, rec_a, rec_b, client = setup_rows()
    client.rows["biological_recommendations"][0]["lifecycle_status"] = "executed"
    with pytest.raises(OutcomeComparisonRepositoryError, match="recorded outcome"):
        SupabaseOutcomeComparisonRepository(user_client=client).load_dataset(
            organization_id=UUID(org), assignments=assignments(rec_a, rec_b)
        )


def test_refuses_missing_or_cross_tenant_recommendation_ids():
    org, rec_a, rec_b, client = setup_rows()
    client.rows["biological_recommendations"].pop()
    with pytest.raises(OutcomeComparisonRepositoryError, match="unavailable"):
        SupabaseOutcomeComparisonRepository(user_client=client).load_dataset(
            organization_id=UUID(org), assignments=assignments(rec_a, rec_b)
        )


def test_duplicate_assignment_and_read_limits_are_rejected():
    org, rec_a, rec_b, client = setup_rows()
    repo = SupabaseOutcomeComparisonRepository(user_client=client, max_recommendations=1)
    with pytest.raises(ValueError, match="exactly one"):
        repo.load_dataset(
            organization_id=UUID(org),
            assignments=[OutcomeCohortAssignment(UUID(rec_a), "a", "A"),
                          OutcomeCohortAssignment(UUID(rec_a), "b", "B")],
        )
    with pytest.raises(OutcomeComparisonRepositoryError, match="limit"):
        repo.load_dataset(organization_id=UUID(org), assignments=assignments(rec_a, rec_b))


def test_unusable_measurement_is_reported_not_guessed():
    org, rec_a, rec_b, client = setup_rows()
    client.rows["biological_recommendation_outcome_measurements"][0]["normalized_value"] = None
    client.rows["biological_recommendation_outcome_measurements"][0]["raw_value"] = None
    dataset = SupabaseOutcomeComparisonRepository(user_client=client).load_dataset(
        organization_id=UUID(org), assignments=assignments(rec_a, rec_b)
    )
    assert dataset.excluded_unusable_measurements == 1
    assert len(dataset.observations) == 1


def test_missing_source_signal_is_a_hard_error():
    org, rec_a, rec_b, client = setup_rows()
    client.rows["biological_signals"].pop()
    with pytest.raises(OutcomeComparisonRepositoryError, match="source biological signals"):
        SupabaseOutcomeComparisonRepository(user_client=client).load_dataset(
            organization_id=UUID(org), assignments=assignments(rec_a, rec_b)
        )



def test_rejects_recommendation_profile_that_does_not_match_source_signal():
    org, rec_a, rec_b, client = setup_rows()
    client.rows["biological_signals"][0]["domain_profile_version"] = "9.9"
    with pytest.raises(OutcomeComparisonRepositoryError, match="profile does not match"):
        SupabaseOutcomeComparisonRepository(user_client=client).load_dataset(
            organization_id=UUID(org), assignments=assignments(rec_a, rec_b)
        )


def test_rejects_naive_snapshot_timestamps():
    org, rec_a, rec_b, client = setup_rows()
    client.rows["biological_recommendation_outcome_measurements"][0][
        "measurement_observed_at"
    ] = "2026-11-10T10:00:00"
    with pytest.raises(OutcomeComparisonRepositoryError, match="must include a timezone"):
        SupabaseOutcomeComparisonRepository(user_client=client).load_dataset(
            organization_id=UUID(org), assignments=assignments(rec_a, rec_b)
        )
