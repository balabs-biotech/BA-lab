"""Device-level IoT transmission diagnostics.

This module consumes ingestion receipts, not measurement rows. It deliberately
keeps transport availability separate from measurement quality and biology.
No cadence or tolerance is inferred from observed timestamps.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from math import isfinite
from typing import Iterable
from uuid import UUID


@dataclass(frozen=True, slots=True)
class SensorDeviceTransmission:
    device_id: UUID
    device_code: str
    enabled: bool
    created_at: datetime
    profile_bound: bool
    expected_from: datetime
    expected_to: datetime | None = None
    last_seen_at: datetime | None = None


@dataclass(frozen=True, slots=True)
class SensorTransmissionReceipt:
    receipt_id: UUID
    device_id: UUID
    received_at: datetime


@dataclass(frozen=True, slots=True)
class SensorTransmissionAssessment:
    device_id: UUID
    device_code: str
    status: str
    expected_interval_seconds: int
    gap_tolerance_factor: float
    receipt_count: int
    gap_count: int
    maximum_gap_seconds: float | None
    trailing_silence_seconds: float | None
    last_received_at: datetime | None
    source_receipt_ids: tuple[UUID, ...]


def _require_aware(value: datetime, field: str) -> None:
    if not isinstance(value, datetime) or value.tzinfo is None or value.utcoffset() is None:
        raise ValueError(f"{field} must include a valid timezone")


def assess_sensor_transmissions(
    devices: Iterable[SensorDeviceTransmission],
    receipts: Iterable[SensorTransmissionReceipt],
    *,
    evaluation_start: datetime,
    evaluation_end: datetime,
    evaluated_at: datetime,
    expected_interval_seconds: int | None = None,
    gap_tolerance_factor: float | None = None,
    current_window: bool = False,
) -> tuple[SensorTransmissionAssessment, ...]:
    """Assess receipt cadence under an explicit policy and bounded time window.

    Interior gaps are evaluated for both historical and current windows.
    Trailing silence is evaluated only when current_window is explicitly true.
    A device with no receipt history is insufficient_data, not silent.
    """
    for field, value in (
        ("evaluation_start", evaluation_start),
        ("evaluation_end", evaluation_end),
        ("evaluated_at", evaluated_at),
    ):
        _require_aware(value, field)
    if evaluation_end <= evaluation_start:
        raise ValueError("evaluation_end must be after evaluation_start")
    if isinstance(expected_interval_seconds, bool) or not isinstance(expected_interval_seconds, int) or expected_interval_seconds <= 0:
        raise ValueError("expected_interval_seconds must be a positive integer")
    if (
        isinstance(gap_tolerance_factor, bool)
        or not isinstance(gap_tolerance_factor, (int, float))
        or not isfinite(gap_tolerance_factor)
        or gap_tolerance_factor <= 1
    ):
        raise ValueError("gap_tolerance_factor must be finite and greater than 1")
    if not isinstance(current_window, bool):
        raise ValueError("current_window must be a boolean")

    device_rows = tuple(devices)
    receipt_rows = tuple(receipts)
    device_by_id: dict[UUID, SensorDeviceTransmission] = {}
    for device in device_rows:
        if device.device_id in device_by_id:
            raise ValueError("device IDs must be unique")
        if not isinstance(device.device_code, str) or not device.device_code.strip():
            raise ValueError("device_code is required")
        if not isinstance(device.enabled, bool) or not isinstance(device.profile_bound, bool):
            raise ValueError("device enabled and profile_bound flags must be boolean")
        _require_aware(device.created_at, "device.created_at")
        _require_aware(device.expected_from, "device.expected_from")
        if device.expected_to is not None:
            _require_aware(device.expected_to, "device.expected_to")
            if device.expected_to <= device.expected_from:
                raise ValueError("device.expected_to must be after expected_from")
        if device.last_seen_at is not None:
            _require_aware(device.last_seen_at, "device.last_seen_at")
        device_by_id[device.device_id] = device

    receipt_ids: set[UUID] = set()
    grouped: dict[UUID, list[SensorTransmissionReceipt]] = {
        device_id: [] for device_id in device_by_id
    }
    for receipt in receipt_rows:
        if receipt.receipt_id in receipt_ids:
            raise ValueError("receipt IDs must be unique")
        receipt_ids.add(receipt.receipt_id)
        _require_aware(receipt.received_at, "receipt.received_at")
        if receipt.device_id not in device_by_id:
            raise ValueError("every receipt must reference a supplied device")
        grouped[receipt.device_id].append(receipt)

    cutoff = min(evaluation_end, evaluated_at) if current_window else evaluation_end
    results: list[SensorTransmissionAssessment] = []
    for device_id, device in sorted(device_by_id.items(), key=lambda item: str(item[0])):
        eligible = (
            device.enabled
            and device.profile_bound
            and device.created_at < cutoff
            and device.expected_from < cutoff
            and (device.expected_to is None or device.expected_to > evaluation_start)
            and evaluation_start < cutoff
        )
        if not eligible:
            results.append(SensorTransmissionAssessment(
                device_id=device_id, device_code=device.device_code,
                status="not_evaluable",
                expected_interval_seconds=expected_interval_seconds,
                gap_tolerance_factor=float(gap_tolerance_factor),
                receipt_count=0, gap_count=0, maximum_gap_seconds=None,
                trailing_silence_seconds=None, last_received_at=None,
                source_receipt_ids=(),
            ))
            continue

        active_start = max(evaluation_start, device.created_at, device.expected_from)
        active_end = min(cutoff, device.expected_to) if device.expected_to else cutoff
        silence_cutoff = (
            cutoff
            if device.expected_to is None or device.expected_to >= cutoff
            else None
        )
        observed = sorted(
            (receipt for receipt in grouped[device_id]
             if active_start <= receipt.received_at <= active_end),
            key=lambda receipt: (receipt.received_at, str(receipt.receipt_id)),
        )
        ids = tuple(receipt.receipt_id for receipt in observed)
        if not observed:
            trailing_silence = (
                max(0.0, (cutoff - device.last_seen_at).total_seconds())
                if current_window and silence_cutoff is not None
                and device.last_seen_at is not None
                and device.last_seen_at <= silence_cutoff else None
            )
            threshold = expected_interval_seconds * float(gap_tolerance_factor)
            status = (
                "silent"
                if trailing_silence is not None and trailing_silence > threshold
                else "insufficient_data"
            )
            results.append(SensorTransmissionAssessment(
                device_id=device_id, device_code=device.device_code,
                status=status,
                expected_interval_seconds=expected_interval_seconds,
                gap_tolerance_factor=float(gap_tolerance_factor),
                receipt_count=0, gap_count=0, maximum_gap_seconds=None,
                trailing_silence_seconds=trailing_silence,
                last_received_at=(
                    device.last_seen_at
                    if current_window and silence_cutoff is not None
                    and device.last_seen_at is not None
                    and device.last_seen_at <= silence_cutoff else None
                ),
                source_receipt_ids=(),
            ))
            continue

        gaps = [
            (right.received_at - left.received_at).total_seconds()
            for left, right in zip(observed, observed[1:])
        ]
        threshold = expected_interval_seconds * float(gap_tolerance_factor)
        irregular_gaps = [gap for gap in gaps if gap > threshold]
        trailing_silence = (
            max(0.0, (silence_cutoff - observed[-1].received_at).total_seconds())
            if current_window and silence_cutoff is not None else None
        )
        status = "irregular" if irregular_gaps else "normal"
        if trailing_silence is not None and trailing_silence > threshold:
            status = "silent"

        results.append(SensorTransmissionAssessment(
            device_id=device_id, device_code=device.device_code,
            status=status,
            expected_interval_seconds=expected_interval_seconds,
            gap_tolerance_factor=float(gap_tolerance_factor),
            receipt_count=len(observed),
            gap_count=len(irregular_gaps),
            maximum_gap_seconds=max(gaps) if gaps else None,
            trailing_silence_seconds=trailing_silence,
            last_received_at=observed[-1].received_at,
            source_receipt_ids=ids,
        ))
    return tuple(results)
