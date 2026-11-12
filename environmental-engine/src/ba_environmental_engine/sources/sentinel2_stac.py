"""Strict parser for Earth Search Sentinel-2 L2A STAC Items."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from math import isfinite
from typing import Any
from urllib.parse import urlsplit


_TRUSTED_HOSTS = {"earth-search.aws.element84.com"}
_TRUSTED_SUFFIXES = (".amazonaws.com", ".cloudfront.net")


@dataclass(frozen=True, slots=True)
class Sentinel2StacScene:
    scene_id: str
    observed_at: datetime
    cloud_cover_pct: float
    epsg: int
    red_asset_url: str
    nir_asset_url: str
    scl_asset_url: str
    item_url: str


def _https_url(value: Any, field: str, *, item_url: bool = False) -> str:
    if not isinstance(value, str):
        raise ValueError(f"{field} must be an HTTPS URL")
    parsed = urlsplit(value)
    host = (parsed.hostname or "").lower()
    trusted = host in _TRUSTED_HOSTS if item_url else (
        host in _TRUSTED_HOSTS or any(host.endswith(suffix) for suffix in _TRUSTED_SUFFIXES)
    )
    if parsed.scheme != "https" or not host or not trusted:
        raise ValueError(f"{field} must use HTTPS on a trusted Earth Search or AWS host")
    return value


def _asset_href(assets: dict[str, Any], *names: str) -> str:
    for name in names:
        asset = assets.get(name)
        if isinstance(asset, dict) and asset.get("href"):
            return _https_url(asset["href"], f"assets.{name}.href")
    raise ValueError(f"required Sentinel-2 asset missing: {'/'.join(names)}")


def parse_sentinel2_stac_item(item: dict[str, Any]) -> Sentinel2StacScene:
    """Validate one STAC Feature and extract scientific inputs.

    This parser intentionally requires SCL. Preview-only RGB assets or scenes
    without a usable classification layer are not accepted by the scientific
    ingestion path.
    """
    if not isinstance(item, dict) or item.get("type") != "Feature":
        raise ValueError("STAC item must be a GeoJSON Feature")
    if item.get("collection") != "sentinel-2-l2a":
        raise ValueError("STAC item collection must be sentinel-2-l2a")

    scene_id = item.get("id")
    if not isinstance(scene_id, str) or not scene_id.strip():
        raise ValueError("STAC item id is required")

    properties = item.get("properties")
    if not isinstance(properties, dict):
        raise ValueError("STAC item properties must be an object")
    timestamp = properties.get("datetime")
    if not isinstance(timestamp, str):
        raise ValueError("STAC item properties.datetime is required")
    try:
        observed_at = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("STAC item datetime must be ISO-8601") from exc
    if observed_at.tzinfo is None or observed_at.utcoffset() is None:
        raise ValueError("STAC item datetime must include a timezone")
    observed_at = observed_at.astimezone(timezone.utc)

    cloud_cover = properties.get("eo:cloud_cover")
    if isinstance(cloud_cover, bool) or not isinstance(cloud_cover, (int, float)):
        raise ValueError("STAC eo:cloud_cover must be finite")
    cloud_cover = float(cloud_cover)
    if not isfinite(cloud_cover) or not 0 <= cloud_cover <= 100:
        raise ValueError("STAC eo:cloud_cover must be between 0 and 100")

    epsg = properties.get("proj:epsg")
    if isinstance(epsg, bool) or not isinstance(epsg, int) or epsg <= 0 or epsg == 32767:
        raise ValueError("STAC proj:epsg must be a valid EPSG integer")

    assets = item.get("assets")
    if not isinstance(assets, dict):
        raise ValueError("STAC item assets must be an object")
    red = _asset_href(assets, "red", "B04")
    nir = _asset_href(assets, "nir", "B08")
    scl = _asset_href(assets, "scl", "SCL")

    links = item.get("links")
    if not isinstance(links, list):
        raise ValueError("STAC item links must be a list")
    self_links = [link for link in links if isinstance(link, dict) and link.get("rel") == "self"]
    if len(self_links) != 1:
        raise ValueError("STAC item must expose exactly one self link")
    item_url = _https_url(self_links[0].get("href"), "STAC self link", item_url=True)

    return Sentinel2StacScene(
        scene_id=scene_id.strip(),
        observed_at=observed_at,
        cloud_cover_pct=cloud_cover,
        epsg=epsg,
        red_asset_url=red,
        nir_asset_url=nir,
        scl_asset_url=scl,
        item_url=item_url,
    )
