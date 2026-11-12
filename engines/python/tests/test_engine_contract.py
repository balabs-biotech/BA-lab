import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from jsonschema import Draft202012Validator, FormatChecker
from ba_engine_contract import (
    ContractValidationError, EngineExecutionError, EngineSpec, execute_engine,
    validate_request, validate_response,
)
from ba_engine_contract.environmental_timeseries_qc import (
    analyze_environmental_timeseries_qc, run_environmental_timeseries_qc,
)

ROOT = Path(__file__).resolve().parents[3]
SCHEMA_DIR = ROOT / "schemas" / "engine" / "v1"
REGISTRY_DIR = ROOT / "engines" / "python" / "registry"


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


    def test_registered_environmental_engine_manifest_is_valid_and_sandboxed(self):
        schema = load_schema("manifest.schema.json")
        manifest = json.loads((REGISTRY_DIR / "environmental.timeseries.qc-0.1.0.json").read_text(encoding="utf-8"))
        manifest_validator = validator(schema)
        self.assertEqual(list(manifest_validator.iter_errors(manifest)), [])
        self.assertFalse(manifest["capabilities"]["database_access"])
        self.assertFalse(manifest["capabilities"]["network_access"])
        self.assertTrue(manifest["determinism"]["deterministic_analysis"])

    def test_engine_manifest_rejects_network_or_database_capability(self):
        schema = load_schema("manifest.schema.json")
        manifest = json.loads((REGISTRY_DIR / "environmental.timeseries.qc-0.1.0.json").read_text(encoding="utf-8"))
        manifest["capabilities"]["network_access"] = True
        self.assertTrue(list(validator(schema).iter_errors(manifest)))

    def test_engine_manifest_rejects_unbounded_resource_limits(self):
        schema = load_schema("manifest.schema.json")
        manifest = json.loads((REGISTRY_DIR / "environmental.timeseries.qc-0.1.0.json").read_text(encoding="utf-8"))
        manifest["resource_limits"]["timeout_seconds"] = 9999
        self.assertTrue(list(validator(schema).iter_errors(manifest)))

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


    def test_runtime_validator_accepts_matching_request_and_response(self):
        validate_request(REQUEST)
        validate_response(RESPONSE, REQUEST)

    def test_runtime_validator_rejects_record_snapshot_id_mismatch(self):
        invalid = json.loads(json.dumps(REQUEST))
        invalid["input"]["records"][0]["record_id"] = "5c2b3a4d-5e6f-4789-8123-456789abcdef"
        with self.assertRaises(ContractValidationError):
            validate_request(invalid)

    def test_runtime_validator_binds_result_to_exact_request(self):
        invalid = json.loads(json.dumps(RESPONSE))
        invalid["input_snapshot_sha256"] = "d" * 64
        with self.assertRaises(ContractValidationError):
            validate_response(invalid, REQUEST)

    def test_runtime_validator_rejects_engine_version_drift(self):
        invalid = json.loads(json.dumps(RESPONSE))
        invalid["engine"]["engine_version"] = "0.2.0"
        with self.assertRaises(ContractValidationError):
            validate_response(invalid, REQUEST)


    def test_environmental_qc_detects_sampling_gaps_and_outliers_without_diagnosis(self):
        request = json.loads(json.dumps(REQUEST))
        request["engine"] = {"engine_id": "environmental.timeseries.qc", "engine_version": "0.1.0"}
        request["input"]["records"] = []
        request["input"]["record_ids"] = []
        for index, (timestamp, value) in enumerate([
            ("2026-11-12T08:00:00Z", 20.0),
            ("2026-11-12T08:10:00Z", 20.1),
            ("2026-11-12T12:00:00Z", 20.0),
            ("2026-11-12T12:10:00Z", 40.0),
        ]):
            record_id = f"3c2b3a4d-5e6f-4789-8123-456789abcde{index}"
            request["input"]["record_ids"].append(record_id)
            request["input"]["records"].append({
                "record_id": record_id,
                "record_type": "measurement",
                "payload_sha256": "b" * 64,
                "data": {
                    "variable_code": "temperature",
                    "normalized_value": value,
                    "normalized_unit_code": "degC",
                    "measured_at": timestamp
                }
            })
        request["parameters"] = {"max_gap_minutes": 60, "outlier_mad_threshold": 3.0, "minimum_points": 3}
        result = run_environmental_timeseries_qc(request)
        validate_response(result, request)
        self.assertEqual(result["result"]["outcome"], "success")
        flags = result["result"]["value"]["series"][0]["quality_flags"]
        self.assertIn("sampling_gap_detected", flags)
        self.assertIn("robust_outlier_detected", flags)
        self.assertIn("data-quality screening only", result["result"]["limitations"][0])

    def test_environmental_qc_rejects_wrong_engine_identity(self):
        request = json.loads(json.dumps(REQUEST))
        with self.assertRaisesRegex(ValueError, "unsupported_engine_id"):
            analyze_environmental_timeseries_qc(request)

    def test_environmental_qc_rejects_naive_timestamp_as_excluded_data(self):
        request = json.loads(json.dumps(REQUEST))
        request["engine"] = {"engine_id": "environmental.timeseries.qc", "engine_version": "0.1.0"}
        request["input"]["records"][0]["data"] = {
            "variable_code": "temperature",
            "normalized_value": 22.0,
            "normalized_unit_code": "degC",
            "measured_at": "2026-11-12T10:00:00"
        }
        result = run_environmental_timeseries_qc(request)
        self.assertEqual(result["result"]["outcome"], "insufficient_data")
        self.assertEqual(result["result"]["value"]["summary"]["excluded_record_count"], 1)


    def test_environmental_qc_rejects_non_finite_or_boolean_thresholds(self):
        request = json.loads(json.dumps(REQUEST))
        request["engine"] = {"engine_id": "environmental.timeseries.qc", "engine_version": "0.1.0"}
        for key, value in [
            ("max_gap_minutes", float("inf")),
            ("max_gap_minutes", True),
            ("outlier_mad_threshold", float("nan")),
            ("minimum_points", True),
        ]:
            invalid = json.loads(json.dumps(request))
            invalid["parameters"] = {key: value}
            with self.assertRaises(ValueError):
                run_environmental_timeseries_qc(invalid)


    def test_runner_executes_and_returns_request_bound_result(self):
        engine = EngineSpec(
            engine_id=REQUEST["engine"]["engine_id"],
            engine_version=REQUEST["engine"]["engine_version"],
            execute=lambda payload: {
                "outcome": "success",
                "value": {"processed_records": len(payload["input"]["records"])},
                "limitations": [],
                "quality_flags": [],
                "provenance": {"algorithm": "fixture-v1", "libraries": []},
            },
        )
        result = execute_engine(REQUEST, engine)
        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["request_id"], REQUEST["request_id"])
        self.assertEqual(result["input_snapshot_sha256"], REQUEST["input"]["snapshot_sha256"])


    def test_runner_invokes_environmental_qc_with_full_contract_envelope(self):
        request = json.loads(json.dumps(REQUEST))
        request["engine"] = {"engine_id": "environmental.timeseries.qc", "engine_version": "0.1.0"}
        engine = EngineSpec(
            engine_id="environmental.timeseries.qc",
            engine_version="0.1.0",
            execute=analyze_environmental_timeseries_qc,
        )
        result = execute_engine(request, engine)
        self.assertEqual(result["status"], "completed", msg=str(result.get("error")))
        self.assertEqual(result["result"]["outcome"], "insufficient_data")

    def test_runner_returns_typed_failure_without_leaking_exception(self):
        def fail(_payload):
            raise EngineExecutionError("provider_timeout", "Provider timed out", True)

        engine = EngineSpec(REQUEST["engine"]["engine_id"], REQUEST["engine"]["engine_version"], fail)
        result = execute_engine(REQUEST, engine)
        self.assertEqual(result["status"], "failed")
        self.assertEqual(result["error"]["code"], "provider_timeout")
        self.assertTrue(result["error"]["retryable"])

    def test_runner_rejects_wrong_registered_engine_version(self):
        engine = EngineSpec(REQUEST["engine"]["engine_id"], "9.9.9", lambda _payload: {})
        with self.assertRaises(ContractValidationError):
            execute_engine(REQUEST, engine)

    def test_unknown_fields_are_rejected_at_envelope_boundaries(self):
        invalid = json.loads(json.dumps(REQUEST))
        invalid["unversioned_extra"] = True
        self.assertTrue(list(self.request_validator.iter_errors(invalid)))


if __name__ == "__main__":
    unittest.main(verbosity=2)
