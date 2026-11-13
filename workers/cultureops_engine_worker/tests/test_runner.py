import threading
import unittest
from unittest.mock import patch

from bal_engine_worker.registry import EngineRegistry
from bal_engine_worker.runner import load_registry, run_poll_loop
from bal_engine_worker.supabase_queue import QueueTransportError


class FakeWorker:
    def __init__(self, outcomes=None, errors=None):
        self.outcomes = list(outcomes or [])
        self.errors = list(errors or [])
        self.calls = 0

    def run_once(self):
        self.calls += 1
        if self.errors:
            raise self.errors.pop(0)
        if self.outcomes:
            return self.outcomes.pop(0)
        return type("Outcome", (), {"status": "idle", "job_id": None})()


class RunnerTests(unittest.TestCase):
    def test_default_demo_plugin_registers_exact_engine_version(self):
        registry = load_registry("bal_engine_worker.demo_engine")
        self.assertEqual(registry.registered(), (("demo.identity", "1.0.0"),))

    def test_missing_plugin_registration_function_is_rejected(self):
        with patch("bal_engine_worker.runner.importlib.import_module", return_value=object()):
            with self.assertRaisesRegex(TypeError, "register_engines"):
                load_registry("not_a_plugin")

    def test_one_shot_claims_at_most_one_job(self):
        worker = FakeWorker(outcomes=[type("Outcome", (), {"status": "succeeded", "job_id": "j1"})()])
        self.assertEqual(run_poll_loop(worker, once=True), 0)
        self.assertEqual(worker.calls, 1)

    def test_one_shot_returns_failure_for_failed_job(self):
        worker = FakeWorker(outcomes=[type("Outcome", (), {"status": "failed", "job_id": "j1"})()])
        self.assertEqual(run_poll_loop(worker, once=True), 1)

    def test_one_shot_reports_transport_failure(self):
        worker = FakeWorker(errors=[QueueTransportError("offline")])
        self.assertEqual(run_poll_loop(worker, once=True), 1)

    def test_continuous_loop_stops_on_event_after_idle_poll(self):
        stop = threading.Event()
        worker = FakeWorker()
        def stop_after_wait(seconds):
            stop.set()
        self.assertEqual(
            run_poll_loop(worker, poll_interval_seconds=0.01, stop_event=stop, sleep=stop_after_wait),
            0,
        )
        self.assertEqual(worker.calls, 1)

    def test_transport_failure_is_retried_until_stop_requested(self):
        stop = threading.Event()
        worker = FakeWorker(errors=[QueueTransportError("offline")])
        original_wait = stop.wait
        waits = []
        def wait_then_stop(seconds):
            waits.append(seconds)
            stop.set()
            return original_wait(0)
        with patch.object(stop, "wait", side_effect=wait_then_stop):
            self.assertEqual(run_poll_loop(worker, stop_event=stop), 0)
        self.assertEqual(worker.calls, 1)
        self.assertEqual(len(waits), 1)

    def test_poll_interval_must_be_positive(self):
        with self.assertRaises(ValueError):
            run_poll_loop(FakeWorker(), poll_interval_seconds=0)


if __name__ == "__main__":
    unittest.main()
