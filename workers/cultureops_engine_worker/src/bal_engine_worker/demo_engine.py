"""Minimal deterministic engine used to verify the worker pipeline."""

from __future__ import annotations

from typing import Mapping

from .registry import EngineExecutionContext, EngineRegistry, EngineResult


class IdentityDemoEngine:
    engine_code = "demo.identity"
    engine_version = "1.0.0"

    def execute(
        self, context: EngineExecutionContext, payload: Mapping[str, object]
    ) -> EngineResult:
        return EngineResult(
            status="succeeded",
            data={"echo": dict(payload)},
            summary=f"Demo payload accepted for job {context.job_id}",
            provenance={
                "engine_code": self.engine_code,
                "engine_version": self.engine_version,
                "organization_id": context.organization_id,
            },
        )


def register_engines(registry: EngineRegistry) -> None:
    """Register the built-in smoke-test engine."""
    registry.register(IdentityDemoEngine())
