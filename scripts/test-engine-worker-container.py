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
        "engine_version": "0.1.0",
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
