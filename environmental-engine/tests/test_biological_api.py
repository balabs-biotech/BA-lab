from datetime import datetime, timezone
from uuid import uuid4

from fastapi.testclient import TestClient

from ba_environmental_engine.api.app import create_app


def biological_payload():
    organization_id = str(uuid4())
    culture_id = str(uuid4())
    return {
        "analysis_id": str(uuid4()),
        "organization_id": organization_id,
        "subject_id": culture_id,
        "subject_type": "culture",
        "variable_code": "colony_diameter",
        "variable_registry": {"colony_diameter": "mm"},
        "accepted_quality_states": ["validated"],
        "measurements": [
            {
                "id": str(uuid4()),
                "organization_id": organization_id,
                "culture_id": culture_id,
                "plant_culture_id": None,
                "sample_id": None,
                "experimental_unit_id": None,
                "variable_code": "colony_diameter",
                "raw_value": 12.0,
                "raw_unit_code": "mm",
                "normalized_value": 12.0,
                "normalized_unit_code": "mm",
                "measured_at": "2026-01-01T10:00:00+00:00",
                "quality_state": "validated",
            },
            {
                "id": str(uuid4()),
                "organization_id": organization_id,
                "culture_id": culture_id,
                "plant_culture_id": None,
                "sample_id": None,
                "experimental_unit_id": None,
                "variable_code": "colony_diameter",
                "raw_value": 24.0,
                "raw_unit_code": "mm",
                "normalized_value": 24.0,
                "normalized_unit_code": "mm",
                "measured_at": "2026-01-04T10:00:00+00:00",
                "quality_state": "validated",
            },
        ],
    }


def test_biological_performance_endpoint_requires_internal_key():
    client = TestClient(create_app(engine_api_key="test-secret"))
    response = client.post(
        "/v1/analyses/biological-performance",
        json=biological_payload(),
    )
    assert response.status_code == 401


def test_biological_performance_endpoint_returns_bal_envelope_and_pipeline_diagnostics():
    client = TestClient(create_app(engine_api_key="test-secret"))
    response = client.post(
        "/v1/analyses/biological-performance",
        json=biological_payload(),
        headers={"X-BA-Engine-Key": "test-secret"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    analysis = body["analysis"]
    assert analysis["contract_version"] == "1.0.0"
    assert analysis["engine"]["name"] == "ba-biological-performance"
    assert analysis["status"] == "calculated"
    assert analysis["metric"]["code"] == "extent_growth_rate"
    assert analysis["metric"]["value"] == 4.0
    assert analysis["metric"]["unit"] == "mm/day"
    assert analysis["evidence"]["accepted_count"] == 2
    assert len(analysis["evidence"]["accepted_source_record_ids"]) == 2
    assert body["pipeline"]["input_row_count"] == 2
    assert body["pipeline"]["candidate_row_count"] == 2
    assert body["pipeline"]["rejected_rows"] == []


def test_biological_performance_endpoint_rejects_cross_tenant_rows():
    request = biological_payload()
    request["measurements"][0]["organization_id"] = str(uuid4())
    client = TestClient(create_app(engine_api_key="test-secret"))
    response = client.post(
        "/v1/analyses/biological-performance",
        json=request,
        headers={"X-BA-Engine-Key": "test-secret"},
    )
    assert response.status_code == 422
    assert "organization" in str(response.json()["detail"])


def test_biological_performance_endpoint_returns_insufficient_evidence_without_zero():
    request = biological_payload()
    request["measurements"] = request["measurements"][:1]
    client = TestClient(create_app(engine_api_key="test-secret"))
    response = client.post(
        "/v1/analyses/biological-performance",
        json=request,
        headers={"X-BA-Engine-Key": "test-secret"},
    )
    assert response.status_code == 200, response.text
    analysis = response.json()["analysis"]
    assert analysis["status"] == "insufficient_evidence"
    assert analysis["metric"]["value"] is None
    assert analysis["reason"] == "at_least_two_quality_accepted_observations_required"
