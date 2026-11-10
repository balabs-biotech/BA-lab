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
    assert len(body["findings"]) == len(VALUES)
    assert all(item["status"] == "insufficient_history" for item in body["findings"])
    assert all(len(item["source_observation_ids"]) == 1 for item in body["findings"])
    assert set(body["source_summary"][0]["variables"]) == set(VALUES)


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


def test_private_analysis_endpoint_rejects_boolean_rolling_window():
    request = payload()
    request["rolling_windows"] = [True]
    client = TestClient(create_app(engine_api_key="test-secret"))
    response = client.post(
        "/v1/analyses",
        json=request,
        headers={"X-BA-Engine-Key": "test-secret"},
    )
    assert response.status_code == 422


def test_private_analysis_endpoint_bounds_rolling_window_count():
    request = payload()
    request["rolling_windows"] = [1, 2, 3, 4, 5, 6, 7, 8, 9]
    client = TestClient(create_app(engine_api_key="test-secret"))
    response = client.post(
        "/v1/analyses",
        json=request,
        headers={"X-BA-Engine-Key": "test-secret"},
    )
    assert response.status_code == 422


def persisted_nasa_payload():
    request = payload()
    raw_parameters = {
        "air_temperature_mean": ("T2M", 20.0, "degC"),
        "air_temperature_max": ("T2M_MAX", 25.0, "degC"),
        "air_temperature_min": ("T2M_MIN", 15.0, "degC"),
        "wind_speed_mean": ("WS2M", 2.0, "m/s"),
        "solar_radiation_all_sky": ("ALLSKY_SFC_SW_DWN", 20.0 / 3.6, "kWh/m2/day"),
        "relative_humidity_mean": ("RH2M", 60.0, "%"),
    }
    rows = []
    for variable, (parameter, value, unit) in raw_parameters.items():
        rows.append({
            "id": str(uuid4()),
            "organization_id": request["scope"]["organization_id"],
            "location_id": request["scope"]["location_id"],
            "data_family": "weather",
            "provider_code": "NASA_POWER",
            "dataset_code": "POWER_DAILY_AGRO",
            "variable_code": variable,
            "value": value,
            "unit_code": unit,
            "observed_at": "2026-11-01T12:00:00+00:00",
            "retrieved_at": "2026-11-01T14:00:00+00:00",
            "spatial_resolution_m": 55000.0,
            "quality_flag": "gridded_estimate",
            "source_url": "https://power.larc.nasa.gov/",
            "metadata": {
                "source_parameter": parameter,
                "source_date": "2026-11-01",
                "source_time_standard": "NASA POWER daily local solar time",
            },
        })
    request["observations"] = rows
    return request


