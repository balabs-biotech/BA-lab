"""Local process entry point for the CultureOps queue worker."""

from __future__ import annotations

import argparse
import importlib
import logging
import os
import signal
import socket
import threading
import time
from typing import Callable, Sequence

from .registry import EngineRegistry
from .supabase_queue import QueueTransportError, SupabaseRestQueueClient
from .worker import EngineWorker

LOGGER = logging.getLogger("bal_engine_worker")
DEFAULT_ENGINE_MODULE = "bal_engine_worker.demo_engine"


def load_registry(module_path: str) -> EngineRegistry:
    """Load a plugin module exposing register_engines(registry)."""
    if not module_path or not module_path.strip():
        raise ValueError("engine module path must be non-empty")
    module = importlib.import_module(module_path.strip())
    register = getattr(module, "register_engines", None)
    if not callable(register):
        raise TypeError(f"{module_path} must expose register_engines(registry)")
    registry = EngineRegistry()
    register(registry)
    if not registry.registered():
        raise ValueError(f"{module_path} registered no engines")
    return registry


def run_poll_loop(
    worker: EngineWorker,
    *,
    once: bool = False,
    poll_interval_seconds: float = 5.0,
    stop_event: threading.Event | None = None,
    sleep: Callable[[float], None] = time.sleep,
) -> int:
    """Consume jobs until stopped; transient API failures do not kill the process."""
    if poll_interval_seconds <= 0:
        raise ValueError("poll_interval_seconds must be positive")
    stop = stop_event or threading.Event()

    if once:
        try:
            outcome = worker.run_once()
        except QueueTransportError:
            LOGGER.exception("Queue transport failed during one-shot execution")
            return 1
        LOGGER.info("one-shot outcome: %s", outcome.status)
        return 1 if outcome.status in {"failed", "lease_lost"} else 0

    while not stop.is_set():
        try:
            outcome = worker.run_once()
            if outcome.status == "idle":
                stop.wait(poll_interval_seconds)
            else:
                LOGGER.info("job %s finished with status %s", outcome.job_id, outcome.status)
        except QueueTransportError:
            LOGGER.exception("Queue transport unavailable; retrying after poll interval")
            if stop.wait(poll_interval_seconds):
                break
    return 0


def _parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the BA Labs CultureOps engine worker")
    parser.add_argument("--once", action="store_true", help="claim at most one job and exit")
    parser.add_argument("--poll-interval", type=float, default=5.0)
    parser.add_argument("--lease-seconds", type=int, default=60)
    parser.add_argument(
        "--engine-module",
        default=os.environ.get("BAL_ENGINE_MODULE", DEFAULT_ENGINE_MODULE),
        help="Python module exposing register_engines(registry)",
    )
    return parser.parse_args(argv)


def main(
    argv: Sequence[str] | None = None,
    *,
    queue_factory: Callable[[], SupabaseRestQueueClient] = SupabaseRestQueueClient.from_env,
    registry_loader: Callable[[str], EngineRegistry] = load_registry,
) -> int:
    args = _parse_args(argv)
    logging.basicConfig(
        level=os.environ.get("BAL_LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    if args.poll_interval <= 0:
        raise SystemExit("--poll-interval must be positive")
    if args.lease_seconds < 3 or args.lease_seconds > 300:
        raise SystemExit("--lease-seconds must be between 3 and 300")

    registry = registry_loader(args.engine_module)
    queue = queue_factory()
    worker_id = f"{socket.gethostname()}:{os.getpid()}"
    worker = EngineWorker(
        queue,
        registry,
        worker_id,
        lease_seconds=args.lease_seconds,
        heartbeat_interval_seconds=min(20.0, args.lease_seconds / 3),
    )

    stop = threading.Event()

    def request_stop(signum, frame) -> None:
        LOGGER.info("received signal %s; stopping after current job", signum)
        stop.set()

    signal.signal(signal.SIGINT, request_stop)
    signal.signal(signal.SIGTERM, request_stop)
    LOGGER.info("worker %s started; engines=%s", worker_id, registry.registered())
    return run_poll_loop(
        worker,
        once=args.once,
        poll_interval_seconds=args.poll_interval,
        stop_event=stop,
    )


if __name__ == "__main__":
    raise SystemExit(main())
