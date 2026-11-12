"""Provider-neutral and source-specific environmental adapters."""

from ba_environmental_engine.sources.models import (
    DuplicateSourceKey,
    NormalizedEnvironmentalObservation,
    find_duplicate_source_keys,
)
from ba_environmental_engine.sources.nasa_power import normalize_nasa_power_observation
from ba_environmental_engine.sources.sensor import (
    SensorMeasurementEnvelope,
    normalize_iot_measurement_row,
)
from ba_environmental_engine.sources.sensor_temporal import (
    SensorTemporalAssessment,
    assess_sensor_temporal_anomalies,
)
from ba_environmental_engine.sources.sentinel2 import normalize_sentinel2_observation
from ba_environmental_engine.sources.sentinel2_ingestion import build_sentinel2_observation_rows
from ba_environmental_engine.sources.sentinel2_stac import Sentinel2StacScene, parse_sentinel2_stac_item
from ba_environmental_engine.sources.sentinel2_search import (
    Sentinel2SearchCriteria,
    Sentinel2SearchResult,
    search_sentinel2_scenes,
)
from ba_environmental_engine.sources.sentinel2_batch import (
    Sentinel2BatchProcessingResult,
    Sentinel2SceneFailure,
    process_sentinel2_stac_items,
)
from ba_environmental_engine.sources.sentinel2_pipeline import (
    Sentinel2SceneProcessingResult,
    process_sentinel2_stac_item,
)
from ba_environmental_engine.sources.sentinel2_raster_reader import (
    Sentinel2RasterReadResult,
    read_sentinel2_ndvi_window,
)
from ba_environmental_engine.sources.sentinel2_raster import (
    Sentinel2NdviStatistics,
    calculate_ndvi_statistics,
)
from ba_environmental_engine.sources.supabase_satellite import (
    SupabaseSatelliteObservationRepository,
)
from ba_environmental_engine.sources.supabase_sensor import SupabaseSensorMeasurementRepository
from ba_environmental_engine.sources.sentinel2_worker import (
    Sentinel2PersistenceError,
    Sentinel2WorkerResult,
    process_and_persist_sentinel2_batch,
)

__all__ = [
    "DuplicateSourceKey",
    "NormalizedEnvironmentalObservation",
    "SensorMeasurementEnvelope",
    "SensorTemporalAssessment",
    "SupabaseSatelliteObservationRepository",
    "SupabaseSensorMeasurementRepository",
    "Sentinel2BatchProcessingResult",
    "Sentinel2NdviStatistics",
    "Sentinel2PersistenceError",
    "Sentinel2RasterReadResult",
    "Sentinel2SceneFailure",
    "Sentinel2SceneProcessingResult",
    "Sentinel2SearchCriteria",
    "Sentinel2SearchResult",
    "Sentinel2StacScene",
    "Sentinel2WorkerResult",
    "assess_sensor_temporal_anomalies",
    "build_sentinel2_observation_rows",
    "calculate_ndvi_statistics",
    "find_duplicate_source_keys",
    "normalize_iot_measurement_row",
    "normalize_nasa_power_observation",
    "normalize_sentinel2_observation",
    "parse_sentinel2_stac_item",
    "process_and_persist_sentinel2_batch",
    "process_sentinel2_stac_item",
    "process_sentinel2_stac_items",
    "read_sentinel2_ndvi_window",
    "search_sentinel2_scenes",
]
