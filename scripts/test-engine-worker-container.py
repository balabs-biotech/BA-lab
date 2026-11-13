"""Black-box smoke test for a running BA Labs HTTP engine worker container."""

import json
import os
import urllib.error
import urllib.request
from uuid import uuid4

base_url = os.environ["BA_ENGINE_WORKER_URL"].rstrip("/")
token = os.environ["BA_ENGINE_WORKER_TOKEN"]


def request(path, payload=None, bearer=None):
    body = None if payload is None else json.dumps(payload).encode()
    headers = {}
    if body is not None:
        headers["Content-Type"] = "application/json"
    if bearer is not None:
        headers["Authorization"] = "Bearer " + bearer
    req = urllib.request.Request(base_url + path, data=body, headers=headers)
    return urllib.request.urlopen(req, timeout=5)


with request("/healthz") as response:
    assert response.status == 200
    assert json.loads(response.read()) == {"status": "ok"}

record_id = str(uuid4())
payload = {
    "contract": "BA-LABS/ENGINE",
    "contract_version": "1.0.0",
    "request_id": str(uuid4()),
    "created_at": "2026-11-12T10:00:00Z",
    "engine": {
        "engine_id": "environmental.timeseries.qc",
        "engine_version": "0.2.0",
    },
    "scope": {"organization_id": str(uuid4())},
    "input": {
        "record_ids": [record_id],
        "snapshot_sha256": "a" * 64,
        "records": [{
            "record_id": record_id,
            "record_type": "measurement",
            "payload_sha256": "b" * 64,
            "data": {
                "variable_code": "air_temperature_mean",
                "normalized_value": 22.5,
                "normalized_unit_code": "degC",
                "measured_at": "2026-11-12T09:00:00Z",
            },
        }],
    },
    "parameters": {},
}

try:
    request("/v1/execute", payload)
    raise AssertionError("worker accepted unauthenticated execution")
except urllib.error.HTTPError as error:
    assert error.code == 401

with request("/v1/execute", payload, token) as response:
    result = json.loads(response.read())

assert result["contract"] == "BA-LABS/ENGINE-RESULT"
assert result["status"] == "completed"
assert result["request_id"] == payload["request_id"]
assert result["engine"] == payload["engine"]
assert result["input_snapshot_sha256"] == payload["input"]["snapshot_sha256"]
print("Container HTTP smoke test passed: health, auth, registry dispatch and result correlation.")

# GreenTech BIE v0.2: exercise the registered plant-subject engine through the
# same isolated HTTP worker used by the orchestrator. The worker receives only
# an immutable snapshot; it has no database or external-network capability.
plant_id = str(uuid4())
plant_measurement_id = str(uuid4())
weather_observation_id = str(uuid4())
location_id = str(uuid4())
plant_payload = {
    "contract": "BA-LABS/ENGINE",
    "contract_version": "1.0.0",
    "request_id": str(uuid4()),
    "created_at": "2026-11-12T10:00:00Z",
    "engine": {
        "engine_id": "biological.context.features",
        "engine_version": "0.2.0",
    },
    "scope": {
        "organization_id": str(uuid4()),
        "plant_culture_id": plant_id,
        "location_id": location_id,
    },
    "input": {
        "record_ids": [plant_measurement_id, weather_observation_id],
        "snapshot_sha256": "c" * 64,
        "records": [
            {
                "record_id": plant_measurement_id,
                "record_type": "measurement",
                "payload_sha256": "d" * 64,
                "data": {
                    "variable_code": "air_temperature",
                    "normalized_value": 24.0,
                    "normalized_unit_code": "degC",
                    "measured_at": "2026-11-12T08:00:00Z",
                    "quality_state": "valid",
                },
                "context": {"plant_culture_id": plant_id},
            },
            {
                "record_id": weather_observation_id,
                "record_type": "environmental_observation",
                "payload_sha256": "e" * 64,
                "data": {
                    "variable_code": "air_temperature_mean",
                    "value": 19.0,
                    "unit_code": "degC",
                    "observed_at": "2026-11-12T00:00:00Z",
                    "data_family": "weather",
                    "provider_code": "NASA_POWER",
                    "dataset_code": "POWER_DAILY",
                    "retrieved_at": "2026-11-13T00:00:00Z",
                },
                "context": {"location_id": location_id},
            },
        ],
    },
    "parameters": {
        "window_start": "2026-11-12T00:00:00Z",
        "window_end": "2026-11-13T00:00:00Z",
        "timezone": "Africa/Algiers",
        "biological_contexts": [],
    },
}

with request("/v1/execute", plant_payload, token) as response:
    plant_result = json.loads(response.read())

assert plant_result["contract"] == "BA-LABS/ENGINE-RESULT"
assert plant_result["status"] == "completed"
assert plant_result["request_id"] == plant_payload["request_id"]
assert plant_result["engine"] == plant_payload["engine"]
assert plant_result["input_snapshot_sha256"] == plant_payload["input"]["snapshot_sha256"]
assessment = plant_result["result"]["value"]
assert assessment["result_type"] == "biological.context_assessment"
assert assessment["result_version"] == "1.0.0"
assert assessment["subject"]["subject_type"] == "plant"
assert assessment["subject"]["subject_id"] == plant_id
assert assessment["subject"]["plant_culture_id"] == plant_id
assert assessment["subject"]["culture_id"] is None
assert assessment["coverage"]["source_record_count"] == 2
assert assessment["coverage"]["record_counts_by_type"] == {
    "environmental_observation": 1,
    "measurement": 1,
}
assert assessment["findings"] == []
assert assessment["hypotheses"] == []
print("GreenTech BIE v0.2 HTTP smoke test passed: plant subject, local measurement, weather provenance and result correlation.")
