import json
import os
import shutil
import sys
import tempfile
import unittest
from io import StringIO
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from jsonschema import Draft202012Validator, FormatChecker
from ba_engine_contract import (
    ContractValidationError, EngineExecutionError, EngineSpec, execute_engine,
    execute_registered_engine, validate_request, validate_response,
)
from ba_engine_contract.worker import main as worker_main
from ba_engine_contract.validation import _validator
from ba_engine_contract.registry import load_engine
from ba_engine_contract.environmental_timeseries_qc import (
    analyze_environmental_timeseries_qc, run_environmental_timeseries_qc,
)
from ba_engine_contract.biological_context_features import analyze_biological_context_features, _evaluate_interpretation_rules

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


    def test_spatial_scene_contract_requires_l2a_calibration_and_provenance(self):
        schema_path = ROOT / "schemas" / "spatial" / "v1" / "scene.schema.json"
        schema = json.loads(schema_path.read_text(encoding="utf-8"))
        scene = {
            "contract": "BA-LABS/SPATIAL-SCENE",
            "contract_version": "1.0.0",
            "provider": "earth-search",
            "collection_id": "sentinel-2-l2a",
            "item_id": "S2A_20261112T101021",
            "acquired_at": "2026-11-12T10:10:21Z",
            "product_level": "L2A",
            "processing_baseline": "05.11",
            "platform": "sentinel-2a",
            "cloud_cover_percent": 12.5,
            "assets": {
                "red": {"href": "https://data.example/red.tif", "band_code": "B04", "native_resolution_m": 10},
                "nir": {"href": "https://data.example/nir.tif", "band_code": "B08", "native_resolution_m": 10},
                "scl": {"href": "https://data.example/scl.tif", "band_code": "SCL", "native_resolution_m": 20},
            },
            "calibration": {
                "reflectance_status": "raw_dn",
                "bands": {
                    "B04": {"quantification_value": 10000, "boa_add_offset": -1000},
                    "B08": {"quantification_value": 10000, "boa_add_offset": -1000},
                },
            },
        }
        scene_validator = validator(schema)
        self.assertEqual(list(scene_validator.iter_errors(scene)), [])
        missing_baseline = json.loads(json.dumps(scene))
        del missing_baseline["processing_baseline"]
        self.assertTrue(list(scene_validator.iter_errors(missing_baseline)))
        invalid_level = json.loads(json.dumps(scene))
        invalid_level["product_level"] = "L1C"
        self.assertTrue(list(scene_validator.iter_errors(invalid_level)))

    def test_spatial_ndvi_request_binds_scene_aoi_bands_mask_and_grid(self):
        schema_path = ROOT / "schemas" / "spatial" / "v1" / "ndvi-request.schema.json"
        schema = json.loads(schema_path.read_text(encoding="utf-8"))
        request = {
            "contract": "BA-LABS/SPATIAL-REQUEST",
            "contract_version": "1.0.0",
            "request_id": "7c2b3a4d-5e6f-4789-8123-456789abcdef",
            "source_scene": {
                "provider": "earth-search",
                "collection_id": "sentinel-2-l2a",
                "item_id": "S2A_20261112T101021",
                "metadata_sha256": "a" * 64,
            },
            "aoi": {
                "geometry": {"type": "Polygon", "coordinates": [[[5.0, 36.0], [5.1, 36.0], [5.1, 36.1], [5.0, 36.0]]]},
                "crs": "EPSG:4326",
            },
            "index": "NDVI",
            "bands": {"red": "B04", "nir": "B08"},
            "mask": {"scl_excluded_classes": [3, 8, 9, 10, 11], "minimum_valid_pixel_fraction": 0.6},
            "grid": {"resolution_m": 10, "target_crs": "EPSG:32631"},
            "output": {"format": "COG"},
        }
        request_validator = validator(schema)
        self.assertEqual(list(request_validator.iter_errors(request)), [])
        wrong_mask = json.loads(json.dumps(request))
        wrong_mask["mask"]["scl_excluded_classes"] = [8, 9]
        self.assertTrue(list(request_validator.iter_errors(wrong_mask)))
        wrong_grid = json.loads(json.dumps(request))
        wrong_grid["grid"]["resolution_m"] = 20
        self.assertTrue(list(request_validator.iter_errors(wrong_grid)))

    def test_spatial_ndvi_result_requires_mask_coverage_and_cog_provenance(self):
        schema_path = ROOT / "schemas" / "spatial" / "v1" / "ndvi-result.schema.json"
        schema = json.loads(schema_path.read_text(encoding="utf-8"))
        result = {
            "contract": "BA-LABS/SPATIAL-RESULT",
            "contract_version": "1.0.0",
            "result_id": "ndvi:scene-123:aoi-456",
            "source_scene_id": "S2A_20261112T101021",
            "algorithm": "sentinel2-ndvi-v1",
            "quality_state": "accepted",
            "limitations": [],
            "bands": {"red": "B04", "nir": "B08"},
            "mask": {"scl_excluded_classes": [3, 8, 9, 10, 11], "cloud_shadow_masked": True},
            "calibration": {"reflectance_status": "raw_dn", "formula": "(DN + BOA_ADD_OFFSET) / QUANTIFICATION_VALUE"},
            "grid": {"crs": "EPSG:32631", "resolution_m": 10},
            "pixel_accounting": {"total_pixel_count": 1000, "valid_pixel_count": 720, "valid_pixel_fraction": 0.72},
            "statistics": {"minimum": -0.2, "maximum": 0.91, "mean": 0.48},
            "artifact": {"format": "COG", "href": "s3://ba-labs-private/ndvi/scene-123.tif", "sha256": "a" * 64},
            "provenance": {"generated_at": "2026-11-12T10:30:00Z", "software_version": "1.0.0", "processing_baseline": "05.11", "source_metadata_sha256": "b" * 64},
        }
        result_validator = validator(schema)
        self.assertEqual(list(result_validator.iter_errors(result)), [])
        low_coverage = json.loads(json.dumps(result))
        low_coverage["pixel_accounting"]["valid_pixel_fraction"] = 1.2
        self.assertTrue(list(result_validator.iter_errors(low_coverage)))
        missing_hash = json.loads(json.dumps(result))
        del missing_hash["artifact"]["sha256"]
        self.assertTrue(list(result_validator.iter_errors(missing_hash)))

    def test_registered_environmental_engine_manifest_is_valid_and_sandboxed(self):
        schema = load_schema("manifest.schema.json")
        manifest = json.loads((REGISTRY_DIR / "environmental.timeseries.qc-0.2.0.json").read_text(encoding="utf-8"))
        manifest_validator = validator(schema)
        self.assertEqual(list(manifest_validator.iter_errors(manifest)), [])
        self.assertFalse(manifest["capabilities"]["database_access"])
        self.assertFalse(manifest["capabilities"]["network_access"])
        self.assertTrue(manifest["determinism"]["deterministic_analysis"])

    def test_engine_manifest_rejects_network_or_database_capability(self):
        schema = load_schema("manifest.schema.json")
        manifest = json.loads((REGISTRY_DIR / "environmental.timeseries.qc-0.2.0.json").read_text(encoding="utf-8"))
        manifest["capabilities"]["network_access"] = True
        self.assertTrue(list(validator(schema).iter_errors(manifest)))

    def test_engine_manifest_rejects_unbounded_resource_limits(self):
        schema = load_schema("manifest.schema.json")
        manifest = json.loads((REGISTRY_DIR / "environmental.timeseries.qc-0.2.0.json").read_text(encoding="utf-8"))
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
        request["engine"] = {"engine_id": "environmental.timeseries.qc", "engine_version": "0.2.0"}
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

    def test_environmental_qc_accepts_location_scoped_environmental_observations(self):
        request = json.loads(json.dumps(REQUEST))
        request["engine"] = {"engine_id": "environmental.timeseries.qc", "engine_version": "0.2.0"}
        request["scope"] = {
            "organization_id": REQUEST["scope"]["organization_id"],
            "location_id": "5c2b3a4d-5e6f-4789-8123-456789abcdef",
        }
        request["input"]["records"] = []
        request["input"]["record_ids"] = []
        for index, (timestamp, value) in enumerate([
            ("2026-11-10T12:00:00Z", 12.0),
            ("2026-11-11T12:00:00Z", 13.0),
            ("2026-11-14T12:00:00Z", 14.0),
        ]):
            record_id = f"6c2b3a4d-5e6f-4789-8123-456789abcde{index}"
            request["input"]["record_ids"].append(record_id)
            request["input"]["records"].append({
                "record_id": record_id,
                "record_type": "environmental_observation",
                "payload_sha256": "d" * 64,
                "data": {
                    "variable_code": "air_temperature_mean",
                    "value": value,
                    "unit_code": "degC",
                    "observed_at": timestamp,
                    "data_family": "weather",
                    "provider_code": "NASA_POWER",
                    "dataset_code": "POWER_DAILY_AGRO",
                    "spatial_resolution_m": 55000,
                    "quality_flag": "gridded_estimate",
                },
                "context": {"location_id": request["scope"]["location_id"]},
            })
        request["parameters"] = {"max_gap_minutes": 1800, "minimum_points": 2}
        result = run_environmental_timeseries_qc(request)
        validate_response(result, request)
        self.assertEqual(result["result"]["outcome"], "success")
        self.assertEqual(result["result"]["value"]["summary"]["record_count"], 3)
        self.assertEqual(result["result"]["value"]["summary"]["measurement_count"], 0)
        self.assertEqual(result["result"]["value"]["summary"]["environmental_observation_count"], 3)
        self.assertIn("sampling_gap_detected", result["result"]["quality_flags"])
        self.assertEqual(
            result["result"]["provenance"]["source_references"],
            ["NASA_POWER/POWER_DAILY_AGRO"],
        )

        daily_cadence = json.loads(json.dumps(request))
        daily_cadence["parameters"] = {"minimum_points": 2}
        for index, record in enumerate(daily_cadence["input"]["records"]):
            record["data"]["observed_at"] = f"2026-11-{10 + index:02d}T12:00:00Z"
        daily_result = run_environmental_timeseries_qc(daily_cadence)
        self.assertNotIn("sampling_gap_detected", daily_result["result"]["quality_flags"])

        invalid_family = json.loads(json.dumps(request))
        invalid_family["input"]["records"][0]["data"]["data_family"] = "satellite"
        family_result = run_environmental_timeseries_qc(invalid_family)
        self.assertEqual(family_result["result"]["outcome"], "insufficient_data")
        self.assertEqual(
            family_result["result"]["value"]["summary"]["excluded_records"][0]["reason"],
            "unsupported_environmental_data_family",
        )

        invalid_location = json.loads(json.dumps(request))
        invalid_location["input"]["records"][0]["context"]["location_id"] = "7c2b3a4d-5e6f-4789-8123-456789abcdef"
        location_result = run_environmental_timeseries_qc(invalid_location)
        self.assertEqual(location_result["result"]["outcome"], "insufficient_data")
        self.assertEqual(
            location_result["result"]["value"]["summary"]["excluded_records"][0]["reason"],
            "environmental_location_scope_mismatch",
        )

        mixed_sources = json.loads(json.dumps(request))
        extra = json.loads(json.dumps(mixed_sources["input"]["records"][0]))
        extra["record_id"] = "8c2b3a4d-5e6f-4789-8123-456789abcdef"
        extra["data"]["provider_code"] = "OTHER_PROVIDER"
        mixed_sources["input"]["record_ids"].append(extra["record_id"])
        mixed_sources["input"]["records"].append(extra)
        with self.assertRaisesRegex(ValueError, "mixed_environmental_sources_not_supported"):
            analyze_environmental_timeseries_qc(mixed_sources)

    def test_environmental_qc_rejects_wrong_engine_identity(self):
        request = json.loads(json.dumps(REQUEST))
        with self.assertRaisesRegex(ValueError, "unsupported_engine_id"):
            analyze_environmental_timeseries_qc(request)

    def test_environmental_qc_rejects_naive_timestamp_as_excluded_data(self):
        request = json.loads(json.dumps(REQUEST))
        request["engine"] = {"engine_id": "environmental.timeseries.qc", "engine_version": "0.2.0"}
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
        request["engine"] = {"engine_id": "environmental.timeseries.qc", "engine_version": "0.2.0"}
        for key, value in [
            ("max_gap_minutes", float("inf")),
            ("max_gap_minutes", True),
            ("outlier_mad_threshold", float("nan")),
            ("minimum_points", True),
        ]:
            invalid = json.loads(json.dumps(request))
            invalid["parameters"] = {key: value}
            with self.assertRaises(ValueError):
                analyze_environmental_timeseries_qc(invalid)


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
        request["engine"] = {"engine_id": "environmental.timeseries.qc", "engine_version": "0.2.0"}
        analysis = analyze_environmental_timeseries_qc(request)
        self.assertEqual(analysis["outcome"], "insufficient_data")
        engine = EngineSpec(
            engine_id="environmental.timeseries.qc",
            engine_version="0.2.0",
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


    def test_schema_directory_can_be_overridden_for_installed_runtime(self):
        with tempfile.TemporaryDirectory() as schema_dir:
            shutil.copy(SCHEMA_DIR / "request.schema.json", schema_dir)
            with patch.dict(os.environ, {"BA_ENGINE_SCHEMA_DIR": schema_dir}):
                _validator.cache_clear()
                validate_request(REQUEST)
        _validator.cache_clear()

    def test_registry_directory_can_be_overridden_for_installed_runtime(self):
        with tempfile.TemporaryDirectory() as registry_dir:
            shutil.copy(
                REGISTRY_DIR / "environmental.timeseries.qc-0.2.0.json",
                registry_dir,
            )
            with patch.dict(os.environ, {"BA_ENGINE_REGISTRY_DIR": registry_dir}):
                manifest, engine = load_engine("environmental.timeseries.qc", "0.2.0")
        self.assertEqual(manifest["engine"]["engine_id"], "environmental.timeseries.qc")
        self.assertEqual(engine.engine_version, "0.2.0")

    def test_registry_resolves_and_executes_exact_engine_version(self):
        request = json.loads(json.dumps(REQUEST))
        request["engine"] = {"engine_id": "environmental.timeseries.qc", "engine_version": "0.2.0"}
        result = execute_registered_engine(request)
        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["engine"], request["engine"])
        self.assertEqual(result["result"]["outcome"], "insufficient_data")

    def test_registry_rejects_unregistered_engine(self):
        request = json.loads(json.dumps(REQUEST))
        request["engine"] = {"engine_id": "environmental.unknown", "engine_version": "0.1.0"}
        with self.assertRaisesRegex(ContractValidationError, "engine_not_registered"):
            execute_registered_engine(request)

    def test_worker_cli_reads_request_and_writes_result_json(self):
        request = json.loads(json.dumps(REQUEST))
        request["engine"] = {"engine_id": "environmental.timeseries.qc", "engine_version": "0.2.0"}
        stdin = StringIO(json.dumps(request))
        stdout = StringIO()
        stderr = StringIO()
        with patch("sys.stdin", stdin), patch("sys.stdout", stdout), patch("sys.stderr", stderr):
            exit_code = worker_main()
        self.assertEqual(exit_code, 0, msg=stderr.getvalue())
        response = json.loads(stdout.getvalue())
        self.assertEqual(response["status"], "completed")
        self.assertEqual(response["request_id"], request["request_id"])

    def test_unknown_fields_are_rejected_at_envelope_boundaries(self):
        invalid = json.loads(json.dumps(REQUEST))
        invalid["unversioned_extra"] = True
        self.assertTrue(list(self.request_validator.iter_errors(invalid)))


    def test_biological_context_features_reports_traceable_coverage_and_never_infers_diagnosis(self):
        request = json.loads(json.dumps(REQUEST))
        request["engine"] = {
            "engine_id": "biological.context.features",
            "engine_version": "0.1.0",
        }
        culture_id = "2c2b3a4d-5e6f-4789-8123-456789abcdef"
        request["scope"] = {
            "organization_id": REQUEST["scope"]["organization_id"],
            "culture_id": culture_id,
        }
        request["parameters"] = {
            "window_start": "2026-11-10T00:00:00Z",
            "window_end": "2026-11-11T00:00:00Z",
            "timezone": "Africa/Algiers",
        }
        request["input"]["record_ids"] = []
        request["input"]["records"] = []
        for index, (timestamp, value) in enumerate([
            ("2026-11-10T08:00:00Z", 21.0),
            ("2026-11-10T09:00:00Z", 23.0),
            ("2026-11-10T10:00:00Z", 22.0),
        ]):
            record_id = f"3c2b3a4d-5e6f-4789-8123-456789abcde{index}"
            request["input"]["record_ids"].append(record_id)
            request["input"]["records"].append({
                "record_id": record_id,
                "record_type": "measurement",
                "payload_sha256": "b" * 64,
                "data": {
                    "variable_code": "air_temperature",
                    "normalized_value": value,
                    "normalized_unit_code": "degC",
                    "measured_at": timestamp,
                },
                "context": {"culture_id": culture_id},
            })
        result = execute_registered_engine(request)
        self.assertEqual(result["status"], "completed", msg=str(result.get("error")))
        value = result["result"]["value"]
        biological_schema = json.loads((ROOT / "schemas" / "biological" / "v1" / "context-assessment.schema.json").read_text(encoding="utf-8"))
        Draft202012Validator(biological_schema, format_checker=FormatChecker()).validate(value)
        self.assertEqual(value["subject"]["subject_type"], "culture")
        self.assertEqual(value["subject"]["subject_id"], culture_id)
        self.assertEqual(value["coverage"]["source_record_count"], 3)
        self.assertEqual(value["coverage"]["record_counts_by_type"]["measurement"], 3)
        self.assertEqual(len(value["derived_features"]), 4)
        feature = next(item for item in value["derived_features"] if item["feature_code"] == "series.measurement.air_temperature.mean")
        self.assertEqual(feature["feature_code"], "series.measurement.air_temperature.mean")
        self.assertEqual(feature["value"], 22.0)
        self.assertEqual(feature["unit_code"], "degC")
        self.assertEqual(set(feature["source_record_ids"]), set(request["input"]["record_ids"]))
        self.assertEqual(value["findings"], [])
        self.assertEqual(value["hypotheses"], [])
        self.assertIn("biological_interpretation_not_performed", result["result"]["quality_flags"])


    def test_biological_context_features_emits_limited_findings_for_scoped_versioned_rules(self):
        request = json.loads(json.dumps(REQUEST))
        request["engine"] = {
            "engine_id": "biological.context.features",
            "engine_version": "0.1.0",
        }
        culture_id = "2c2b3a4d-5e6f-4789-8123-456789abcdef"
        request["scope"] = {
            "organization_id": REQUEST["scope"]["organization_id"],
            "culture_id": culture_id,
        }
        request["parameters"] = {
            "window_start": "2026-11-10T00:00:00Z",
            "window_end": "2026-11-11T00:00:00Z",
            "timezone": "Africa/Algiers",
            "biological_contexts": [{
                "context_id": "5c2b3a4d-5e6f-4789-8123-456789abcdef",
                "valid_from": "2026-11-01",
                "valid_to": None,
                "organism_kind": "fungus",
                "taxon_code": "Pleurotus ostreatus",
                "strain_code": "BA-P80",
                "cultivar_code": None,
                "culture_stage": "fruiting",
                "substrate_code": "wheat-straw",
                "production_system": "bucket",
                "context_tags": [],
                "genetic_reference": {
                    "status": "not_specified",
                    "strain_id": None,
                    "organism_id": None,
                    "designation": None,
                    "origin": None,
                    "source_description": None,
                    "scientific_name": None,
                    "common_name": None,
                    "taxonomy_source": None,
                    "taxonomy_id": None,
                },
            }],
            "interpretation_rules": [{
                "rule_id": "mycology.air_temperature.upper_bound",
                "rule_version": "1.0.0",
                "feature_code": "series.measurement.air_temperature.maximum",
                "operator": "gt",
                "threshold": 22.0,
                "unit_code": "degC",
                "statement": "Observed maximum exceeds the configured reference threshold.",
                "context_match": {
                    "taxon_code": "Pleurotus ostreatus",
                    "strain_code": "BA-P80",
                    "culture_stage": "fruiting",
                },
                "reference_id": "ba-labs.protocols.pleurotus-fruiting",
                "reference_version": "2026.1",
            }],
        }
        request["datasets"].append({
            "provider": "BA_LABS_RULE_REGISTRY",
            "dataset_id": "ba-labs.protocols.pleurotus-fruiting",
            "dataset_version": "2026.1",
            "content_sha256": "d" * 64,
            "retrieved_at": "2026-11-10T07:55:00Z",
        })
        request["datasets"].append({
            "provider": "BA_LABS_INTERPRETATION_PROFILE",
            "dataset_id": "biological.context.features",
            "dataset_version": "1.0.0",
            "content_sha256": "e" * 64,
            "retrieved_at": "2026-11-10T07:55:00Z",
        })
        missing_registry = json.loads(json.dumps(request))
        missing_registry["datasets"] = [
            dataset for dataset in missing_registry["datasets"]
            if dataset["provider"] != "BA_LABS_RULE_REGISTRY"
        ]
        with self.assertRaisesRegex(ValueError, "interpretation_rule_reference_not_in_dataset_manifest"):
            analyze_biological_context_features(missing_registry)

        missing_profile_manifest = json.loads(json.dumps(request))
        missing_profile_manifest["datasets"] = [
            dataset for dataset in missing_profile_manifest["datasets"]
            if dataset["provider"] != "BA_LABS_INTERPRETATION_PROFILE"
        ]
        with self.assertRaisesRegex(ValueError, "interpretation_profile_manifest_required"):
            analyze_biological_context_features(missing_profile_manifest)

        invalid_profile_manifest = json.loads(json.dumps(request))
        next(dataset for dataset in invalid_profile_manifest["datasets"]
             if dataset["provider"] == "BA_LABS_INTERPRETATION_PROFILE")["dataset_id"] = "untrusted.profile"
        with self.assertRaisesRegex(ValueError, "invalid_interpretation_profile_manifest"):
            analyze_biological_context_features(invalid_profile_manifest)

        request["input"]["record_ids"] = []
        request["input"]["records"] = []
        for index, value in enumerate([21.0, 23.0, 22.0]):
            record_id = f"dc2b3a4d-5e6f-4789-8123-456789abcde{index}"
            request["input"]["record_ids"].append(record_id)
            request["input"]["records"].append({
                "record_id": record_id,
                "record_type": "measurement",
                "payload_sha256": "e" * 64,
                "data": {
                    "variable_code": "air_temperature",
                    "normalized_value": value,
                    "normalized_unit_code": "degC",
                    "measured_at": f"2026-11-10T{8 + index:02d}:00:00Z",
                },
                "context": {"culture_id": culture_id},
            })
        result = execute_registered_engine(request)
        self.assertEqual(result["status"], "completed", msg=str(result.get("error")))
        value = result["result"]["value"]
        self.assertEqual(len(value["findings"]), 1)
        finding = value["findings"][0]
        self.assertEqual(finding["finding_code"], "mycology.air_temperature.upper_bound")
        self.assertEqual(finding["evidence_state"], "limited")
        self.assertEqual(finding["supporting_record_ids"], sorted(request["input"]["record_ids"]))
        self.assertEqual(
            finding["derived_feature_codes"],
            ["series.measurement.air_temperature.maximum"],
        )
        self.assertIn("rule_version=1.0.0", finding["statement"])
        self.assertIn("reference=ba-labs.protocols.pleurotus-fruiting@2026.1", finding["statement"])
        self.assertIn("BA_LABS_RULE_REGISTRY/ba-labs.protocols.pleurotus-fruiting@2026.1#sha256=" + ("d" * 64), result["result"]["provenance"]["source_references"])
        self.assertIn("BA_LABS_INTERPRETATION_PROFILE/biological.context.features@1.0.0#sha256=" + ("e" * 64), result["result"]["provenance"]["source_references"])
        mismatched_context = json.loads(json.dumps(request))
        mismatched_context["parameters"]["biological_contexts"][0]["strain_code"] = "OTHER-STRAIN"
        mismatch_result = execute_registered_engine(mismatched_context)
        self.assertEqual(mismatch_result["status"], "completed")
        self.assertEqual(mismatch_result["result"]["value"]["findings"], [])
        self.assertIn("rule_based_interpretation_evaluated_no_findings", mismatch_result["result"]["quality_flags"])

        unconfigured = json.loads(json.dumps(mismatched_context))
        unconfigured["parameters"]["interpretation_rules"] = []
        unconfigured["parameters"]["interpretation_profile_state"] = "not_configured"
        unconfigured["datasets"] = []
        unconfigured["input"]["record_ids"] = []
        unconfigured["input"]["records"] = []
        unconfigured_result = execute_registered_engine(unconfigured)
        self.assertEqual(unconfigured_result["status"], "completed")
        self.assertIn("no_active_interpretation_profile", unconfigured_result["result"]["value"]["coverage"]["missing_context"])
        self.assertIn("interpretation_profile_not_available", unconfigured_result["result"]["quality_flags"])

        unstable_context = json.loads(json.dumps(unconfigured))
        unstable_context["parameters"]["interpretation_profile_state"] = "context_not_stable"
        unstable_result = execute_registered_engine(unstable_context)
        self.assertIn("biological_context_not_stable_for_full_window", unstable_result["result"]["value"]["coverage"]["missing_context"])
        self.assertIn("interpretation_profile_not_applied_context_changed", unstable_result["result"]["quality_flags"])
        self.assertNotIn("biological_interpretation_not_performed", mismatch_result["result"]["quality_flags"])

    def test_biological_context_features_uses_half_open_analysis_window(self):
        request = json.loads(json.dumps(REQUEST))
        request["engine"] = {
            "engine_id": "biological.context.features",
            "engine_version": "0.1.0",
        }
        culture_id = "2c2b3a4d-5e6f-4789-8123-456789abcdef"
        request["scope"] = {
            "organization_id": REQUEST["scope"]["organization_id"],
            "culture_id": culture_id,
        }
        request["parameters"] = {
            "window_start": "2026-11-10T00:00:00Z",
            "window_end": "2026-11-11T00:00:00Z",
            "timezone": "Africa/Algiers",
        }
        request["input"]["record_ids"] = []
        request["input"]["records"] = []
        for index, timestamp in enumerate([
            "2026-11-10T00:00:00Z",
            "2026-11-11T00:00:00Z",
        ]):
            record_id = f"bc2b3a4d-5e6f-4789-8123-456789abcde{index}"
            request["input"]["record_ids"].append(record_id)
            request["input"]["records"].append({
                "record_id": record_id,
                "record_type": "measurement",
                "payload_sha256": "f" * 64,
                "data": {
                    "variable_code": "air_temperature",
                    "normalized_value": 22.0 + index,
                    "normalized_unit_code": "degC",
                    "measured_at": timestamp,
                },
                "context": {"culture_id": culture_id},
            })
        result = execute_registered_engine(request)
        self.assertEqual(result["status"], "completed", msg=str(result.get("error")))
        value = result["result"]["value"]
        self.assertEqual(value["coverage"]["source_record_count"], 1)
        self.assertEqual(value["coverage"]["excluded_record_count"], 1)
        self.assertEqual(
            value["observed_facts"][0]["source_record_ids"],
            [request["input"]["record_ids"][0]],
        )
        self.assertIn("some_input_records_were_excluded", value["coverage"]["missing_context"])

    def test_biological_context_features_excludes_invalid_scope_and_explicitly_excluded_measurements(self):
        request = json.loads(json.dumps(REQUEST))
        request["engine"] = {
            "engine_id": "biological.context.features",
            "engine_version": "0.1.0",
        }
        culture_id = "2c2b3a4d-5e6f-4789-8123-456789abcdef"
        other_culture_id = "5c2b3a4d-5e6f-4789-8123-456789abcdef"
        request["scope"] = {
            "organization_id": REQUEST["scope"]["organization_id"],
            "culture_id": culture_id,
        }
        request["parameters"] = {
            "window_start": "2026-11-10T00:00:00Z",
            "window_end": "2026-11-11T00:00:00Z",
            "timezone": "Africa/Algiers",
        }
        request["input"]["record_ids"] = []
        request["input"]["records"] = []
        for index, (record_culture, quality_state) in enumerate([
            (culture_id, "valid"),
            (culture_id, "excluded"),
            (other_culture_id, "valid"),
        ]):
            record_id = f"7c2b3a4d-5e6f-4789-8123-456789abcde{index}"
            request["input"]["record_ids"].append(record_id)
            request["input"]["records"].append({
                "record_id": record_id,
                "record_type": "measurement",
                "payload_sha256": "c" * 64,
                "data": {
                    "variable_code": "air_temperature",
                    "normalized_value": 20.0 + index,
                    "normalized_unit_code": "degC",
                    "measured_at": f"2026-11-10T0{8 + index}:00:00Z",
                    "quality_state": quality_state,
                },
                "context": {"culture_id": record_culture},
            })
        result = execute_registered_engine(request)
        self.assertEqual(result["status"], "completed", msg=str(result.get("error")))
        coverage = result["result"]["value"]["coverage"]
        self.assertEqual(coverage["source_record_count"], 1)
        self.assertEqual(coverage["excluded_record_count"], 2)
        self.assertIn("input_records_excluded", result["result"]["quality_flags"])
        self.assertEqual(result["result"]["value"]["derived_features"][0]["source_record_ids"], [request["input"]["record_ids"][0]])


    def test_biological_context_features_reports_unlinked_environment_as_missing_context(self):
        request = json.loads(json.dumps(REQUEST))
        request["engine"] = {
            "engine_id": "biological.context.features",
            "engine_version": "0.1.0",
        }
        culture_id = "2c2b3a4d-5e6f-4789-8123-456789abcdef"
        request["scope"] = {
            "organization_id": REQUEST["scope"]["organization_id"],
            "culture_id": culture_id,
        }
        request["parameters"] = {
            "window_start": "2026-11-10T00:00:00Z",
            "window_end": "2026-11-11T00:00:00Z",
            "timezone": "Africa/Algiers",
            "environment_link_state": "unlinked",
        }
        record_id = "9c2b3a4d-5e6f-4789-8123-456789abcdef"
        request["input"]["record_ids"] = [record_id]
        request["input"]["records"] = [{
            "record_id": record_id,
            "record_type": "measurement",
            "payload_sha256": "d" * 64,
            "data": {
                "variable_code": "air_temperature",
                "normalized_value": 22.0,
                "normalized_unit_code": "degC",
                "measured_at": "2026-11-10T08:00:00Z",
            },
            "context": {"culture_id": culture_id},
        }]
        result = execute_registered_engine(request)
        self.assertEqual(result["status"], "completed", msg=str(result.get("error")))
        missing = result["result"]["value"]["coverage"]["missing_context"]
        self.assertIn("culture_environment_not_linked", missing)



    def test_biological_context_features_reports_ambiguous_or_conflicting_environment_links(self):
        request = json.loads(json.dumps(REQUEST))
        request["engine"] = {
            "engine_id": "biological.context.features",
            "engine_version": "0.1.0",
        }
        culture_id = "2c2b3a4d-5e6f-4789-8123-456789abcdef"
        request["scope"] = {
            "organization_id": REQUEST["scope"]["organization_id"],
            "culture_id": culture_id,
        }
        request["parameters"] = {
            "window_start": "2026-11-10T00:00:00Z",
            "window_end": "2026-11-13T00:00:00Z",
            "timezone": "Africa/Algiers",
            "environment_link_state": "ambiguous",
        }
        record_id = "ac2b3a4d-5e6f-4789-8123-456789abcdef"
        request["input"]["record_ids"] = [record_id]
        request["input"]["records"] = [{
            "record_id": record_id,
            "record_type": "measurement",
            "payload_sha256": "e" * 64,
            "data": {
                "variable_code": "air_temperature",
                "normalized_value": 22.0,
                "normalized_unit_code": "degC",
                "measured_at": "2026-11-10T08:00:00Z",
            },
            "context": {
                "culture_id": culture_id,
                "environment_resolution": {
                    "status": "conflict",
                    "reason": "measurement_environment_context_mismatch",
                    "environment_id": None,
                    "location_id": None,
                },
            },
        }]
        result = execute_registered_engine(request)
        self.assertEqual(result["status"], "completed", msg=str(result.get("error")))
        missing = result["result"]["value"]["coverage"]["missing_context"]
        self.assertIn("analysis_window_environment_ambiguous", missing)
        self.assertIn("measurement_environment_context_conflict", missing)
        self.assertIn("environment_context_ambiguous", result["result"]["quality_flags"])
        self.assertIn("environment_context_conflict", result["result"]["quality_flags"])

    def test_biological_context_features_accepts_empty_snapshot_as_insufficient_data(self):
        request = json.loads(json.dumps(REQUEST))
        request["engine"] = {
            "engine_id": "biological.context.features",
            "engine_version": "0.1.0",
        }
        request["scope"] = {
            "organization_id": REQUEST["scope"]["organization_id"],
            "culture_id": "2c2b3a4d-5e6f-4789-8123-456789abcdef",
        }
        request["parameters"] = {
            "window_start": "2026-11-10T00:00:00Z",
            "window_end": "2026-11-11T00:00:00Z",
            "timezone": "Africa/Algiers",
            "environment_link_state": "unlinked",
        }
        request["input"]["record_ids"] = []
        request["input"]["records"] = []
        result = execute_registered_engine(request)
        self.assertEqual(result["status"], "completed", msg=str(result.get("error")))
        self.assertEqual(result["result"]["outcome"], "insufficient_data")
        value = result["result"]["value"]
        self.assertEqual(value["coverage"]["source_record_count"], 0)
        self.assertIsNone(value["coverage"]["observed_window"])
        self.assertEqual(value["observed_facts"], [])
        self.assertEqual(value["derived_features"], [])
        self.assertIn("culture_environment_not_linked", value["coverage"]["missing_context"])
        self.assertIn("insufficient_data", result["result"]["quality_flags"])

        non_biological = json.loads(json.dumps(request))
        non_biological["engine"] = {
            "engine_id": "environmental.timeseries.qc",
            "engine_version": "0.2.0",
        }
        with self.assertRaisesRegex(ContractValidationError, "record_ids.*non-empty"):
            validate_request(non_biological)


    def test_biological_context_features_preserves_time_bounded_genetic_context(self):
        request = json.loads(json.dumps(REQUEST))
        request["engine"] = {
            "engine_id": "biological.context.features",
            "engine_version": "0.1.0",
        }
        request["scope"] = {
            "organization_id": REQUEST["scope"]["organization_id"],
            "culture_id": "2c2b3a4d-5e6f-4789-8123-456789abcdef",
        }
        strain_id = "99999999-9999-4999-8999-999999999999"
        organism_id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab"
        request["parameters"] = {
            "window_start": "2026-11-10T00:00:00Z",
            "window_end": "2026-11-11T00:00:00Z",
            "timezone": "Africa/Algiers",
            "biological_context_supplied": True,
            "biological_contexts": [{
                "context_id": "77777777-7777-4777-8777-777777777777",
                "valid_from": "2026-11-01",
                "valid_to": None,
                "organism_kind": "fungus",
                "taxon_code": "PLEURO",
                "strain_code": "HK35",
                "cultivar_code": None,
                "culture_stage": "fruiting",
                "substrate_code": "straw",
                "production_system": "monotub",
                "context_tags": ["fruiting-run"],
                "genetic_reference": {
                    "status": "resolved",
                    "strain_id": strain_id,
                    "organism_id": organism_id,
                    "designation": "HK35",
                    "origin": "reference collection",
                    "source_description": "verified strain record",
                    "scientific_name": "Pleurotus ostreatus",
                    "common_name": "Oyster mushroom",
                    "taxonomy_source": "NCBI",
                    "taxonomy_id": "NCBI:fungus-example",
                },
            }],
        }
        request["input"]["record_ids"] = []
        request["input"]["records"] = []
        result = execute_registered_engine(request)
        self.assertEqual(result["status"], "completed", msg=str(result.get("error")))
        value = result["result"]["value"]
        biological_schema = json.loads((ROOT / "schemas" / "biological" / "v1" / "context-assessment.schema.json").read_text(encoding="utf-8"))
        Draft202012Validator(biological_schema, format_checker=FormatChecker()).validate(value)
        self.assertEqual(value["subject"]["genetic_reference_ids"], [strain_id])
        self.assertEqual(value["subject"]["biological_contexts"][0]["culture_stage"], "fruiting")
        self.assertEqual(value["subject"]["biological_contexts"][0]["genetic_reference"]["scientific_name"], "Pleurotus ostreatus")
        self.assertNotIn("biological_context_not_recorded", value["coverage"]["missing_context"])
        self.assertEqual(result["result"]["outcome"], "insufficient_data")


    def test_biological_context_features_supports_plant_culture_subjects(self):
        request = json.loads(json.dumps(REQUEST))
        request["engine"] = {
            "engine_id": "biological.context.features",
            "engine_version": "0.2.0",
        }
        plant_culture_id = "7c2b3a4d-5e6f-4789-8123-456789abcdef"
        request["scope"] = {
            "organization_id": REQUEST["scope"]["organization_id"],
            "plant_culture_id": plant_culture_id,
        }
        request["parameters"] = {
            "window_start": "2026-11-10T00:00:00Z",
            "window_end": "2026-11-11T00:00:00Z",
            "timezone": "Africa/Algiers",
            "environment_link_state": "resolved",
            "biological_context_supplied": True,
            "biological_contexts": [{
                "context_id": "77777777-7777-4777-8777-777777777777",
                "valid_from": "2026-11-01",
                "valid_to": None,
                "organism_kind": "plant",
                "taxon_code": "Solanum lycopersicum",
                "strain_code": None,
                "cultivar_code": "Yellow Pear",
                "culture_stage": "vegetative",
                "substrate_code": "Technosoil",
                "production_system": "greenhouse",
                "context_tags": ["greentech-trial"],
                "genetic_reference": {
                    "status": "not_specified", "strain_id": None, "organism_id": None,
                    "designation": None, "origin": None, "source_description": None,
                    "scientific_name": None, "common_name": None,
                    "taxonomy_source": None, "taxonomy_id": None,
                },
            }],
        }
        record_id = "ac2b3a4d-5e6f-4789-8123-456789abcdef"
        request["input"]["record_ids"] = [record_id]
        request["input"]["records"] = [{
            "record_id": record_id,
            "record_type": "measurement",
            "payload_sha256": "e" * 64,
            "data": {
                "variable_code": "air_temperature",
                "normalized_value": 24.0,
                "normalized_unit_code": "degC",
                "measured_at": "2026-11-10T08:00:00Z",
            },
            "context": {
                "plant_culture_id": plant_culture_id,
                "environment_id": "8c2b3a4d-5e6f-4789-8123-456789abcdef",
                "environment_resolution": {
                    "status": "resolved", "reason": None,
                    "environment_id": "8c2b3a4d-5e6f-4789-8123-456789abcdef",
                    "location_id": None,
                },
            },
        }]
        result = execute_registered_engine(request)
        self.assertEqual(result["status"], "completed", msg=str(result.get("error")))
        self.assertEqual(result["result"]["outcome"], "success")
        value = result["result"]["value"]
        self.assertEqual(value["subject"]["subject_type"], "plant")
        self.assertEqual(value["subject"]["subject_id"], plant_culture_id)
        self.assertEqual(value["subject"]["plant_culture_id"], plant_culture_id)
        self.assertIsNone(value["subject"]["culture_id"])
        self.assertEqual(value["subject"]["biological_contexts"][0]["organism_kind"], "plant")
        self.assertEqual(value["coverage"]["source_record_count"], 1)
        schema = json.loads((ROOT / "schemas" / "biological" / "v1" / "context-assessment.schema.json").read_text(encoding="utf-8"))
        validator(schema).validate(value)



    def test_biological_context_features_preserves_validated_identity_assertions(self):
        request = json.loads(json.dumps(REQUEST))
        request["engine"] = {
            "engine_id": "biological.context.features",
            "engine_version": "0.1.0",
        }
        request["scope"] = {
            "organization_id": REQUEST["scope"]["organization_id"],
            "culture_id": "2c2b3a4d-5e6f-4789-8123-456789abcdef",
        }
        assertion = {
            "assertion_code": "strain.identity.designation",
            "assertion_version": "1.0.0",
            "subject_type": "strain",
            "organism_id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab",
            "strain_id": "99999999-9999-4999-8999-999999999999",
            "assertion_type": "strain.designation",
            "assertion_value": "HK35",
            "evidence_level": "documented",
            "content_sha256": "b" * 64,
            "source_reference_id": "source.taxonomy",
            "source_reference_version": "1.0.0",
            "source_reference_sha256": "a" * 64,
            "reviewed_at": "2026-11-02T00:00:00Z",
            "valid_from": "2026-01-01",
            "valid_to": None,
        }
        request["parameters"] = {
            "window_start": "2026-11-10T00:00:00Z",
            "window_end": "2026-11-11T00:00:00Z",
            "timezone": "Africa/Algiers",
            "biological_identity_state": "documented",
            "biological_identity_assertions": [assertion],
        }
        request["datasets"] = [{
            "provider": "BA_LABS_BIOLOGICAL_IDENTITY",
            "dataset_id": assertion["assertion_code"],
            "dataset_version": assertion["assertion_version"],
            "content_sha256": "c" * 64,
            "retrieved_at": assertion["reviewed_at"],
        }]
        request["input"]["record_ids"] = []
        request["input"]["records"] = []
        result = execute_registered_engine(request)
        self.assertEqual(result["status"], "completed", msg=str(result.get("error")))
        value = result["result"]["value"]
        self.assertEqual(value["subject"]["identity_assertion_state"], "documented")
        self.assertEqual(value["subject"]["identity_assertions"], [assertion])
        self.assertIn("biological_identity_assertions_present", result["result"]["quality_flags"])
        self.assertTrue(any(
            source.startswith("BA_LABS_BIOLOGICAL_IDENTITY/strain.identity.designation@1.0.0#sha256=")
            for source in result["result"]["provenance"]["source_references"]
        ))
        schema = json.loads((ROOT / "schemas" / "biological" / "v1" / "context-assessment.schema.json").read_text(encoding="utf-8"))
        validator(schema).validate(value)



    def test_identity_scoped_interpretation_rule_requires_validated_identity(self):
        rule = {
            "rule_id": "strain-specific-humidity",
            "rule_version": "1.0.0",
            "feature_code": "mean_relative_humidity",
            "operator": "lt",
            "threshold": 85.0,
            "unit_code": "%",
            "statement": "Humidity below the strain-specific reference threshold.",
            "context_match": {"organism_kind": "fungus"},
            "reference_id": "humidity-reference",
            "reference_version": "1.0.0",
            "identity_match": {
                "assertion_type": "strain.designation",
                "assertion_value": "HK35",
            },
        }
        datasets = [
            {
                "provider": "BA_LABS_INTERPRETATION_PROFILE",
                "dataset_id": "biological.context.features",
                "dataset_version": "1.0.0",
                "content_sha256": "a" * 64,
            },
            {
                "provider": "BA_LABS_RULE_REGISTRY",
                "dataset_id": "humidity-reference",
                "dataset_version": "1.0.0",
                "content_sha256": "b" * 64,
            },
        ]
        contexts = [{
            "organism_kind": "fungus",
            "genetic_reference": {
                "organism_id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab",
                "strain_id": "99999999-9999-4999-8999-999999999999",
            },
        }]
        features = [{
            "feature_code": "mean_relative_humidity",
            "value": 70.0,
            "unit_code": "%",
            "source_record_ids": ["3c2b3a4d-5e6f-4789-8123-456789abcdef"],
        }]
        assertions = [{
            "assertion_type": "strain.designation",
            "assertion_value": "HK35",
            "subject_type": "strain",
            "organism_id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab",
            "strain_id": "99999999-9999-4999-8999-999999999999",
        }]
        unverified, _ = _evaluate_interpretation_rules(
            [rule], contexts, features, datasets, "not_documented", []
        )
        self.assertEqual(unverified, [])
        conflicting, _ = _evaluate_interpretation_rules(
            [rule], contexts, features, datasets, "conflicting", assertions
        )
        self.assertEqual(conflicting, [])
        documented, _ = _evaluate_interpretation_rules(
            [rule], contexts, features, datasets, "documented", assertions
        )
        self.assertEqual(len(documented), 1)
        self.assertEqual(documented[0]["evidence_state"], "limited")
        self.assertEqual(documented[0]["finding_code"], "strain-specific-humidity")
        mismatched_contexts = [{
            "organism_kind": "fungus",
            "genetic_reference": {
                "organism_id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab",
                "strain_id": "88888888-8888-4888-8888-888888888888",
            },
        }]
        mismatched, _ = _evaluate_interpretation_rules(
            [rule], mismatched_contexts, features, datasets, "documented", assertions
        )
        self.assertEqual(mismatched, [])



if __name__ == "__main__":
    unittest.main(verbosity=2)
