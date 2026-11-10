"""BA Labs Environmental Intelligence Engine."""

__version__ = "0.1.0"

__all__ = ["run_environmental_analysis", "__version__"]


def __getattr__(name: str):
    """Load the execution boundary lazily to keep package imports lightweight."""
    if name == "run_environmental_analysis":
        from ba_environmental_engine.execution import run_environmental_analysis

        return run_environmental_analysis
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
