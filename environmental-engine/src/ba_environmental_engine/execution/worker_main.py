"""Command-line entrypoint for a dedicated private environmental worker."""
from __future__ import annotations

import logging
import signal
import threading

from ba_environmental_engine.execution.worker_runtime import (
    build_leased_environmental_worker_from_env,
)


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    shutdown = threading.Event()

    def request_shutdown(signum, frame) -> None:
        logging.getLogger(__name__).info("Worker shutdown requested")
        shutdown.set()

    signal.signal(signal.SIGTERM, request_shutdown)
    signal.signal(signal.SIGINT, request_shutdown)

    worker = build_leased_environmental_worker_from_env()
    logging.getLogger(__name__).info("Leased environmental worker started")
    worker.run_forever(shutdown)
    logging.getLogger(__name__).info("Leased environmental worker stopped")


if __name__ == "__main__":
    main()
