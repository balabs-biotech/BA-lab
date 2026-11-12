"""Small authenticated HTTP transport for the registered BA Labs Python engines.

Run behind a TLS-terminating reverse proxy and inside a container that enforces
CPU, memory, filesystem, network and process-time limits.
"""

from __future__ import annotations

import hmac
import json
import os
import subprocess
import sys
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import BoundedSemaphore
from typing import Any
from urllib.parse import urlsplit

from .registry import load_engine
from .validation import ContractValidationError, validate_request, validate_response

MAX_BODY_BYTES = 48_000
MAX_RESPONSE_BYTES = 128_000
MAX_CONCURRENCY = 2
CONNECTION_TIMEOUT_SECONDS = 10


class _BoundedThreadingHTTPServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, address: tuple[str, int], handler: type[BaseHTTPRequestHandler]):
        self._capacity = BoundedSemaphore(MAX_CONCURRENCY)
        super().__init__(address, handler)

    def process_request(self, request: Any, client_address: Any) -> None:
        if not self._capacity.acquire(blocking=False):
            try:
                request.sendall(
                    b"HTTP/1.1 503 Service Unavailable\r\n"
                    b"Content-Length: 0\r\nConnection: close\r\n\r\n"
                )
            finally:
                self.shutdown_request(request)
            return
        try:
            super().process_request(request, client_address)
        except Exception:
            self._capacity.release()
            raise

    def process_request_thread(self, request: Any, client_address: Any) -> None:
        try:
            super().process_request_thread(request, client_address)
        finally:
            self._capacity.release()


class _Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "BA-Labs-Engine"
    sys_version = ""

    worker_token = ""

    def setup(self) -> None:
        super().setup()
        self.connection.settimeout(CONNECTION_TIMEOUT_SECONDS)

    def log_message(self, format: str, *args: Any) -> None:
        # Avoid logging bearer tokens, payloads or scientific input values.
        sys.stderr.write("[ba-engine-http] " + (format % args) + "\n")

    def _send(self, status: HTTPStatus, payload: dict[str, Any] | None = None) -> None:
        body = b"" if payload is None else json.dumps(
            payload, ensure_ascii=False, allow_nan=False, separators=(",", ":")
        ).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Connection", "close")
        self.end_headers()
        if body:
            self.wfile.write(body)
        self.close_connection = True

    def do_GET(self) -> None:
        if urlsplit(self.path).path == "/healthz":
            self._send(HTTPStatus.OK, {"status": "ok"})
        else:
            self._send(HTTPStatus.NOT_FOUND, {"error": "not_found"})

    def do_POST(self) -> None:
        if urlsplit(self.path).path != "/v1/execute":
            self._send(HTTPStatus.NOT_FOUND, {"error": "not_found"})
            return
        expected = "Bearer " + self.worker_token
        supplied = self.headers.get("Authorization", "")
        if not self.worker_token or not hmac.compare_digest(supplied, expected):
            self._send(HTTPStatus.UNAUTHORIZED, {"error": "authentication_required"})
            return
        if not self.headers.get("Content-Type", "").lower().startswith("application/json"):
            self._send(HTTPStatus.UNSUPPORTED_MEDIA_TYPE, {"error": "application_json_required"})
            return
        try:
            length = int(self.headers.get("Content-Length", ""))
        except ValueError:
            self._send(HTTPStatus.LENGTH_REQUIRED, {"error": "content_length_required"})
            return
        if length < 1:
            self._send(HTTPStatus.BAD_REQUEST, {"error": "empty_body"})
            return
        if length > MAX_BODY_BYTES:
            self._send(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, {"error": "payload_too_large"})
            return
        try:
            raw = self.rfile.read(length)
            if len(raw) != length:
                self._send(HTTPStatus.BAD_REQUEST, {"error": "incomplete_body"})
                return
            request = json.loads(raw)
        except (json.JSONDecodeError, UnicodeDecodeError):
            self._send(HTTPStatus.BAD_REQUEST, {"error": "invalid_json"})
            return
        except TimeoutError:
            self._send(HTTPStatus.REQUEST_TIMEOUT, {"error": "request_read_timeout"})
            return
        if not isinstance(request, dict):
            self._send(HTTPStatus.UNPROCESSABLE_ENTITY, {"error": "request_must_be_object"})
            return

        try:
            validate_request(request)
            engine_identity = request["engine"]
            manifest, _engine = load_engine(
                engine_identity["engine_id"],
                engine_identity["engine_version"],
            )
            timeout_seconds = manifest["resource_limits"]["timeout_seconds"]
            child_env = {
                "PATH": os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin"),
                "PYTHONUNBUFFERED": "1",
                "PYTHONDONTWRITEBYTECODE": "1",
            }
            for name in ("BA_ENGINE_SCHEMA_DIR", "BA_ENGINE_REGISTRY_DIR"):
                if os.environ.get(name):
                    child_env[name] = os.environ[name]

            completed = subprocess.run(
                [sys.executable, "-m", "ba_engine_contract.worker"],
                input=json.dumps(request, ensure_ascii=False, allow_nan=False),
                text=True,
                encoding="utf-8",
                capture_output=True,
                timeout=timeout_seconds,
                env=child_env,
                check=False,
            )
            if completed.returncode == 2:
                raise ContractValidationError("engine_request_rejected")
            if completed.returncode != 0:
                raise RuntimeError("engine_worker_failed")
            if len(completed.stdout.encode("utf-8")) > MAX_RESPONSE_BYTES:
                raise RuntimeError("engine_response_too_large")
            result = json.loads(completed.stdout)
            if not isinstance(result, dict):
                raise RuntimeError("engine_response_must_be_object")
            validate_response(result, request)
            self._send(HTTPStatus.OK, result)
        except subprocess.TimeoutExpired:
            self._send(HTTPStatus.GATEWAY_TIMEOUT, {"error": "engine_timeout"})
        except ContractValidationError:
            self._send(HTTPStatus.UNPROCESSABLE_ENTITY, {"error": "engine_request_rejected"})
        except Exception:
            self._send(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": "engine_worker_internal_error"})


def create_server(token: str, host: str = "127.0.0.1", port: int = 8080) -> ThreadingHTTPServer:
    """Create a bounded server; exposed for deterministic in-process tests."""
    if not isinstance(token, str) or len(token) < 24:
        raise ValueError("worker token must contain at least 24 characters")
    handler = type("AuthenticatedEngineHandler", (_Handler,), {"worker_token": token})
    return _BoundedThreadingHTTPServer((host, port), handler)


def main() -> int:
    token = os.environ.get("BA_ENGINE_WORKER_TOKEN", "")
    host = os.environ.get("BA_ENGINE_HTTP_HOST", "0.0.0.0")
    try:
        port = int(os.environ.get("BA_ENGINE_HTTP_PORT", "8080"))
    except ValueError:
        sys.stderr.write("invalid BA_ENGINE_HTTP_PORT\n")
        return 2
    try:
        server = create_server(token, host, port)
    except ValueError as error:
        sys.stderr.write(str(error) + "\n")
        return 2
    sys.stderr.write(f"[ba-engine-http] listening on {host}:{port}\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
