from datetime import date, datetime, timezone
from uuid import uuid4

from fastapi.testclient import TestClient

from ba_environmental_engine.api.app import create_app


VALUES = {
    "air_temperature_mean": (20.0, "degC"),
    "air_temperature_max": (25.0, "degC"),
    "air_temperature_min": (15.0, "degC"),
    "wind_speed_mean": (2.0, "m/s"),
    "solar_radiation_all_sky": (20.0, "MJ/m2"),
    "relative_humidity_mean": (60.0, "%"),
}


def payload():
    organization_id, location_id = str(uuid4()), str(uuid4())
    day = date(2026, 11, 1)
    observed_at = datetime(2026, 11, 1, 12, tzinfo=timezone.utc).isoformat()
    retrieved_at = datetime(2026, 11, 1, 14, tzinfo=timezone.utc).isoformat()
    observations = []
    for variable, (value, unit) in VALUES.items():
        observations.append({
            "source_observation_id": str(uuid4()),
            "organization_id": organization_id,
            "location_id": location_id,
            "data_family": "weather",
            "provider_code": "NASA_POWER",
            "dataset_code": "POWER_DAILY_AGRO",
            "source_parameter": variable,
            "variable_code": variable,
            "value": value,
            "unit": unit,
            "source_value": value,
            "source_unit": unit,
            "observed_at": observed_at,
            "observed_date": day.isoformat(),
            "retrieved_at": retrieved_at,
            "spatial_resolution_m": 55000.0,
            "quality_flag": None,
            "source_url": "https://power.larc.nasa.gov/",
            "source_time_standard": "NASA POWER daily local solar time",
            "source_metadata": {},
        })
    return {
        "analysis_id": str(uuid4()),
        "scope": {
            "organization_id": organization_id,
            "location_id": location_id,
            "from": day.isoformat(),
            "to": day.isoformat(),
        },
        "latitude_deg": 36.19,
        "altitude_m": 1000.0,
        "observations": observations,
    }


def test_private_analysis_endpoint_requires_internal_key():
    client = TestClient(create_app(engine_api_key="test-secret"))
    response = client.post("/v1/analyses", json=payload())
    assert response.status_code == 401


def test_private_analysis_endpoint_returns_validated_bal_analysis():
    client = TestClient(create_app(engine_api_key="test-secret"))
    response = client.post(
        "/v1/analyses",
        json=payload(),
        headers={"X-BA-Engine-Key": "test-secret"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["contract_version"] == "1.0.0"
    assert body["engine"]["name"] == "ba-environmental-intelligence"
    assert {item["code"] for item in body["indicators"]} == {
        "net_radiation_fao56_daily",
        "reference_et0_fao56_daily",
    }


def test_private_analysis_endpoint_rejects_cross_tenant_observation():
    request = payload()
    request["observations"][0]["organization_id"] = str(uuid4())
    client = TestClient(create_app(engine_api_key="test-secret"))
    response = client.post(
        "/v1/analyses",
        json=request,
        headers={"X-BA-Engine-Key": "test-secret"},
    )
    assert response.status_code == 422
    assert "requested organization" in str(response.json()["detail"])


def test_private_api_fails_closed_when_secret_is_not_configured():
    client = TestClient(create_app(engine_api_key=""))
    response = client.post(
        "/v1/analyses",
        json=payload(),
        headers={"X-BA-Engine-Key": "anything"},
    )
    assert response.status_code == 503
