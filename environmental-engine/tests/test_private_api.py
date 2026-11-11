from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo
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


def test_nasa_power_interpretation_rejects_sensor_profile_without_relabeling_climate_data():
    request = nasa_power_payload()
    interpretation = biological_interpretation_payload(request)
    interpretation["environment_context"]["context_type"] = "greenhouse"
    interpretation["environment_context"]["origin"] = "sensor"
    interpretation["environment_context"]["sensor_ids"] = [str(uuid4())]
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


def sensor_payload():
    organization_id = str(uuid4())
    environment_id = str(uuid4())
    location_id = str(uuid4())
    sensor_id = str(uuid4())
    rows = []
    for index, value in enumerate((20.0, 22.0)):
        observation_id = str(uuid4())
        rows.append({
            "id": observation_id,
            "organization_id": organization_id,
            "environment_id": environment_id,
            "iot_device_id": sensor_id,
            "variable_code": "air_temperature",
            "raw_value": value,
            "raw_unit_code": "degC",
            "normalized_value": None,
            "normalized_unit_code": None,
            "measured_at": f"2026-03-01T0{index}:00:00+00:00",
            "method": "digital_probe",
            "instrument": "probe-01",
            "quality_state": "validated",
            "exclusion_reason": None,
            "metadata": {"source": "iot"},
            "device_organization_id": organization_id,
            "device_environment_id": environment_id,
            "environment_organization_id": organization_id,
            "location_id": location_id,
            "device_code": "sensor-01",
            "device_type": "environmental",
            "canonical_unit_code": "degC",
            "profile_origin": "sensor",
            "profile_status": "active",
            "profile_valid_from": "2026-03-01",
            "profile_valid_to": "2026-03-31",
            "profile_timezone": "Africa/Algiers",
            "profile_sensor_bound": True,
        })
    return {
        "analysis_id": str(uuid4()),
        "organization_id": organization_id,
        "environment_id": environment_id,
        "from_date": "2026-03-01",
        "to_date": "2026-03-01",
        "profile_timezone": "Africa/Algiers",
        "expected_interval_seconds": 3600,
        "measurements": rows,
    }


def test_sensor_analysis_endpoint_requires_internal_key():
    client = TestClient(create_app(engine_api_key="test-secret"))
    response = client.post("/v1/analyses/sensors", json=sensor_payload())
    assert response.status_code == 401


