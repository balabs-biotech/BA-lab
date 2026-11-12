import json
import unittest
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker

ROOT = Path(__file__).resolve().parents[3]
SCHEMA_DIR = ROOT / "schemas" / "engine" / "v1"


def load_schema(name: str) -> dict:
    with (SCHEMA_DIR / name).open(encoding="utf-8") as handle:
        return json.load(handle)


def validator(schema: dict) -> Draft202012Validator:
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema, format_checker=FormatChecker())


REQUEST = {
    "contract": "BA-LABS/ENGINE",
    "contract_version": "1.0.0",
    "request_id": "8e6f7f8c-1e52-4d2c-9d9f-2f8e4f0f4c11",
    "created_at": "2026-11-12T10:00:00Z",
    "engine": {"engine_id": "environmental.timeseries", "engine_version": "0.1.0"},
    "scope": {"organization_id": "1c2b3a4d-5e6f-4789-8123-456789abcdef", "culture_id": "2c2b3a4d-5e6f-4789-8123-456789abcdef"},
    "input": {
        "record_ids": ["3c2b3a4d-5e6f-4789-8123-456789abcdef"],
        "snapshot_sha256": "a" * 64,
        "records": [{
            "record_id": "3c2b3a4d-5e6f-4789-8123-456789abcdef",
            "record_type": "measurement",
            "payload_sha256": "b" * 64,
            "data": {"variable_code": "temperature", "raw_value": 24.5, "raw_unit_code": "degC", "normalized_value": 24.5, "normalized_unit_code": "degC"}
        }]
    },
    "parameters": {"window_hours": 24},
    "datasets": [{
        "provider": "NASA_POWER",
        "dataset_id": "point-daily",
        "dataset_version": "v1",
        "content_sha256": "c" * 64,
        "retrieved_at": "2026-11-12T09:55:00Z"
    }]
}

RESPONSE = {
    "contract": "BA-LABS/ENGINE-RESULT",
    "contract_version": "1.0.0",
    "request_id": REQUEST["request_id"],
    "execution_id": "4c2b3a4d-5e6f-4789-8123-456789abcdef",
    "engine": REQUEST["engine"],
    "input_snapshot_sha256": REQUEST["input"]["snapshot_sha256"],
    "status": "completed",
    "started_at": "2026-11-12T10:00:01Z",
    "completed_at": "2026-11-12T10:00:02Z",
    "result": {
        "outcome": "success",
        "value": {"trend": "stable", "sample_count": 24},
        "limitations": [],
        "quality_flags": [],
        "provenance": {"algorithm": "rolling-median-v1", "libraries": [{"name": "numpy", "version": "2.1.0"}]}
    }
}


class EngineContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.request_validator = validator(load_schema("request.schema.json"))
        cls.response_validator = validator(load_schema("response.schema.json"))

    def test_valid_request_and_result(self):
        self.assertEqual(list(self.request_validator.iter_errors(REQUEST)), [])
        self.assertEqual(list(self.response_validator.iter_errors(RESPONSE)), [])

    def test_request_requires_tenant_and_snapshot_identity(self):
        invalid = json.loads(json.dumps(REQUEST))
        del invalid["scope"]["organization_id"]
        del invalid["input"]["snapshot_sha256"]
        self.assertGreaterEqual(len(list(self.request_validator.iter_errors(invalid))), 2)

    def test_request_rejects_duplicate_record_ids_and_unversioned_contract(self):
        invalid = json.loads(json.dumps(REQUEST))
        invalid["input"]["record_ids"].append(invalid["input"]["record_ids"][0])
        invalid["contract_version"] = "latest"
        self.assertGreaterEqual(len(list(self.request_validator.iter_errors(invalid))), 2)

    def test_completed_result_requires_result_and_forbids_error(self):
        invalid = json.loads(json.dumps(RESPONSE))
        invalid["error"] = {"code": "internal_error", "message": "failed", "retryable": True}
        self.assertTrue(list(self.response_validator.iter_errors(invalid)))

    def test_failed_result_requires_error_and_forbids_result(self):
        invalid = json.loads(json.dumps(RESPONSE))
        invalid["status"] = "failed"
        invalid["error"] = {"code": "provider_timeout", "message": "Provider timed out", "retryable": True}
        self.assertTrue(list(self.response_validator.iter_errors(invalid)))

    def test_confidence_requires_method_and_calibration_reference(self):
        invalid = json.loads(json.dumps(RESPONSE))
        invalid["result"]["confidence"] = {"value": 0.92}
        self.assertTrue(list(self.response_validator.iter_errors(invalid)))

    def test_unknown_fields_are_rejected_at_envelope_boundaries(self):
        invalid = json.loads(json.dumps(REQUEST))
        invalid["unversioned_extra"] = True
        self.assertTrue(list(self.request_validator.iter_errors(invalid)))


if __name__ == "__main__":
    unittest.main(verbosity=2)
