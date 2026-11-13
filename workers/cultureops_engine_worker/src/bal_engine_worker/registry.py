"""Small, dependency-free, version-aware engine registry.

The registry is intentionally independent from Supabase and queue transport.
"""

from __future__ import annotations

from dataclasses import dataclass, field
import json
from typing import Any, Mapping, Protocol


JsonObject = Mapping[str, Any]


@dataclass(frozen=True)
class EngineExecutionContext:
    """Execution metadata supplied by the queue consumer."""

    job_id: str
    organization_id: str
    attempt_number: int


@dataclass(frozen=True)
class EngineResult:
    """Normalized engine output; persistence is owned by the worker."""

    status: str
    data: Mapping[str, Any] = field(default_factory=dict)
    summary: str | None = None
    provenance: Mapping[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if self.status != "succeeded":
            raise ValueError("EngineResult.status must be 'succeeded'")
        if not isinstance(self.data, Mapping):
            raise TypeError("EngineResult.data must be a mapping")
        if not isinstance(self.provenance, Mapping):
            raise TypeError("EngineResult.provenance must be a mapping")
        try:
            json.dumps(dict(self.data), allow_nan=False)
            json.dumps(dict(self.provenance), allow_nan=False)
        except (TypeError, ValueError) as exc:
            raise TypeError("EngineResult data and provenance must be JSON-serializable") from exc


class Engine(Protocol):
    """Contract implemented by each independently deployable engine."""

    engine_code: str
    engine_version: str

    def execute(
        self,
        context: EngineExecutionContext,
        payload: JsonObject,
    ) -> EngineResult:
        """Execute one job and return a normalized result."""
        ...


class RegistryError(RuntimeError):
    """Raised when an engine registration or lookup is invalid."""


class EngineRegistry:
    """Resolve engines by an exact code/version pair."""

    def __init__(self) -> None:
        self._engines: dict[tuple[str, str], Engine] = {}

    @staticmethod
    def _validate_identity(engine_code: str, engine_version: str) -> None:
        if not isinstance(engine_code, str) or not engine_code.strip():
            raise RegistryError("engine_code must be a non-empty string")
        if not isinstance(engine_version, str) or not engine_version.strip():
            raise RegistryError("engine_version must be a non-empty string")

    def register(self, engine: Engine) -> None:
        code = getattr(engine, "engine_code", None)
        version = getattr(engine, "engine_version", None)
        self._validate_identity(code, version)

        if not callable(getattr(engine, "execute", None)):
            raise RegistryError("engine must expose a callable execute method")

        key = (code.strip(), version.strip())
        if key in self._engines:
            raise RegistryError(
                f"engine already registered: {key[0]}@{key[1]}"
            )
        self._engines[key] = engine

    def resolve(self, engine_code: str, engine_version: str) -> Engine:
        self._validate_identity(engine_code, engine_version)
        key = (engine_code.strip(), engine_version.strip())
        try:
            return self._engines[key]
        except KeyError as exc:
            raise RegistryError(
                f"engine not registered: {key[0]}@{key[1]}"
            ) from exc

    def execute(
        self,
        engine_code: str,
        engine_version: str,
        context: EngineExecutionContext,
        payload: JsonObject,
    ) -> EngineResult:
        if not isinstance(payload, Mapping):
            raise TypeError("engine payload must be a mapping")
        engine = self.resolve(engine_code, engine_version)
        result = engine.execute(context, payload)
        if not isinstance(result, EngineResult):
            raise TypeError(
                f"{engine_code}@{engine_version} returned an invalid result"
            )
        return result

    def registered(self) -> tuple[tuple[str, str], ...]:
        """Return a stable, read-only inventory of registered engine versions."""
        return tuple(sorted(self._engines))
