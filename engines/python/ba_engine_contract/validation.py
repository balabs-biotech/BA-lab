"""Schema and cross-envelope validation for BA-LABS/ENGINE v1."""

from __future__ import annotations

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


def validate_request(request: Mapping[str, Any]) -> None:
    """Validate the request schema and bind record IDs to supplied snapshots."""
    _validate(request, "request.schema.json")
    input_block = request["input"]
    declared_ids = input_block["record_ids"]
    snapshot_ids = [record["record_id"] for record in input_block["records"]]
    if len(snapshot_ids) != len(set(snapshot_ids)) or set(snapshot_ids) != set(declared_ids):
        raise ContractValidationError(
            "input.record_ids must match input.records record_id values exactly"
        )


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
