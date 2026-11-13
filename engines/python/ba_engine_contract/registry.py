"""Load only explicitly registered, package-local scientific engines."""

from __future__ import annotations

import importlib
import json
import os
import re
from pathlib import Path
from typing import Any, Mapping

from .runner import EngineSpec, execute_engine
from .validation import ContractValidationError, validate_manifest, validate_request

_ENGINE_ID = re.compile(r"^[a-z][a-z0-9_.-]{1,79}$")
_ENGINE_VERSION = re.compile(r"^[0-9]+\.[0-9]+\.[0-9]+([+-][0-9A-Za-z.-]+)?$")


def load_engine(engine_id: str, engine_version: str) -> tuple[Mapping[str, Any], EngineSpec]:
    """Resolve a registered engine manifest and its allowlisted package entrypoint."""
    if not _ENGINE_ID.fullmatch(engine_id) or not _ENGINE_VERSION.fullmatch(engine_version):
        raise ContractValidationError("invalid_engine_identity")
    registry_dir = Path(os.environ.get("BA_ENGINE_REGISTRY_DIR", str(Path(__file__).resolve().parents[1] / "registry")))
    manifest_path = registry_dir / f"{engine_id}-{engine_version}.json"
    try:
        with manifest_path.open(encoding="utf-8") as handle:
            manifest = json.load(handle)
    except FileNotFoundError as exc:
        raise ContractValidationError("engine_not_registered") from exc
    except json.JSONDecodeError as exc:
        raise ContractValidationError("engine_manifest_invalid_json") from exc

    validate_manifest(manifest)
    registered = manifest["engine"]
    if registered["engine_id"] != engine_id or registered["engine_version"] != engine_version:
        raise ContractValidationError("engine_manifest_identity_mismatch")

    module_name, separator, function_name = manifest["entrypoint"].partition(":")
    if not separator or not module_name.startswith("ba_engine_contract."):
        raise ContractValidationError("engine_entrypoint_not_allowlisted")
    module = importlib.import_module(module_name)
    execute = getattr(module, function_name, None)
    if not callable(execute):
        raise ContractValidationError("engine_entrypoint_not_callable")

    return manifest, EngineSpec(engine_id, engine_version, execute)


def execute_registered_engine(request: Mapping[str, Any]) -> dict[str, Any]:
    """Validate, resolve and execute the exact engine version named by a request."""
    validate_request(request)
    identity = request["engine"]
    _manifest, engine = load_engine(identity["engine_id"], identity["engine_version"])
    return execute_engine(request, engine)
