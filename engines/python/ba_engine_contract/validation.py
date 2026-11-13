"""Schema and cross-envelope validation for BA-LABS/ENGINE v1."""

from __future__ import annotations

import hashlib
import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Any, Mapping

from jsonschema import Draft202012Validator, FormatChecker



class ContractValidationError(ValueError):
    """Raised when an engine request or result violates the v1 contract."""


@lru_cache(maxsize=16)
def _validator(name: str, schema_dir: str | None = None) -> Draft202012Validator:
    root = Path(schema_dir) if schema_dir else Path(__file__).resolve().parents[3] / "schemas" / "engine" / "v1"
    path = root / name
    try:
        with path.open(encoding="utf-8") as handle:
            schema = json.load(handle)
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"Unable to load engine contract schema: {name}") from exc
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema, format_checker=FormatChecker())


def _validate(instance: Mapping[str, Any], schema_name: str) -> None:
    errors = sorted(
        _validator(schema_name, os.environ.get("BA_ENGINE_SCHEMA_DIR")).iter_errors(instance),
        key=lambda error: (list(error.absolute_path), error.message),
    )
    if errors:
        details = "; ".join(
            f"/{'/'.join(str(part) for part in error.absolute_path)}: {error.message}"
            for error in errors[:10]
        )
        raise ContractValidationError(f"{schema_name} validation failed: {details}")


def _stable_sha256(value: Any) -> str:
    encoded = json.dumps(
        value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def validate_request(request: Mapping[str, Any]) -> None:
    """Validate the request schema and bind record IDs and upstream artifacts."""
    _validate(request, "request.schema.json")
    input_block = request["input"]
    declared_ids = input_block["record_ids"]
    snapshot_ids = [record["record_id"] for record in input_block["records"]]
    if len(snapshot_ids) != len(set(snapshot_ids)) or set(snapshot_ids) != set(declared_ids):
        raise ContractValidationError(
            "input.record_ids must match input.records record_id values exactly"
        )

    artifacts = request.get("upstream_artifacts", [])
    if not isinstance(artifacts, list) or len(artifacts) > 1:
        raise ContractValidationError("at most one upstream artifact is supported")
    if artifacts:
        engine = request.get("engine", {})
        if engine != {
            "engine_id": "biological.context.features",
            "engine_version": "0.2.0",
        }:
            raise ContractValidationError("environmental QC artifacts require BIE v0.2.0")
        artifact = artifacts[0]
        expected_scope = {
            "organization_id": request["scope"]["organization_id"],
            "location_id": request["scope"].get("location_id"),
            "window_start": request["parameters"].get("window_start"),
            "window_end": request["parameters"].get("window_end"),
        }
        if artifact.get("scope") != expected_scope:
            raise ContractValidationError("upstream artifact scope or analysis window mismatch")
        if artifact.get("engine_id") != "environmental.timeseries.qc" or artifact.get("engine_version") != "0.2.0":
            raise ContractValidationError("upstream artifact engine is not allowlisted")
        unsigned = {key: value for key, value in artifact.items() if key != "artifact_sha256"}
        if _stable_sha256(unsigned) != artifact.get("artifact_sha256"):
            raise ContractValidationError("upstream artifact digest mismatch")
        result = artifact.get("result")
        if not isinstance(result, dict) or not isinstance(result.get("quality_flags"), list):
            raise ContractValidationError("upstream artifact result is incomplete")


def validate_response(
    response: Mapping[str, Any],
    request: Mapping[str, Any],
) -> None:
    """Validate a result and ensure it belongs to the exact submitted request."""
    validate_request(request)
    _validate(response, "response.schema.json")

    expected = {
        "request_id": request["request_id"],
        "engine": request["engine"],
        "input_snapshot_sha256": request["input"]["snapshot_sha256"],
    }
    for field, expected_value in expected.items():
        if response[field] != expected_value:
            raise ContractValidationError(
                f"response.{field} does not match the submitted request"
            )


def validate_manifest(manifest: Mapping[str, Any]) -> None:
    """Validate a declarative engine registration against the v1 manifest schema."""
    _validate(manifest, "manifest.schema.json")
