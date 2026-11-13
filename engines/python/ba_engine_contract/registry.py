"""Load only explicitly registered, package-local scientific engines."""

from __future__ import annotations

import hashlib
import importlib
import json
import os
import platform
import re
from importlib import metadata
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
        manifest_bytes = manifest_path.read_bytes()
        manifest = json.loads(manifest_bytes.decode("utf-8"))
    except FileNotFoundError as exc:
        raise ContractValidationError("engine_not_registered") from exc
    except json.JSONDecodeError as exc:
        raise ContractValidationError("engine_manifest_invalid_json") from exc

    validate_manifest(manifest)
    manifest_sha256 = hashlib.sha256(manifest_bytes).hexdigest()
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

    manifest["_runtime_manifest_sha256"] = manifest_sha256
    return manifest, EngineSpec(engine_id, engine_version, execute)


def execute_registered_engine(request: Mapping[str, Any]) -> dict[str, Any]:
    """Validate, resolve and execute the exact engine version named by a request."""
    validate_request(request)
    identity = request["engine"]
    manifest, engine = load_engine(identity["engine_id"], identity["engine_version"])
    response = execute_engine(request, engine)
    if response["status"] == "completed":
        requirements = metadata.requires("ba-labs-engine-contract") or []
        dependencies = []
        for requirement in requirements:
            match = re.match(r"([A-Za-z0-9_.-]+)", requirement)
            if not match:
                continue
            package_name = match.group(1)
            try:
                package_version = metadata.version(package_name)
            except metadata.PackageNotFoundError:
                package_version = "not-installed"
            dependencies.append({"name": package_name, "version": package_version})
        dependencies.sort(key=lambda item: item["name"].lower())
        source_revision = os.environ.get("BA_ENGINE_BUILD_REVISION", "").strip() or "unrecorded"
        execution_environment = {
            "engine_manifest_sha256": manifest["_runtime_manifest_sha256"],
            "source_revision": source_revision,
            "python_version": platform.python_version(),
            "dependencies": dependencies,
        }
        image_digest = os.environ.get("BA_ENGINE_IMAGE_DIGEST", "").strip()
        if image_digest:
            execution_environment["container_image_digest"] = image_digest
        provenance = response["result"]["provenance"]
        provenance["execution_environment"] = execution_environment
        missing_provenance = []
        if source_revision == "unrecorded":
            missing_provenance.append("build_revision_unavailable")
        if not image_digest:
            missing_provenance.append("container_image_digest_unavailable")
        if missing_provenance:
            response["result"]["quality_flags"] = sorted(set(
                response["result"]["quality_flags"] + missing_provenance
            ))
        from .validation import validate_response
        validate_response(response, request)
    return response
