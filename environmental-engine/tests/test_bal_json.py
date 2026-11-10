from datetime import datetime, timezone
from uuid import uuid4

import pytest
from pydantic import ValidationError

from ba_environmental_engine.contracts.bal_json import BALAnalysis


def valid_payload():
    return {
        "contract_version": "1.0.0",
        "engine": {"name": "ba-environmental-intelligence", "version": "0.1.0"},
        "analysis_id": str(uuid4()),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "scope": {
            "organization_id": str(uuid4()),
            "location_id": str(uuid4()),
            "from": "2026-10-01",
            "to": "2026-10-07",
        },
        "source_summary": [],
        "indicators": [
            {
                "code": "air_temperature_mean_7d",
                "label": "7-day mean temperature",
                "value": 21.5,
                "unit": "degC",
                "period": {
                    "from": "2026-10-01",
                    "to": "2026-10-07",
                    "aggregation": "rolling_7d",
                },
                "status": "available",
                "coverage": {"expected": 7, "observed": 7, "ratio": 1.0},
                "quality": {"class": "gridded_estimate", "flags": []},
                "method": {"name": "mean", "version": "1"},
                "inputs": [{"variable_code": "air_temperature_mean", "unit": "degC"}],
            }
        ],
        "warnings": [],
    }


def test_valid_bal_json_payload_parses():
    parsed = BALAnalysis.model_validate(valid_payload())
    assert parsed.contract_version == "1.0.0"
    assert parsed.indicators[0].value == 21.5


def test_unsupported_contract_version_is_rejected():
    payload = valid_payload()
    payload["contract_version"] = "2.0.0"
    with pytest.raises(ValidationError):
        BALAnalysis.model_validate(payload)


def test_available_indicator_cannot_have_null_value():
    payload = valid_payload()
    payload["indicators"][0]["value"] = None
    with pytest.raises(ValidationError):
        BALAnalysis.model_validate(payload)


def test_insufficient_data_must_have_null_value():
    payload = valid_payload()
    item = payload["indicators"][0]
    item["status"] = "insufficient_data"
    item["value"] = 0.0
    item["coverage"] = {"expected": 7, "observed": 4, "ratio": 4 / 7}
    with pytest.raises(ValidationError):
        BALAnalysis.model_validate(payload)


def test_non_finite_indicator_value_is_rejected():
    payload = valid_payload()
    payload["indicators"][0]["value"] = float("nan")
    with pytest.raises(ValidationError):
        BALAnalysis.model_validate(payload)


def test_scope_window_must_be_ordered():
    payload = valid_payload()
    payload["scope"]["from"] = "2026-10-08"
    with pytest.raises(ValidationError):
        BALAnalysis.model_validate(payload)


def test_unknown_fields_are_rejected():
    payload = valid_payload()
    payload["unexpected"] = True
    with pytest.raises(ValidationError):
        BALAnalysis.model_validate(payload)


def test_indicator_period_must_fit_analysis_scope():
    payload = valid_payload()
    payload["indicators"][0]["period"]["to"] = "2026-10-08"
    with pytest.raises(ValidationError):
        BALAnalysis.model_validate(payload)


def test_naive_generated_timestamp_is_rejected():
    payload = valid_payload()
    payload["generated_at"] = "2026-11-10T08:00:00"
    with pytest.raises(ValidationError):
        BALAnalysis.model_validate(payload)


def test_coverage_ratio_must_match_counts():
    payload = valid_payload()
    payload["indicators"][0]["coverage"] = {
        "expected": 7,
        "observed": 6,
        "ratio": 1.0,
    }
    with pytest.raises(ValidationError):
        BALAnalysis.model_validate(payload)