def test_nasa_power_api_normalizes_persisted_rows_and_preserves_lineage():
    client = TestClient(create_app(engine_api_key="test-secret"))
    response = client.post(
        "/v1/analyses/nasa-power",
        json=persisted_nasa_payload(),
        headers={"X-BA-Engine-Key": "test-secret"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    net_radiation = next(
        item for item in body["indicators"] if item["code"] == "net_radiation_fao56_daily"
    )
    solar_input = next(
        item for item in net_radiation["inputs"]
        if item["variable_code"] == "solar_radiation_all_sky"
    )
    assert solar_input["unit"] == "MJ/m2"
    assert len(solar_input["source_observation_ids"]) == 1
    assert body["source_summary"][0]["provider_code"] == "NASA_POWER"


def test_nasa_power_api_rejects_unknown_source_parameter():
    request = persisted_nasa_payload()
    request["observations"][0]["metadata"]["source_parameter"] = "UNRECOGNIZED"
    client = TestClient(create_app(engine_api_key="test-secret"))
    response = client.post(
        "/v1/analyses/nasa-power",
        json=request,
        headers={"X-BA-Engine-Key": "test-secret"},
    )
    assert response.status_code == 422
    assert "unsupported or missing NASA POWER source_parameter" in str(response.json()["detail"])


def test_nasa_power_api_requires_internal_key():
    client = TestClient(create_app(engine_api_key="test-secret"))
    response = client.post("/v1/analyses/nasa-power", json=persisted_nasa_payload())
    assert response.status_code == 401


def nasa_power_payload():
    request = payload()
    request["observations"] = []
    parameters = {
        "T2M": ("air_temperature_mean", 20.0, "degC"),
        "T2M_MAX": ("air_temperature_max", 25.0, "degC"),
        "T2M_MIN": ("air_temperature_min", 15.0, "degC"),
        "WS2M": ("wind_speed_mean", 2.0, "m/s"),
        "ALLSKY_SFC_SW_DWN": ("solar_radiation_all_sky", 5.0, "kWh/m2/day"),
        "RH2M": ("relative_humidity_mean", 60.0, "%"),
    }
    for parameter, (variable, value, unit) in parameters.items():
        request["observations"].append({
            "id": str(uuid4()),
            "organization_id": request["scope"]["organization_id"],
            "location_id": request["scope"]["location_id"],
            "data_family": "weather",
            "provider_code": "NASA_POWER",
            "dataset_code": "POWER_DAILY_AGRO",
            "variable_code": variable,
            "value": value,
            "unit_code": unit,
            "observed_at": "2026-11-01T12:00:00+00:00",
            "retrieved_at": "2026-11-01T14:00:00+00:00",
            "spatial_resolution_m": 55000.0,
            "quality_flag": None,
            "source_url": "https://power.larc.nasa.gov/",
            "metadata": {
                "source_parameter": parameter,
                "source_date": "2026-11-01",
                "source_time_standard": "NASA POWER daily local solar time",
            },
        })
    return request


def test_nasa_power_endpoint_normalizes_persisted_rows_and_preserves_provenance():
    client = TestClient(create_app(engine_api_key="test-secret"))
    response = client.post(
        "/v1/analyses/nasa-power",
        json=nasa_power_payload(),
        headers={"X-BA-Engine-Key": "test-secret"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["contract_version"] == "1.0.0"
    et0 = next(item for item in body["indicators"] if item["code"] == "reference_et0_fao56_daily")
    source_ids = {source_id for item in et0["inputs"] for source_id in item["source_observation_ids"]}
    assert len(source_ids) == 6


def test_nasa_power_endpoint_rejects_forged_provider_parameter_mapping():
    request = nasa_power_payload()
    request["observations"][0]["metadata"]["source_parameter"] = "T2M_MAX"
    client = TestClient(create_app(engine_api_key="test-secret"))
    response = client.post(
        "/v1/analyses/nasa-power",
        json=request,
        headers={"X-BA-Engine-Key": "test-secret"},
    )
    assert response.status_code == 422


def biological_interpretation_payload(request):
    scope = request["scope"]
    organization_id = scope["organization_id"]
    location_id = scope["location_id"]
    environment_id = str(uuid4())
    return {
        "biological_context": {
            "context_id": str(uuid4()),
            "subject_id": str(uuid4()),
            "organization_id": organization_id,
            "location_id": location_id,
            "environment_context_id": environment_id,
            "domain": "greentech",
            "organism_kind": "plant",
            "taxon_code": "solanum_lycopersicum",
            "cultivar_code": "yellow_pear",
            "culture_stage": "fruiting",
            "production_system": "greenhouse",
            "context_tags": ["production:protected"],
            "valid_from": "2026-11-01",
            "valid_to": "2026-11-01",
        },
        "environment_context": {
            "context_id": environment_id,
            "organization_id": organization_id,
            "location_id": location_id,
            "context_type": "outdoor",
            "label": "Site extérieur BA Labs",
            "timezone": "Africa/Algiers",
            "origin": "weather_provider",
            "sensor_ids": [],
            "profile_code": "ba_outdoor_weather",
            "profile_version": "1.0.0",
        },
        "domain_profile": {
            "profile_id": "greentech-default",
            "module": "greentech",
            "version": "1.0.0",
            "rules": [{
                "rule_id": "temperature-history-review",
                "variable_code": "air_temperature_mean",
                "finding_status": "insufficient_history",
                "required_context_tags": ["stage:fruiting"],
                "signal_code": "review_environmental_history",
                "severity": "info",
                "message_code": "environmental_history_incomplete",
                "recommendation_code": None,
            }],
        },
    }


def test_nasa_power_api_returns_domain_interpretation_as_sibling_without_mutating_climate_findings():
    request = nasa_power_payload()
    request["biological_interpretation"] = biological_interpretation_payload(request)
    client = TestClient(create_app(engine_api_key="test-secret"))

    response = client.post(
        "/v1/analyses/nasa-power",
        json=request,
        headers={"X-BA-Engine-Key": "test-secret"},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["interpretation_status"] == "interpreted"
    assert body["domain_interpretation"]["module"] == "greentech"
    assert body["domain_interpretation"]["matched_findings"] == 1
    assert body["domain_interpretation"]["signals"][0]["biological_subject_id"] == (
        request["biological_interpretation"]["biological_context"]["subject_id"]
    )
    assert len(body["findings"]) == 6
    assert {finding["status"] for finding in body["findings"]} == {"insufficient_history"}


def test_nasa_power_api_keeps_climate_analysis_when_biological_context_is_invalid():
    request = nasa_power_payload()
    interpretation = biological_interpretation_payload(request)
    interpretation["biological_context"]["location_id"] = str(uuid4())
    request["biological_interpretation"] = interpretation
    client = TestClient(create_app(engine_api_key="test-secret"))

    response = client.post(
        "/v1/analyses/nasa-power",
        json=request,
        headers={"X-BA-Engine-Key": "test-secret"},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["interpretation_status"] == "context_invalid"
    assert body["domain_interpretation"] is None
    assert len(body["indicators"]) == 2
    assert len(body["findings"]) == 6
