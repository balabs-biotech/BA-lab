import unittest

from bal_engine_worker.environmental_qc import EnvironmentalQualityEngine
from bal_engine_worker.registry import EngineExecutionContext, EngineResult
from bal_engine_worker.runner import load_registry


def observation(**overrides):
    value = {
        "variable_code": "T2M",
        "value": 21.5,
        "unit_code": "°C",
        "observed_at": "2026-11-12T12:00:00Z",
        "provider_code": "NASA_POWER",
        "dataset_code": "POWER_DAILY",
        "spatial_resolution_m": 25000,
    }
    value.update(overrides)
    return value


class EnvironmentalQualityEngineTests(unittest.TestCase):
    def setUp(self):
        self.engine = EnvironmentalQualityEngine()
        self.context = EngineExecutionContext("qc-job", "org-qc", 1)

    def test_valid_observation_passes_without_inferred_thresholds(self):
        result = self.engine.execute(self.context, {"observations": [observation()]})
        self.assertIsInstance(result, EngineResult)
        self.assertEqual(result.data["quality_summary"]["valid"], 1)
        self.assertEqual(result.data["observations"][0]["qc_status"], "valid")
        self.assertFalse(result.provenance["unit_conversion"])

    def test_explicit_range_and_unit_rules_are_applied(self):
        result = self.engine.execute(self.context, {
            "observations": [observation(value=61, unit_code="K")],
            "rules": {"T2M": {"min": -50, "max": 60, "expected_unit": "°C"}},
        })
        row = result.data["observations"][0]
        self.assertEqual(row["qc_status"], "invalid")
        self.assertIn("unit_mismatch", row["qc_flags"])
        self.assertIn("above_configured_maximum", row["qc_flags"])

    def test_duplicate_variable_timestamp_is_warning(self):
        result = self.engine.execute(self.context, {
            "observations": [observation(), observation(value=22)],
        })
        self.assertEqual(result.data["quality_summary"]["warning"], 1)
        self.assertIn(
            "duplicate_variable_timestamp",
            result.data["observations"][1]["qc_flags"],
        )

    def test_missing_required_fields_are_invalid(self):
        result = self.engine.execute(self.context, {
            "observations": [{"variable_code": "T2M"}],
        })
        row = result.data["observations"][0]
        self.assertEqual(row["qc_status"], "invalid")
        self.assertIn("missing_value", row["qc_flags"])
        self.assertIn("missing_unit_code", row["qc_flags"])

    def test_naive_timestamp_is_invalid(self):
        result = self.engine.execute(self.context, {
            "observations": [observation(observed_at="2026-11-12T12:00:00")],
        })
        self.assertIn(
            "observed_at_must_be_timezone_aware_iso8601",
            result.data["observations"][0]["qc_flags"],
        )

    def test_non_finite_value_is_invalid(self):
        result = self.engine.execute(self.context, {
            "observations": [observation(value=float("nan"))],
        })
        self.assertIn(
            "value_must_be_finite_number",
            result.data["observations"][0]["qc_flags"],
        )

    def test_non_finite_spatial_resolution_is_sanitized(self):
        result = self.engine.execute(self.context, {
            "observations": [observation(spatial_resolution_m=float("inf"))],
        })
        row = result.data["observations"][0]
        self.assertEqual(row["qc_status"], "invalid")
        self.assertIn("invalid_spatial_resolution_m", row["qc_flags"])
        self.assertIsNone(row["observation"]["spatial_resolution_m"])

    def test_invalid_rule_contract_fails_job(self):
        with self.assertRaisesRegex(ValueError, "minimum cannot exceed maximum"):
            self.engine.execute(self.context, {
                "observations": [observation()],
                "rules": {"T2M": {"min": 70, "max": 10}},
            })

    def test_plugin_registers_exact_version(self):
        registry = load_registry("bal_engine_worker.environmental_engine")
        engine = registry.resolve("environmental.qc", "1.0.0")
        self.assertIsInstance(engine, EnvironmentalQualityEngine)


if __name__ == "__main__":
    unittest.main()
