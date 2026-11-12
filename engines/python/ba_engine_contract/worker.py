"""JSON-lines worker entrypoint for one registered BA Labs engine request."""

from __future__ import annotations

import json
import sys

from .registry import execute_registered_engine
from .validation import ContractValidationError


def main() -> int:
    try:
        raw = sys.stdin.read()
        if not raw.strip():
            raise ContractValidationError("empty_worker_input")
        request = json.loads(raw)
        if not isinstance(request, dict):
            raise ContractValidationError("worker_input_must_be_json_object")
        response = execute_registered_engine(request)
        sys.stdout.write(json.dumps(response, ensure_ascii=False, allow_nan=False) + "\n")
        return 0
    except (json.JSONDecodeError, ContractValidationError) as error:
        sys.stderr.write(json.dumps({"error": str(error)}, ensure_ascii=False) + "\n")
        return 2
    except Exception:
        sys.stderr.write(json.dumps({"error": "worker_internal_error"}) + "\n")
        return 3


if __name__ == "__main__":
    raise SystemExit(main())
