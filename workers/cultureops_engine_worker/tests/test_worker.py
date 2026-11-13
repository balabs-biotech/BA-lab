import threading
import time
import unittest

from bal_engine_worker.registry import EngineRegistry, EngineResult
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


class BlockingEngine:
    engine_code = "blocking"
    engine_version = "1.0.0"

    def __init__(self, heartbeat_seen):
        self.heartbeat_seen = heartbeat_seen

    def execute(self, context, payload):
        if not self.heartbeat_seen.wait(timeout=1):
            raise AssertionError("heartbeat did not run while engine was executing")
        return EngineResult(status="succeeded", data={}, summary="done")


class FakeQueue:
    def __init__(self, job, heartbeat_result=True):
        self.job = job
        self.heartbeat_result = heartbeat_result
        self.completed = []
        self.failures = []
        self.heartbeats = []
        self.heartbeat_seen = threading.Event()

    def claim_one(self, worker_id):
        if self.job is None:
            return None
        job, self.job = self.job, None
        if job.worker_id != worker_id:
            raise AssertionError("worker identity mismatch")
        return job

    def heartbeat(self, job, *, lease_seconds):
        self.heartbeats.append((job, lease_seconds))
        self.heartbeat_seen.set()
        return self.heartbeat_result

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

    def test_heartbeat_runs_during_long_engine_execution(self):
        registry = EngineRegistry()
        queue = FakeQueue(make_job(engine_code="blocking"))
        registry.register(BlockingEngine(queue.heartbeat_seen))
        worker = EngineWorker(
            queue, registry, "worker-a",
            lease_seconds=3, heartbeat_interval_seconds=0.02,
        )
        outcome = worker.run_once()

        self.assertEqual(outcome.status, "succeeded")
        self.assertGreaterEqual(len(queue.heartbeats), 1)
        self.assertEqual(queue.heartbeats[0][1], 3)

    def test_lost_lease_prevents_result_and_failure_writes(self):
        registry = EngineRegistry()
        queue = FakeQueue(make_job(engine_code="blocking"), heartbeat_result=False)
        registry.register(BlockingEngine(queue.heartbeat_seen))
        worker = EngineWorker(
            queue, registry, "worker-a",
            lease_seconds=3, heartbeat_interval_seconds=0.02,
        )
        outcome = worker.run_once()

        self.assertEqual(outcome.status, "lease_lost")
        self.assertEqual(queue.completed, [])
        self.assertEqual(queue.failures, [])

    def test_heartbeat_configuration_is_bounded(self):
        with self.assertRaises(ValueError):
            EngineWorker(FakeQueue(None), EngineRegistry(), "worker-a", lease_seconds=2)
        with self.assertRaises(ValueError):
            EngineWorker(
                FakeQueue(None), EngineRegistry(), "worker-a",
                lease_seconds=10, heartbeat_interval_seconds=10,
            )


if __name__ == "__main__":
    unittest.main()
