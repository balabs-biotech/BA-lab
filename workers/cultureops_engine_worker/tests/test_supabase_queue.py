import json
import unittest
from unittest.mock import patch

from bal_engine_worker.registry import EngineResult
from bal_engine_worker.supabase_queue import (
    LeaseLostError,
    QueueTransportError,
    SupabaseRestQueueClient,
)
from bal_engine_worker.worker import ClaimedJob


class FakeResponse:
    def __init__(self, value):
        self.raw = json.dumps(value).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read(self, size=-1):
        return self.raw if size < 0 else self.raw[:size]


def make_job():
    return ClaimedJob(
        job_id="job-1",
        organization_id="org-1",
        engine_code="demo",
        engine_version="1.0.0",
        payload={"value": 1},
        attempt_number=2,
        worker_id="worker-a",
        lease_token="lease-1",
    )


class SupabaseQueueAdapterTests(unittest.TestCase):
    def setUp(self):
        self.client = SupabaseRestQueueClient(
            "https://example.supabase.co", "test-secret", lease_seconds=60
        )

    @patch("bal_engine_worker.supabase_queue.urlopen")
    def test_claim_maps_postgrest_json_to_claimed_job(self, urlopen):
        urlopen.return_value = FakeResponse({
            "job_id": "job-1",
            "organization_id": "org-1",
            "engine_code": "demo",
            "engine_version": "1.0.0",
            "payload": {"value": 1},
            "attempt_number": 2,
            "worker_id": "worker-a",
            "lease_token": "lease-1",
        })
        job = self.client.claim_one("worker-a")
        self.assertEqual(job, make_job())
        request = urlopen.call_args.args[0]
        self.assertTrue(request.full_url.endswith("/rest/v1/rpc/claim_engine_job"))
        self.assertEqual(request.get_header("Authorization"), "Bearer test-secret")
        self.assertEqual(json.loads(request.data)["p_worker_id"], "worker-a")

    @patch("bal_engine_worker.supabase_queue.urlopen")
    def test_empty_claim_returns_none(self, urlopen):
        urlopen.return_value = FakeResponse(None)
        self.assertIsNone(self.client.claim_one("worker-a"))

    @patch("bal_engine_worker.supabase_queue.urlopen")
    def test_heartbeat_requires_boolean_true(self, urlopen):
        urlopen.return_value = FakeResponse(True)
        self.assertTrue(self.client.heartbeat(make_job(), lease_seconds=60))
        urlopen.return_value = FakeResponse(False)
        self.assertFalse(self.client.heartbeat(make_job(), lease_seconds=60))

    @patch("bal_engine_worker.supabase_queue.urlopen")
    def test_completion_serializes_result_and_rejects_stale_lease(self, urlopen):
        urlopen.return_value = FakeResponse(True)
        self.client.complete(
            make_job(),
            EngineResult(
                status="succeeded",
                data={"growth_index": 0.8},
                provenance={"engine": "demo"},
                summary="completed",
            ),
        )
        request = urlopen.call_args.args[0]
        body = json.loads(request.data)
        self.assertEqual(body["p_result"]["data"]["growth_index"], 0.8)
        self.assertEqual(body["p_result"]["provenance"]["engine"], "demo")

        urlopen.return_value = FakeResponse(False)
        with self.assertRaises(LeaseLostError):
            self.client.complete(make_job(), EngineResult(status="succeeded"))

    @patch("bal_engine_worker.supabase_queue.urlopen")
    def test_failure_maps_retry_outcome_and_detects_stale_lease(self, urlopen):
        urlopen.return_value = FakeResponse("retry_wait")
        self.client.fail(
            make_job(),
            error_code="timeout",
            error_message="upstream timeout",
            retryable=True,
        )
        urlopen.return_value = FakeResponse("lease_lost")
        with self.assertRaises(LeaseLostError):
            self.client.fail(
                make_job(),
                error_code="timeout",
                error_message="late failure",
                retryable=True,
            )

    @patch("bal_engine_worker.supabase_queue.urlopen")
    def test_transport_errors_are_reported_without_credentials(self, urlopen):
        from urllib.error import URLError
        urlopen.side_effect = URLError("offline")
        with self.assertRaises(QueueTransportError) as caught:
            self.client.claim_one("worker-a")
        self.assertNotIn("test-secret", str(caught.exception))

    @patch.dict(os.environ, {"SUPABASE_URL": "https://project.example", "SUPABASE_SERVICE_ROLE_KEY": "test-secret"})
    def test_from_env_passes_configured_lease_duration(self):
        client = SupabaseRestQueueClient.from_env(lease_seconds=12)
        self.assertEqual(client._lease_seconds, 12)

    def test_configuration_is_validated(self):
        with self.assertRaises(ValueError):
            SupabaseRestQueueClient("ftp://example", "secret")
        with self.assertRaises(ValueError):
            SupabaseRestQueueClient("https://example", "")


if __name__ == "__main__":
    unittest.main()
