"""Regression tests for the BIE's half-open analysis window semantics."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ba_engine_contract import execute_registered_engine


class BiologicalWindowBoundaryTests(unittest.TestCase):
    def test_analysis_window_includes_start_and_excludes_end(self):
        organization_id = "1c2b3a4d-5e6f-4789-8123-456789abcdef"
        culture_id = "2c2b3a4d-5e6f-4789-8123-456789abcdef"
        start_id = "3c2b3a4d-5e6f-4789-8123-456789abcdef"
        end_id = "4c2b3a4d-5e6f-4789-8123-456789abcdef"

        request = {
            "contract": "BA-LABS/ENGINE",
            "contract_version": "1.0.0",
            "request_id": "8e6f7f8c-1e52-4d2c-9d9f-2f8e4f0f4c11",
            "created_at": "2026-11-13T10:00:00Z",
            "engine": {
                "engine_id": "biological.context.features",
                "engine_version": "0.1.0",
            },
            "scope": {
                "organization_id": organization_id,
                "culture_id": culture_id,
            },
            "input": {
                "record_ids": [start_id, end_id],
                "snapshot_sha256": "a" * 64,
                "records": [
                    {
                        "record_id": start_id,
                        "record_type": "measurement",
                        "payload_sha256": "b" * 64,
                        "data": {
                            "variable_code": "air_temperature",
                            "normalized_value": 21.0,
                            "normalized_unit_code": "degC",
                            "measured_at": "2026-11-10T00:00:00Z",
                            "quality_state": "valid",
                        },
                        "context": {"culture_id": culture_id},
                    },
                    {
                        "record_id": end_id,
                        "record_type": "measurement",
                        "payload_sha256": "c" * 64,
                        "data": {
                            "variable_code": "air_temperature",
                            "normalized_value": 99.0,
                            "normalized_unit_code": "degC",
                            "measured_at": "2026-11-11T00:00:00Z",
                            "quality_state": "valid",
                        },
                        "context": {"culture_id": culture_id},
                    },
                ],
            },
            "parameters": {
                "window_start": "2026-11-10T00:00:00Z",
                "window_end": "2026-11-11T00:00:00Z",
                "timezone": "Africa/Algiers",
                "environment_link_state": "unlinked",
            },
            "datasets": [],
        }

        execution = execute_registered_engine(request)
        self.assertEqual(execution["status"], "completed", msg=str(execution.get("error")))

        value = execution["result"]["value"]
        coverage = value["coverage"]
        self.assertEqual(coverage["source_record_count"], 1)
        self.assertEqual(coverage["excluded_record_count"], 1)
        self.assertEqual(
            [fact["source_record_ids"][0] for fact in value["observed_facts"]],
            [start_id],
        )
        self.assertTrue(
            any(item["record_id"] == end_id and item["reason"] == "outside_requested_window"
                for item in coverage["excluded_records"])
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
