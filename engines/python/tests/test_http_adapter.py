import json
import sys
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ba_engine_contract.http_adapter import MAX_BODY_BYTES, create_server


def make_request():
    record_id = str(uuid4())
    return {
        "contract": "BA-LABS/ENGINE",
        "contract_version": "1.0.0",
        "request_id": str(uuid4()),
        "created_at": "2026-11-12T10:00:00Z",
        "engine": {"engine_id": "environmental.timeseries.qc", "engine_version": "0.1.0"},
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


class EngineHttpAdapterTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = create_server("test-worker-token", host="127.0.0.1", port=0)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base_url = f"http://127.0.0.1:{cls.server.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)

    def test_health_endpoint_reports_ready_without_exposing_configuration(self):
        with urllib.request.urlopen(self.base_url + "/healthz", timeout=2) as response:
            self.assertEqual(response.status, 200)
            self.assertEqual(json.loads(response.read()), {"status": "ok"})

    def test_execute_requires_worker_bearer_token(self):
        request = urllib.request.Request(
            self.base_url + "/v1/execute",
            data=json.dumps(make_request()).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with self.assertRaises(urllib.error.HTTPError) as caught:
            urllib.request.urlopen(request, timeout=2)
        self.assertEqual(caught.exception.code, 401)
        self.assertEqual(json.loads(caught.exception.read())["error"], "authentication_required")

    def test_execute_dispatches_registered_engine_and_returns_bound_envelope(self):
        payload = make_request()
        request = urllib.request.Request(
            self.base_url + "/v1/execute",
            data=json.dumps(payload).encode(),
            headers={
                "Content-Type": "application/json",
                "Authorization": "Bearer test-worker-token",
            },
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=3) as response:
            result = json.loads(response.read())
        self.assertEqual(result["contract"], "BA-LABS/ENGINE-RESULT")
        self.assertEqual(result["request_id"], payload["request_id"])
        self.assertEqual(result["engine"], payload["engine"])
        self.assertEqual(result["input_snapshot_sha256"], payload["input"]["snapshot_sha256"])
        self.assertEqual(result["status"], "completed")

    def test_execute_rejects_oversized_payload_before_json_parsing(self):
        body = b" " * (MAX_BODY_BYTES + 1)
        request = urllib.request.Request(
            self.base_url + "/v1/execute",
            data=body,
            headers={
                "Content-Type": "application/json",
                "Authorization": "Bearer test-worker-token",
            },
            method="POST",
        )
        with self.assertRaises(urllib.error.HTTPError) as caught:
            urllib.request.urlopen(request, timeout=2)
        self.assertEqual(caught.exception.code, 413)


if __name__ == "__main__":
    unittest.main()
