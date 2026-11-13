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


class DemoPipelineTests(unittest.TestCase):
    def test_demo_plugin_executes_through_worker_boundary(self):
        registry = load_registry("bal_engine_worker.demo_engine")
        job = ClaimedJob(
            job_id="demo-job-1",
            organization_id="org-demo",
            engine_code="demo.identity",
            engine_version="1.0.0",
            payload={"sample": "cultureops", "measurement": 12.5},
            attempt_number=1,
            worker_id="test-worker",
            lease_token="fence-demo",
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
        self.assertEqual(result.data["echo"]["sample"], "cultureops")
        self.assertEqual(result.provenance["organization_id"], "org-demo")
        self.assertEqual(queue.failures, [])


if __name__ == "__main__":
    unittest.main()
