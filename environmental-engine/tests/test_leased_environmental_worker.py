from __future__ import annotations

import threading
from uuid import uuid4

import pytest

from ba_environmental_engine.execution.leased_worker import (
    JobOutcome,
    LeaseLostError,
    LeaseSettings,
    LeasedEnvironmentalWorker,
)


def _job():
    return {
        "id": str(uuid4()),
        "lease_token": str(uuid4()),
        "status": "processing",
        "job_type": "sentinel2_scene_ingestion",
        "request_parameters": {"max_scenes": 5},
    }


def test_claim_process_and_complete_with_same_lease_token():
    job = _job()
    calls = []

    def rpc(name, params):
        calls.append((name, params))
        if name == "claim_environmental_ingestion_job":
            return [job]
        if name == "complete_environmental_ingestion_job":
            return True
        raise AssertionError(f"unexpected RPC: {name}")

    worker = LeasedEnvironmentalWorker(
        rpc=rpc,
        processor=lambda claimed, stop: JobOutcome(
            "succeeded", {"scenes_seen": 2}, scenes_processed=2, observations_submitted=4
        ),
        settings=LeaseSettings("test-worker-01", lease_seconds=30, heartbeat_interval_seconds=5),
    )

    assert worker.run_once() is True
    claim = next(params for name, params in calls if name == "claim_environmental_ingestion_job")
    complete = next(params for name, params in calls if name == "complete_environmental_ingestion_job")
    assert claim["p_worker_id"] == "test-worker-01"
    assert complete["p_job_id"] == job["id"]
    assert complete["p_lease_token"] == job["lease_token"]
    assert complete["p_observations_submitted"] == 4


def test_empty_queue_returns_false():
    worker = LeasedEnvironmentalWorker(
        rpc=lambda name, params: [],
        processor=lambda job, stop: pytest.fail("processor must not run"),
        settings=LeaseSettings("test-worker-01"),
    )
    assert worker.run_once() is False


def test_lost_lease_prevents_completion():
    job = _job()
    completed = []

    def rpc(name, params):
        if name == "claim_environmental_ingestion_job":
            return [job]
        if name == "complete_environmental_ingestion_job":
            completed.append(params)
            return True
        raise AssertionError(f"unexpected RPC: {name}")

    def processor(claimed, stop):
        stop.set()
        return JobOutcome("succeeded", {})

    worker = LeasedEnvironmentalWorker(
        rpc=rpc,
        processor=processor,
        settings=LeaseSettings("test-worker-01", lease_seconds=30, heartbeat_interval_seconds=5),
    )
    # The processor's stop event is the heartbeat-loss signal. Simulate a
    # lost lease directly by setting the event passed into the processor.
    original = worker._processor

    def lost_processor(claimed, lost):
        lost.set()
        return original(claimed, threading.Event())

    worker._processor = lost_processor
    with pytest.raises(LeaseLostError):
        worker.run_once()
    assert completed == []


def test_settings_reject_heartbeat_longer_than_lease():
    with pytest.raises(ValueError):
        LeaseSettings("test-worker-01", lease_seconds=30, heartbeat_interval_seconds=30)


def test_outcome_rejects_negative_counters():
    with pytest.raises(ValueError):
        JobOutcome("failed", {}, scenes_failed=-1)
