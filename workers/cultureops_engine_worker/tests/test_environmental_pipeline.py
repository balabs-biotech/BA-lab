import unittest

from bal_engine_worker.runner import load_registry
from bal_engine_worker.worker import ClaimedJob, EngineWorker


class InMemoryQueue:
    def __init__(self, job):
        self.job = job
        self.completed = []
        self.failures = []

    def claim_one(self, worker_id):
        if self.job is None:
            return None
        job, self.job = self.job, None
        return job

    def heartbeat(self, job, *, lease_seconds):
        return True

    def complete(self, job, result):
        self.completed.append((job, result))

    def fail(self, job, **failure):
        self.failures.append((job, failure))


class EnvironmentalPipelineTests(unittest.TestCase):
    def test_environmental_qc_plugin_executes_through_worker_boundary(self):
        registry = load_registry("bal_engine_worker.environmental_engine")
        payload = {
            "observations": [
                {
                    "variable_code": "T2M",
                    "value": 21.5,
                    "unit_code": "°C",
                    "observed_at": "2026-11-12T12:00:00Z",
                    "provider_code": "NASA_POWER",
                    "dataset_code": "POWER_DAILY",
                },
                {
                    "variable_code": "T2M",
                    "value": 22.0,
                    "unit_code": "°C",
                    "observed_at": "2026-11-12T12:00:00Z",
                    "provider_code": "NASA_POWER",
                    "dataset_code": "POWER_DAILY",
                },
            ],
            "rules": {"T2M": {"min": -50, "max": 60, "expected_unit": "°C"}},
        }
        job = ClaimedJob(
            job_id="environmental-qc-job",
            organization_id="org-demo",
            engine_code="environmental.qc",
            engine_version="1.0.0",
            payload=payload,
            attempt_number=1,
            worker_id="test-worker",
            lease_token="fence-qc",
        )
        queue = InMemoryQueue(job)
        worker = EngineWorker(
            queue, registry, "test-worker",
            lease_seconds=3, heartbeat_interval_seconds=1,
        )

        outcome = worker.run_once()

        self.assertEqual(outcome.status, "succeeded")
        self.assertEqual(len(queue.completed), 1)
        result = queue.completed[0][1]
        self.assertEqual(result.data["quality_summary"]["valid"], 1)
        self.assertEqual(result.data["quality_summary"]["warning"], 1)
        self.assertEqual(result.provenance["engine_code"], "environmental.qc")
        self.assertEqual(queue.failures, [])


if __name__ == "__main__":
    unittest.main()
