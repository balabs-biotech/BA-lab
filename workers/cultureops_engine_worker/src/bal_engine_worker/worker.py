"""Single-job execution boundary, independent from queue transport."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Mapping, Protocol

from .registry import EngineExecutionContext, EngineRegistry, EngineResult, RegistryError


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
    """Minimal queue adapter; implementations must enforce fencing in SQL."""

    def claim_one(self, worker_id: str) -> ClaimedJob | None:
        ...

    def complete(self, job: ClaimedJob, result: EngineResult) -> None:
        """Persist the result and succeed transition atomically, checking lease."""
        ...

    def fail(
        self,
        job: ClaimedJob,
        *,
        error_code: str,
        error_message: str,
        retryable: bool,
    ) -> None:
        """Record attempt failure and schedule/finalize, checking lease."""
        ...


@dataclass(frozen=True)
class ExecutionOutcome:
    status: str
    job_id: str | None = None
    error_code: str | None = None


FailureClassifier = Callable[[Exception], bool]


def _permanent_by_default(error: Exception) -> bool:
    """Unknown engine/configuration and unclassified failures do not retry."""
    return False


class EngineWorker:
    """Execute at most one claimed job; one engine failure never kills polling."""

    def __init__(
        self,
        queue: QueueClient,
        registry: EngineRegistry,
        worker_id: str,
        failure_classifier: FailureClassifier = _permanent_by_default,
    ) -> None:
        if not worker_id or not worker_id.strip():
            raise ValueError("worker_id must be a non-empty string")
        self._queue = queue
        self._registry = registry
        self._worker_id = worker_id.strip()
        self._failure_classifier = failure_classifier

    def run_once(self) -> ExecutionOutcome:
        job = self._queue.claim_one(self._worker_id)
        if job is None:
            return ExecutionOutcome(status="idle")

        context = EngineExecutionContext(
            job_id=job.job_id,
            organization_id=job.organization_id,
            attempt_number=job.attempt_number,
        )

        try:
            result = self._registry.execute(
                job.engine_code,
                job.engine_version,
                context,
                job.payload,
            )
        except RegistryError as exc:
            self._queue.fail(
                job,
                error_code="engine_not_registered",
                error_message=str(exc),
                retryable=False,
            )
            return ExecutionOutcome(
                status="failed", job_id=job.job_id,
                error_code="engine_not_registered",
            )
        except Exception as exc:
            retryable = self._failure_classifier(exc)
            self._queue.fail(
                job,
                error_code="engine_execution_error",
                error_message=f"{type(exc).__name__}: {exc}",
                retryable=retryable,
            )
            return ExecutionOutcome(
                status="failed", job_id=job.job_id,
                error_code="engine_execution_error",
            )

        # If completion fails (including stale fencing token), propagate it.
        # The worker must not report success when persistence was rejected.
        self._queue.complete(job, result)
        return ExecutionOutcome(status="succeeded", job_id=job.job_id)
