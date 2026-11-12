"""Bounded Earth Search STAC discovery for Sentinel-2 L2A scenes."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from math import isfinite
from typing import Any, Callable
from urllib.parse import urlsplit

from ba_environmental_engine.sources.sentinel2_stac import (
    Sentinel2StacScene,
    parse_sentinel2_stac_item,
)

SEARCH_URL = "https://earth-search.aws.element84.com/v1/search"


@dataclass(frozen=True, slots=True)
class Sentinel2SearchCriteria:
    aoi_geojson: dict[str, Any]
    start: datetime
    end: datetime
    max_cloud_cover_pct: float = 30.0
    max_items: int = 100
    page_size: int = 50


@dataclass(frozen=True, slots=True)
class Sentinel2SearchResult:
    scenes: tuple[Sentinel2StacScene, ...]
    pages_read: int
    items_seen: int
    rejected_items: int


def _utc(value: datetime, field: str) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError(f"{field} must be timezone-aware")
    return value.astimezone(timezone.utc)


def _validate_criteria(criteria: Sentinel2SearchCriteria) -> tuple[datetime, datetime]:
    start, end = _utc(criteria.start, "start"), _utc(criteria.end, "end")
    if start >= end:
        raise ValueError("start must be earlier than end")
    if not isinstance(criteria.aoi_geojson, dict) or criteria.aoi_geojson.get("type") not in {"Polygon", "MultiPolygon"}:
        raise ValueError("AOI must be a GeoJSON Polygon or MultiPolygon")
    cloud = criteria.max_cloud_cover_pct
    if isinstance(cloud, bool) or not isinstance(cloud, (int, float)) or not isfinite(cloud) or not 0 <= cloud <= 100:
        raise ValueError("max_cloud_cover_pct must be between 0 and 100")
    if isinstance(criteria.max_items, bool) or not isinstance(criteria.max_items, int) or not 1 <= criteria.max_items <= 500:
        raise ValueError("max_items must be between 1 and 500")
    if isinstance(criteria.page_size, bool) or not isinstance(criteria.page_size, int) or not 1 <= criteria.page_size <= 100:
        raise ValueError("page_size must be between 1 and 100")
    return start, end


def _trusted_search_url(url: Any) -> str:
    if not isinstance(url, str):
        raise ValueError("STAC pagination link must be an Earth Search HTTPS URL")
    parsed = urlsplit(url)
    if parsed.scheme != "https" or parsed.hostname != "earth-search.aws.element84.com" or parsed.username or parsed.password:
        raise ValueError("STAC pagination link must remain on Earth Search HTTPS")
    return url


def search_sentinel2_scenes(
    criteria: Sentinel2SearchCriteria,
    *,
    request: Callable[..., Any],
) -> Sentinel2SearchResult:
    """Search Earth Search with bounded pagination and deterministic selection."""
    start, end = _validate_criteria(criteria)
    body: dict[str, Any] = {
        "collections": ["sentinel-2-l2a"],
        "intersects": criteria.aoi_geojson,
        "datetime": f"{start.isoformat().replace('+00:00', 'Z')}/{end.isoformat().replace('+00:00', 'Z')}",
        "query": {"eo:cloud_cover": {"lte": criteria.max_cloud_cover_pct}},
        "limit": min(criteria.page_size, criteria.max_items),
        "sortby": [{"field": "properties.datetime", "direction": "desc"}],
    }
    url, method = SEARCH_URL, "POST"
    pages = seen = rejected = 0
    selected: dict[str, tuple[Sentinel2StacScene, dict[str, Any]]] = {}

    while url and seen < criteria.max_items:
        response = request(method=method, url=_trusted_search_url(url), json=body, timeout=30)
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, dict) or not isinstance(payload.get("features"), list):
            raise ValueError("STAC search response must contain a features list")
        pages += 1
        for item in payload["features"]:
            if seen >= criteria.max_items:
                break
            seen += 1
            try:
                scene = parse_sentinel2_stac_item(item)
            except (TypeError, ValueError):
                rejected += 1
                continue
            if not start <= scene.observed_at <= end or scene.cloud_cover_pct > criteria.max_cloud_cover_pct:
                rejected += 1
                continue
            selected[scene.scene_id] = (scene, item)

        links = payload.get("links", [])
        if not isinstance(links, list):
            raise ValueError("STAC response links must be a list")
        next_links = [link for link in links if isinstance(link, dict) and link.get("rel") == "next"]
        if len(next_links) > 1:
            raise ValueError("STAC response exposes multiple next links")
        if not next_links:
            url = ""
            continue
        link = next_links[0]
        url = _trusted_search_url(link.get("href"))
        method = str(link.get("method", "GET")).upper()
        if method not in {"GET", "POST"}:
            raise ValueError("Unsupported STAC pagination method")
        body = link.get("body") if method == "POST" else None

    scenes = tuple(sorted(selected.values(), key=lambda scene: (scene.observed_at, scene.scene_id)))
    return Sentinel2SearchResult(scenes, pages, seen, rejected)