def test_sensor_analysis_endpoint_returns_separate_iot_result():
    client = TestClient(create_app(engine_api_key="test-secret"))
    response = client.post(
        "/v1/analyses/sensors",
        json=sensor_payload(),
        headers={"X-BA-Engine-Key": "test-secret"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["source"] == "iot_sensor"
    assert body["analysis"]["total_observations"] == 2
    assert body["analysis"]["series"][0]["variable_code"] == "air_temperature"
    assert body["analysis"]["series"][0]["mean"] == 21.0
    assert body["instrument_health"]["flatline_diagnostics"]["status"] == "not_requested"


def test_sensor_analysis_endpoint_rejects_cross_environment_measurement():
    request = sensor_payload()
    request["measurements"][0]["environment_id"] = str(uuid4())
    client = TestClient(create_app(engine_api_key="test-secret"))
    response = client.post(
        "/v1/analyses/sensors",
        json=request,
        headers={"X-BA-Engine-Key": "test-secret"},
    )
    assert response.status_code == 422
    assert "requested environment" in str(response.json()["detail"])


def test_sensor_analysis_endpoint_rejects_non_iot_provenance():
    request = sensor_payload()
    request["measurements"][0]["metadata"]["source"] = "NASA_POWER"
    client = TestClient(create_app(engine_api_key="test-secret"))
    response = client.post(
        "/v1/analyses/sensors",
        json=request,
        headers={"X-BA-Engine-Key": "test-secret"},
    )
    assert response.status_code == 422
    assert "IoT source row" in str(response.json()["detail"])


def test_sensor_analysis_endpoint_can_return_causal_temporal_screening():
    request = sensor_payload()
    template = request["measurements"][0]
    request["measurements"] = []
    for index, value in enumerate((10, 11, 12, 13, 14, 15, 16, 17, 100)):
        row = dict(template)
        row["id"] = str(uuid4())
        row["raw_value"] = value
        row["measured_at"] = f"2026-03-01T{index:02d}:00:00+00:00"
        request["measurements"].append(row)
    request["temporal_window_seconds"] = 9 * 60 * 60
    request["temporal_minimum_history"] = 7
    request["temporal_threshold"] = 3
    client = TestClient(create_app(engine_api_key="test-secret"))

    response = client.post(
        "/v1/analyses/sensors",
        json=request,
        headers={"X-BA-Engine-Key": "test-secret"},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["temporal_screening"]["status"] == "completed"
    final = body["temporal_screening"]["assessments"][-1]
    assert final["status"] == "suspect"
    assert final["history_count"] == 8
    assert final["observation_id"] == request["measurements"][-1]["id"]


def test_sensor_analysis_endpoint_requires_complete_temporal_screening_configuration():
    request = sensor_payload()
    request["temporal_window_seconds"] = 3600
    client = TestClient(create_app(engine_api_key="test-secret"))

    response = client.post(
        "/v1/analyses/sensors",
        json=request,
        headers={"X-BA-Engine-Key": "test-secret"},
    )

    assert response.status_code == 422
    assert "must be supplied together" in str(response.json()["detail"])


def sensor_biological_interpretation_payload(request):
    row = request["measurements"][0]
    return {
        "biological_context": {
            "context_id": str(uuid4()),
            "subject_id": str(uuid4()),
            "organization_id": request["organization_id"],
            "location_id": row["location_id"],
            "environment_context_id": request["environment_id"],
            "domain": "mycology",
            "organism_kind": "fungus",
            "taxon_code": "pleurotus_ostreatus",
            "strain_code": "HK35",
            "culture_stage": "fruiting",
            "production_system": "fruiting_chamber",
            "context_tags": ["production:protected"],
            "valid_from": request["from_date"],
            "valid_to": request["to_date"],
        },
        "environment_context": {
            "context_id": request["environment_id"],
            "organization_id": request["organization_id"],
            "location_id": row["location_id"],
            "context_type": "fruiting_chamber",
            "label": "Mycology fruiting room",
            "timezone": request["profile_timezone"],
            "origin": "sensor",
            "sensor_ids": [row["iot_device_id"]],
            "profile_code": "mycology-fruiting-room",
            "profile_version": "1.2.0",
        },
        "domain_profile": {
            "profile_id": "mycology-sensor-v1",
            "module": "mycology",
            "version": "1.0.0",
            "rules": [{
                "rule_id": "coverage-review",
                "variable_code": "air_temperature",
                "finding_status": "insufficient_coverage",
                "required_context_tags": ["stage:fruiting"],
                "signal_code": "sensor_coverage_review",
                "severity": "moderate",
                "message_code": "sensor_coverage_insufficient",
                "recommendation_code": None,
            }],
        },
    }


def test_sensor_analysis_api_interprets_with_validated_biological_context():
    request = sensor_payload()
    request["biological_interpretation"] = sensor_biological_interpretation_payload(request)
    client = TestClient(create_app(engine_api_key="test-secret"))

    response = client.post(
        "/v1/analyses/sensors",
        json=request,
        headers={"X-BA-Engine-Key": "test-secret"},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["interpretation_status"] == "interpreted"
    interpretation = body["domain_interpretation"]
    assert interpretation["module"] == "mycology"
    assert interpretation["matched_findings"] == 1
    signal = interpretation["signals"][0]
    assert signal["finding_status"] == "insufficient_coverage"
    assert signal["biological_context_id"] == request["biological_interpretation"]["biological_context"]["context_id"]
    assert signal["environment_context_id"] == request["environment_id"]
    assert len(signal["source_observation_ids"]) == 2


def test_sensor_analysis_api_keeps_sensor_result_when_biological_context_is_invalid():
    request = sensor_payload()
    interpretation = sensor_biological_interpretation_payload(request)
    interpretation["biological_context"]["environment_context_id"] = str(uuid4())
    request["biological_interpretation"] = interpretation
    client = TestClient(create_app(engine_api_key="test-secret"))

    response = client.post(
        "/v1/analyses/sensors",
        json=request,
        headers={"X-BA-Engine-Key": "test-secret"},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["interpretation_status"] == "context_invalid"
    assert body["domain_interpretation"] is None
    assert body["analysis"]["total_observations"] == 2


def test_sensor_temporal_suspect_is_routed_through_versioned_biological_profile():
    request = sensor_payload()
    template = request["measurements"][0]
    request["measurements"] = []
    for index, value in enumerate((10, 11, 12, 13, 14, 15, 16, 17, 100)):
        row = dict(template)
        row["id"] = str(uuid4())
        row["raw_value"] = value
        row["measured_at"] = f"2026-03-01T{index:02d}:00:00+00:00"
        request["measurements"].append(row)
    request["temporal_window_seconds"] = 9 * 60 * 60
    request["temporal_minimum_history"] = 7
    request["temporal_threshold"] = 3.5

    interpretation = sensor_biological_interpretation_payload(request)
    interpretation["domain_profile"]["rules"] = [{
        "rule_id": "fruiting-temperature-deviation",
        "variable_code": "air_temperature",
        "finding_status": "suspect",
        "required_context_tags": ["stage:fruiting"],
        "signal_code": "temperature_deviation_review",
        "severity": "high",
        "message_code": "temperature_deviation_review",
        "recommendation_code": "review_fruiting_conditions",
    }]
    request["biological_interpretation"] = interpretation
    client = TestClient(create_app(engine_api_key="test-secret"))

    response = client.post(
        "/v1/analyses/sensors",
        json=request,
        headers={"X-BA-Engine-Key": "test-secret"},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["temporal_screening"]["assessments"][-1]["status"] == "suspect"
    signals = body["domain_interpretation"]["signals"]
    assert len(signals) == 1
    signal = signals[0]
    assert signal["signal_code"] == "temperature_deviation_review"
    assert signal["finding_status"] == "suspect"
    assert signal["observed_value"] == 100
    assert signal["source_observation_ids"] == [request["measurements"][-1]["id"]]
    assert signal["evidence"]["assessment_type"] == "causal_robust_temporal_screen"
    assert signal["evidence"]["robust_z_score"] > 3.5
    assert signal["evidence"]["temporal_window_seconds"] == 9 * 60 * 60



def test_sensor_api_exposes_flatline_diagnostics_separately_from_biological_interpretation():
    request = sensor_payload()
    template = request["measurements"][0]
    request["measurements"] = []
    for index in range(3):
        row = dict(template)
        row["id"] = str(uuid4())
        row["raw_value"] = 20.0
        row["measured_at"] = f"2026-03-01T{index:02d}:00:00+00:00"
        request["measurements"].append(row)
    request["flatline_minimum_repeated_observations"] = 3
    request["flatline_minimum_duration_seconds"] = 7200

    client = TestClient(create_app(engine_api_key="test-secret"))
    response = client.post(
        "/v1/analyses/sensors",
        json=request,
        headers={"X-BA-Engine-Key": "test-secret"},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["instrument_health"]["flatline_diagnostics"]["status"] == "completed"
    assessment = body["instrument_health"]["flatline_diagnostics"]["assessments"][0]
    assert assessment["status"] == "suspected"
    assert assessment["longest_repeated_run"] == 3
    assert assessment["longest_repeated_duration_seconds"] == 7200
    assert body["interpretation_status"] == "not_requested"
    assert body["analysis"]["total_observations"] == 3


def test_sensor_api_rejects_partial_flatline_policy():
    request = sensor_payload()
    request["flatline_minimum_repeated_observations"] = 3

    client = TestClient(create_app(engine_api_key="test-secret"))
    response = client.post(
        "/v1/analyses/sensors",
        json=request,
        headers={"X-BA-Engine-Key": "test-secret"},
    )

    assert response.status_code == 422
    assert "flatline diagnostic parameters must be supplied together" in str(response.json()["detail"])


def test_sensor_api_exposes_device_transmission_diagnostics_separately():
    request = sensor_payload()
    sensor_id = request["measurements"][0]["iot_device_id"]
    device_id = sensor_id
    request["transmission_expected_interval_seconds"] = 3600
    request["transmission_gap_tolerance_factor"] = 2.0
    request["transmission_current_window"] = False
    request["transmission_devices"] = [{
        "device_id": device_id,
        "device_code": "sensor-01",
        "enabled": True,
        "created_at": "2026-02-27T00:00:00+00:00",
        "profile_bound": True,
        "expected_from": "2026-02-27",
        "expected_to": None,
    }]
    request["transmission_receipts"] = [
        {"receipt_id": str(uuid4()), "device_id": device_id, "received_at": f"2026-03-01T{hour:02d}:00:00+00:00"}
        for hour in (0, 1, 5, 6)
    ]

    client = TestClient(create_app(engine_api_key="test-secret"))
    response = client.post(
        "/v1/analyses/sensors",
        json=request,
        headers={"X-BA-Engine-Key": "test-secret"},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    diagnostics = body["instrument_health"]["transmission_diagnostics"]
    assert diagnostics["status"] == "completed"
    assert diagnostics["assessments"][0]["status"] == "irregular"
    assert diagnostics["assessments"][0]["gap_count"] == 1
    assert diagnostics["assessments"][0]["maximum_gap_seconds"] == 14400
    assert body["instrument_health"]["flatline_diagnostics"]["status"] == "not_requested"
    assert body["interpretation_status"] == "not_requested"


def test_sensor_api_reports_no_receipt_history_as_insufficient_data():
    request = sensor_payload()
    device_id = request["measurements"][0]["iot_device_id"]
    request["transmission_expected_interval_seconds"] = 3600
    request["transmission_gap_tolerance_factor"] = 2.0
    request["transmission_current_window"] = False
    request["transmission_devices"] = [{
        "device_id": device_id,
        "device_code": "sensor-01",
        "enabled": True,
        "created_at": "2026-02-27T00:00:00+00:00",
        "profile_bound": True,
        "expected_from": "2026-02-27",
        "expected_to": None,
    }]
    request["transmission_receipts"] = []

    client = TestClient(create_app(engine_api_key="test-secret"))
    response = client.post(
        "/v1/analyses/sensors",
        json=request,
        headers={"X-BA-Engine-Key": "test-secret"},
    )

    assert response.status_code == 200, response.text
    assessment = response.json()["instrument_health"]["transmission_diagnostics"]["assessments"][0]
    assert assessment["status"] == "insufficient_data"
    assert assessment["receipt_count"] == 0


def test_sensor_api_rejects_partial_transmission_diagnostics_policy():
    request = sensor_payload()
    request["transmission_expected_interval_seconds"] = 3600

    client = TestClient(create_app(engine_api_key="test-secret"))
    response = client.post(
        "/v1/analyses/sensors",
        json=request,
        headers={"X-BA-Engine-Key": "test-secret"},
    )

    assert response.status_code == 422
    assert "policy, devices and receipts must be supplied together" in str(response.json()["detail"])


def test_sensor_api_accepts_transmission_only_analysis_for_a_silent_device():
    request = sensor_payload()
    device_id = request["measurements"][0]["iot_device_id"]
    request["measurements"] = []
    today = datetime.now(ZoneInfo("Africa/Algiers")).date()
    request["from_date"] = (today - timedelta(days=1)).isoformat()
    request["to_date"] = today.isoformat()
    request["transmission_expected_interval_seconds"] = 60
    request["transmission_gap_tolerance_factor"] = 2.0
    request["transmission_current_window"] = True
    request["transmission_devices"] = [{
        "device_id": device_id,
        "device_code": "sensor-01",
        "enabled": True,
        "created_at": (today - timedelta(days=10)).isoformat() + "T00:00:00+00:00",
        "profile_bound": True,
        "expected_from": (today - timedelta(days=10)).isoformat(),
        "expected_to": today.isoformat(),
        "last_seen_at": (today - timedelta(days=1)).isoformat() + "T00:00:00+00:00",
    }]
    request["transmission_receipts"] = []

    client = TestClient(create_app(engine_api_key="test-secret"))
    response = client.post(
        "/v1/analyses/sensors",
        json=request,
        headers={"X-BA-Engine-Key": "test-secret"},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["analysis"]["total_observations"] == 0
    assessment = body["instrument_health"]["transmission_diagnostics"]["assessments"][0]
    assert assessment["status"] == "silent"
    assert assessment["receipt_count"] == 0


def test_sensor_api_rejects_empty_measurements_without_transmission_policy():
    request = sensor_payload()
    request["measurements"] = []

    client = TestClient(create_app(engine_api_key="test-secret"))
    response = client.post(
        "/v1/analyses/sensors",
        json=request,
        headers={"X-BA-Engine-Key": "test-secret"},
    )

    assert response.status_code == 422
    assert "at least one sensor measurement or transmission diagnostics policy is required" in str(response.json()["detail"])


def test_sensor_api_rejects_current_silence_for_a_historical_window():
    request = sensor_payload()
    request["transmission_expected_interval_seconds"] = 60
    request["transmission_gap_tolerance_factor"] = 2.0
    request["transmission_current_window"] = True
    device_id = request["measurements"][0]["iot_device_id"]
    request["transmission_devices"] = [{
        "device_id": device_id,
        "device_code": "sensor-01",
        "enabled": True,
        "created_at": "2026-02-27T00:00:00+00:00",
        "profile_bound": True,
        "expected_from": "2026-02-27",
        "expected_to": None,
    }]
    request["transmission_receipts"] = []

    client = TestClient(create_app(engine_api_key="test-secret"))
    response = client.post(
        "/v1/analyses/sensors",
        json=request,
        headers={"X-BA-Engine-Key": "test-secret"},
    )

    assert response.status_code == 422
    assert "current profile-local date" in str(response.json()["detail"])


def test_sensor_api_exposes_reference_based_drift_diagnostics_separately():
    request = sensor_payload()
    target_id = request["measurements"][0]["iot_device_id"]
    reference_id = str(uuid4())
    base = request["measurements"][0]
    request["measurements"] = []
    for index, target_value in enumerate((20.0, 21.0, 22.0, 23.0)):
        target = dict(base)
        target.update({
            "id": str(uuid4()),
            "iot_device_id": target_id,
            "device_code": "sensor-target",
            "raw_value": target_value,
            "measured_at": f"2026-03-01T0{index}:00:00+00:00",
        })
        reference = dict(base)
        reference.update({
            "id": str(uuid4()),
            "iot_device_id": reference_id,
            "device_code": "sensor-reference",
            "raw_value": 20.0,
            "measured_at": f"2026-03-01T0{index}:00:00+00:00",
        })
        request["measurements"].extend((target, reference))
    # Add guard-band observations before the requested local date. They
    # must not influence the relative drift assessment for this analysis.
    for sensor_id, code, value in (
        (target_id, "sensor-target", 100.0),
        (reference_id, "sensor-reference", 20.0),
    ):
        guard = dict(base)
        guard.update({
            "id": str(uuid4()),
            "iot_device_id": sensor_id,
            "device_code": code,
            "raw_value": value,
            "measured_at": "2026-02-28T20:00:00+00:00",
            "profile_valid_from": "2026-02-28",
        })
        request["measurements"].append(guard)
    for measurement in request["measurements"]:
        measurement["profile_valid_from"] = "2026-02-28"
    request["drift_policies"] = [{
        "target_sensor_id": target_id,
        "reference_sensor_id": reference_id,
        "variable_code": "air_temperature",
        "reference_binding_verified": True,
        "maximum_pair_offset_seconds": 60,
        "minimum_pairs": 3,
        "minimum_duration_seconds": 7200,
        "maximum_abs_drift_rate_per_hour": 0.1,
    }]
    client = TestClient(create_app(engine_api_key="test-secret"))
    response = client.post(
        "/v1/analyses/sensors",
        json=request,
        headers={"X-BA-Engine-Key": "test-secret"},
    )
    assert response.status_code == 200, response.text
    diagnostics = response.json()["instrument_health"]["drift_diagnostics"]
    assert diagnostics["status"] == "completed"
    assessment = diagnostics["assessments"][0]
    assert assessment["status"] == "suspected"
    assert assessment["pair_count"] == 4
    assert assessment["robust_drift_rate_per_hour"] == 1.0
    assert len(assessment["source_target_observation_ids"]) == 4
    assert len(assessment["source_reference_observation_ids"]) == 4


def test_sensor_api_rejects_duplicate_drift_policy():
    request = sensor_payload()
    target_id = request["measurements"][0]["iot_device_id"]
    policy = {
        "target_sensor_id": target_id,
        "reference_sensor_id": str(uuid4()),
        "variable_code": "air_temperature",
        "reference_binding_verified": True,
        "maximum_pair_offset_seconds": 60,
        "minimum_pairs": 3,
        "minimum_duration_seconds": 7200,
        "maximum_abs_drift_rate_per_hour": 0.1,
    }
    request["drift_policies"] = [policy, dict(policy)]
    client = TestClient(create_app(engine_api_key="test-secret"))
    response = client.post(
        "/v1/analyses/sensors",
        json=request,
        headers={"X-BA-Engine-Key": "test-secret"},
    )
    assert response.status_code == 422
    assert "drift policies must be unique" in str(response.json()["detail"])


def test_sensor_api_keeps_drift_not_evaluable_when_reference_is_unverified():
    request = sensor_payload()
    target_id = request["measurements"][0]["iot_device_id"]
    reference_id = str(uuid4())
    base = request["measurements"][0]
    reference = dict(base)
    reference.update({
        "id": str(uuid4()),
        "iot_device_id": reference_id,
        "device_code": "sensor-reference",
        "measured_at": "2026-03-01T00:00:00+00:00",
    })
    request["measurements"].append(reference)
    request["drift_policies"] = [{
        "target_sensor_id": target_id,
        "reference_sensor_id": reference_id,
        "variable_code": "air_temperature",
        "reference_binding_verified": False,
        "maximum_pair_offset_seconds": 60,
        "minimum_pairs": 3,
        "minimum_duration_seconds": 7200,
        "maximum_abs_drift_rate_per_hour": 0.1,
    }]
    client = TestClient(create_app(engine_api_key="test-secret"))
    response = client.post(
        "/v1/analyses/sensors",
        json=request,
        headers={"X-BA-Engine-Key": "test-secret"},
    )
    assert response.status_code == 200, response.text
    assessment = response.json()["instrument_health"]["drift_diagnostics"]["assessments"][0]
    assert assessment["status"] == "not_evaluable"
    assert assessment["reason"] == "reference_pair_not_verified"
