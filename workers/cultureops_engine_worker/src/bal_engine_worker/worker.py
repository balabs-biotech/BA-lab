"""Single-job execution boundary with lease renewal and fencing awareness."""

from __future__ import annotations

from dataclasses import dataclass
from threading import Event, Thread
from urllib.error import HTTPError, URLError
from typing import Callable, Mapping, Protocol

from .registry import EngineExecutionContext, EngineRegistry, EngineResult, RegistryError


class LeaseLostError(RuntimeError):
    """The database rejected a mutation because this worker no longer owns the lease."""


@dataclass(frozen=True)
class ClaimedJob:
    """A job already atomically claimed by the database adapter."""

    job_id: str
    organization_id: str
    engine_code: str
    engine_version: str
    payload: Mapping[str, object]
    attempt_number: int
    worker_id: str
    lease_token: str


class QueueClient(Protocol):
    """Queue adapter contract; every mutation must validate the fencing token."""

    def claim_one(self, worker_id: str) -> ClaimedJob | None:
        ...

    def heartbeat(self, job: ClaimedJob, *, lease_seconds: int) -> bool:
        """Renew only the current, unexpired lease; False means lease was lost."""
        ...

    def complete(self, job: ClaimedJob, result: EngineResult) -> None:
        """Persist result and succeed transition atomically, checking the lease."""
        ...

    def fail(
        self,
        job: ClaimedJob,
        *,
        error_code: str,
        error_message: str,
        retryable: bool,
    ) -> None:
        """Record attempt failure and schedule/finalize, checking the lease."""
        ...


@dataclass(frozen=True)
class ExecutionOutcome:
    status: str
    job_id: str | None = None
    error_code: str | None = None


FailureClassifier = Callable[[Exception], bool]


def _default_failure_classifier(error: Exception) -> bool:
    """Retry common transient I/O failures; keep unknown errors permanent.

    Engine plugins can inject a domain-specific classifier when they have
    richer knowledge (for example, provider-specific rate-limit exceptions).
    """
    if isinstance(error, (TimeoutError, ConnectionError)):
        return True
    if isinstance(error, HTTPError):
        return error.code in {408, 425, 429, 500, 502, 503, 504}
    if isinstance(error, URLError):
        return isinstance(error.reason, (TimeoutError, ConnectionError))
    return False


class _LeaseHeartbeat:
    """Background lease renewal; any uncertainty is treated as lease loss."""

    def __init__(self, queue: QueueClient, job: ClaimedJob, lease_seconds: int,
                 interval_seconds: float) -> None:
        self._queue = queue
        self._job = job
        self._lease_seconds = lease_seconds
        self._interval_seconds = interval_seconds
        self._stop = Event()
        self._lost = Event()
        self._thread = Thread(target=self._run, name=f"lease-{job.job_id}", daemon=True)

    @property
    def lost(self) -> bool:
        return self._lost.is_set()

    def _run(self) -> None:
        while not self._stop.wait(self._interval_seconds):
            try:
                if not self._queue.heartbeat(
                    self._job, lease_seconds=self._lease_seconds
                ):
                    self._lost.set()
                    return
            except Exception:
                # A missed heartbeat is ambiguous; do not risk a stale write.
                self._lost.set()
                return

    def __enter__(self) -> "_LeaseHeartbeat":
        self._thread.start()
        return self

    def __exit__(self, exc_type, exc, traceback) -> None:
        self._stop.set()
        self._thread.join(timeout=max(1.0, self._interval_seconds + 1.0))


class EngineWorker:
    """Execute one job; renew its lease and isolate engine failures."""

    def __init__(
        self,
        queue: QueueClient,
        registry: EngineRegistry,
        worker_id: str,
        failure_classifier: FailureClassifier = _default_failure_classifier,
        *,
        lease_seconds: int = 60,
        heartbeat_interval_seconds: float = 20.0,
    ) -> None:
        if not worker_id or not worker_id.strip():
            raise ValueError("worker_id must be a non-empty string")
        if lease_seconds < 3:
            raise ValueError("lease_seconds must be at least 3")
        if heartbeat_interval_seconds <= 0 or heartbeat_interval_seconds >= lease_seconds:
            raise ValueError("heartbeat interval must be positive and shorter than lease")
        self._queue = queue
        self._registry = registry
        self._worker_id = worker_id.strip()
        self._failure_classifier = failure_classifier
        self._lease_seconds = lease_seconds
        self._heartbeat_interval_seconds = heartbeat_interval_seconds

    def run_once(self) -> ExecutionOutcome:
        job = self._queue.claim_one(self._worker_id)
        if job is None:
            return ExecutionOutcome(status="idle")

        context = EngineExecutionContext(
            job_id=job.job_id,
            organization_id=job.organization_id,
            attempt_number=job.attempt_number,
        )

        result: EngineResult | None = None
        engine_error: Exception | None = None
        with _LeaseHeartbeat(
            self._queue, job, self._lease_seconds, self._heartbeat_interval_seconds
        ) as heartbeat:
            try:
                result = self._registry.execute(
                    job.engine_code,
                    job.engine_version,
                    context,
                    job.payload,
                )
            except Exception as exc:
                engine_error = exc

        # A stale or uncertain worker must never commit a result or failure.
        # The lease reaper will recover the job after expiry.
        if heartbeat.lost:
            return ExecutionOutcome(
                status="lease_lost", job_id=job.job_id, error_code="lease_lost"
            )

        if isinstance(engine_error, RegistryError):
            try:
                self._queue.fail(
                    job,
                    error_code="engine_not_registered",
                    error_message=str(engine_error),
                    retryable=False,
                )
            except LeaseLostError:
                return ExecutionOutcome(status="lease_lost", job_id=job.job_id, error_code="lease_lost")
            return ExecutionOutcome(
                status="failed", job_id=job.job_id,
                error_code="engine_not_registered",
            )

        if engine_error is not None:
            retryable = self._failure_classifier(engine_error)
            try:
                self._queue.fail(
                    job,
                    error_code="engine_execution_error",
                    error_message=f"{type(engine_error).__name__}: {engine_error}",
                    retryable=retryable,
                )
            except LeaseLostError:
                return ExecutionOutcome(status="lease_lost", job_id=job.job_id, error_code="lease_lost")
            return ExecutionOutcome(
                status="failed", job_id=job.job_id,
                error_code="engine_execution_error",
            )

        if result is None:
            raise RuntimeError("Engine returned neither a result nor an exception")

        # SQL must re-check the fencing token: a lease may expire between
        # the last heartbeat and this completion transaction.
        try:
            self._queue.complete(job, result)
        except LeaseLostError:
            return ExecutionOutcome(status="lease_lost", job_id=job.job_id, error_code="lease_lost")
        return ExecutionOutcome(status="succeeded", job_id=job.job_id)
