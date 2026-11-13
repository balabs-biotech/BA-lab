"""Plugin entry point for deterministic environmental QC."""
from .environmental_qc import EnvironmentalQualityEngine


def register_engines(registry) -> None:
    registry.register(EnvironmentalQualityEngine())
