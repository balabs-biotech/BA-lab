import unittest

from bal_engine_worker.registry import EngineExecutionContext, EngineRegistry, EngineResult
from bal_engine_worker.worker import ClaimedJob, EngineWorker


class DemoEngine:
    engine_code = "demo"
    engine_version = "1.0.0"

    def execute(self, context, payload):
        return EngineResult(
            status="succeeded",
            data={"value": payload["value"] + 1},
            summary=f"processed {context.job_id}",
        )


class BrokenEngine:
    engine_code = "broken"
    engine_version = "1.0.0"

    def execute(self, context, payload):
        raise TimeoutError("temporary upstream timeout")


class FakeQueue:
    def __init__(self, job):
        self.job = job
        self.completed = []
        self.failures = []

    def claim_one(self, worker_id):
        if self.job is None:
            return None
        job, self.job = self.job, None
        if job.worker_id != worker_id:
            raise AssertionError("worker identity mismatch")
        return job

    def complete(self, job, result):
        self.completed.append((job, result))

    def fail(self, job, **failure):
        self.failures.append((job, failure))


def make_job(engine_code="demo", engine_version="1.0.0"):
    return ClaimedJob(
        job_id="job-1",
        organization_id="org-1",
        engine_code=engine_code,
        engine_version=engine_version,
        payload={"value": 4},
        attempt_number=1,
        worker_id="worker-a",
        lease_token="fence-token-1",
    )


class WorkerTests(unittest.TestCase):
    def test_idle_queue_returns_idle(self):
        queue = FakeQueue(None)
        worker = EngineWorker(queue, EngineRegistry(), "worker-a")
        self.assertEqual(worker.run_once().status, "idle")

    def test_success_persists_only_after_engine_returns(self):
        registry = EngineRegistry()
        registry.register(DemoEngine())
        queue = FakeQueue(make_job())
        outcome = EngineWorker(queue, registry, "worker-a").run_once()

        self.assertEqual(outcome.status, "succeeded")
        self.assertEqual(len(queue.completed), 1)
        self.assertEqual(queue.completed[0][1].data["value"], 5)
        self.assertEqual(queue.failures, [])

    def test_unknown_exact_version_is_permanent_failure(self):
        registry = EngineRegistry()
        registry.register(DemoEngine())
        queue = FakeQueue(make_job(engine_version="9.9.9"))
        outcome = EngineWorker(queue, registry, "worker-a").run_once()

        self.assertEqual(outcome.error_code, "engine_not_registered")
        self.assertEqual(queue.failures[0][1]["retryable"], False)
        self.assertEqual(queue.completed, [])

    def test_engine_exception_isolated_and_classified(self):
        registry = EngineRegistry()
        registry.register(BrokenEngine())
        queue = FakeQueue(make_job(engine_code="broken"))
        worker = EngineWorker(
            queue, registry, "worker-a",
            failure_classifier=lambda exc: isinstance(exc, TimeoutError),
        )
        outcome = worker.run_once()

        self.assertEqual(outcome.status, "failed")
        self.assertEqual(queue.failures[0][1]["retryable"], True)
        self.assertEqual(queue.failures[0][1]["error_code"], "engine_execution_error")

    def test_completion_rejection_is_not_hidden(self):
        class RejectingQueue(FakeQueue):
            def complete(self, job, result):
                raise RuntimeError("lease token is stale")

        registry = EngineRegistry()
        registry.register(DemoEngine())
        worker = EngineWorker(RejectingQueue(make_job()), registry, "worker-a")
        with self.assertRaisesRegex(RuntimeError, "stale"):
            worker.run_once()

    def test_worker_id_must_be_present(self):
        with self.assertRaises(ValueError):
            EngineWorker(FakeQueue(None), EngineRegistry(), " ")


if __name__ == "__main__":
    unittest.main()
