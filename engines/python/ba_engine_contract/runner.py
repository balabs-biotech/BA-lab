"""Minimal stateless execution wrapper for registered Python engines.

The deployment/orchestrator layer remains responsible for hard process timeouts,
resource limits, authorization, idempotency storage and persistence.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Callable, Mapping
from uuid import uuid4

from .validation import ContractValidationError, validate_request, validate_response


@dataclass(frozen=True)
class EngineExecutionError(Exception):
    code: str
    message: str
    retryable: bool = False


@dataclass(frozen=True)
class EngineSpec:
    engine_id: str
    engine_version: str
    execute: Callable[[Mapping[str, Any]], Mapping[str, Any]]


def _timestamp() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def execute_engine(request: Mapping[str, Any], engine: EngineSpec) -> dict[str, Any]:
    """Execute one engine call and return a schema-validated response envelope."""
    validate_request(request)
    if request["engine"] != {
        "engine_id": engine.engine_id,
        "engine_version": engine.engine_version,
    }:
        raise ContractValidationError("request engine identity does not match registered engine")

    started_at = _timestamp()
    execution_id = str(uuid4())
    try:
        value = engine.execute(request)
        required = {"outcome", "value", "limitations", "quality_flags", "provenance"}
        if not isinstance(value, Mapping) or not required.issubset(value):
            raise EngineExecutionError(
                "engine_output_invalid",
                "Engine output must include outcome, value, limitations, quality_flags and provenance",
            )
        response = {
            "contract": "BA-LABS/ENGINE-RESULT",
            "contract_version": "1.0.0",
            "request_id": request["request_id"],
            "execution_id": execution_id,
            "engine": dict(request["engine"]),
            "input_snapshot_sha256": request["input"]["snapshot_sha256"],
            "status": "completed",
            "started_at": started_at,
            "completed_at": _timestamp(),
            "result": dict(value),
        }
    except EngineExecutionError as error:
        response = {
            "contract": "BA-LABS/ENGINE-RESULT",
            "contract_version": "1.0.0",
            "request_id": request["request_id"],
            "execution_id": execution_id,
            "engine": dict(request["engine"]),
            "input_snapshot_sha256": request["input"]["snapshot_sha256"],
            "status": "failed",
            "started_at": started_at,
            "completed_at": _timestamp(),
            "error": {
                "code": error.code,
                "message": error.message,
                "retryable": error.retryable,
            },
        }
    except Exception as error:
        response = {
            "contract": "BA-LABS/ENGINE-RESULT",
            "contract_version": "1.0.0",
            "request_id": request["request_id"],
            "execution_id": execution_id,
            "engine": dict(request["engine"]),
            "input_snapshot_sha256": request["input"]["snapshot_sha256"],
            "status": "failed",
            "started_at": started_at,
            "completed_at": _timestamp(),
            "error": {
                "code": "engine_execution_failed",
                "message": "The engine failed unexpectedly",
                "retryable": False,
                "details": {"exception_type": type(error).__name__},
            },
        }

    validate_response(response, request)
    return response
