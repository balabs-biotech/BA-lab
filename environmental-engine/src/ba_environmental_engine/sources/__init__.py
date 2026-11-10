"""Provider-neutral contracts and provider-specific environmental adapters."""

from ba_environmental_engine.sources.models import (
    DuplicateSourceKey,
    NormalizedEnvironmentalObservation,
    find_duplicate_source_keys,
)
from ba_environmental_engine.sources.nasa_power import normalize_nasa_power_observation

__all__ = [
    "DuplicateSourceKey",
    "NormalizedEnvironmentalObservation",
    "find_duplicate_source_keys",
    "normalize_nasa_power_observation",
]
