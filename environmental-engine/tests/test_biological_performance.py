from datetime import datetime, timedelta, timezone

import pytest

from ba_environmental_engine.indicators.biological_performance import (
    BiologicalMeasurement,
    analyze_growth_rate,
)


def measurement(record_id, days, value, *, unit="mm", quality="verified", subject="culture-1"):
    return BiologicalMeasurement(
        source_record_id=record_id,
        organization_id="org-1",
        subject_id=subject,
        metric_code="growth_extent",
        value=value,
        unit_code=unit,
        measured_at=datetime(2026, 1, 1, tzinfo=timezone.utc) + timedelta(days=days),
        quality_state=quality,
    )


def test_growth_rate_is_derived_from_two_quality_accepted_points_with_provenance():
    result = analyze_growth_rate(
        [measurement("m1", 0, 4), measurement("m2", 3, 16)],
        organization_id="org-1",
        subject_id="culture-1",
        accepted_quality_states={"verified"},
    )
    assert result.status == "calculated"
    assert result.value == pytest.approx(4.0)
    assert result.unit_code == "mm/day"
    assert result.source_record_ids == ("m1", "m2")
    assert result.formula_code == "net_growth_rate"
    assert result.formula_version == "1.0.0"


def test_growth_rate_reports_insufficient_evidence_instead_of_fabricating_a_value():
    result = analyze_growth_rate(
        [measurement("m1", 0, 4)],
        subject_id="culture-1",
        accepted_quality_states={"verified"},
    )
    assert result.status == "insufficient_evidence"
    assert result.value is None
    assert result.source_record_ids == ("m1",)


def test_growth_rate_rejects_mixed_units_instead_of_comparing_them():
    with pytest.raises(ValueError, match="same unit"):
        analyze_growth_rate(
            [measurement("m1", 0, 4, unit="mm"), measurement("m2", 3, 1.6, unit="cm")],
            subject_id="culture-1",
            accepted_quality_states={"verified"},
        )


def test_growth_rate_excludes_quality_states_not_explicitly_accepted():
    result = analyze_growth_rate(
        [measurement("m1", 0, 4, quality="verified"), measurement("m2", 3, 16, quality="excluded")],
        subject_id="culture-1",
        accepted_quality_states={"verified"},
    )
    assert result.status == "insufficient_evidence"
    assert result.value is None
    assert result.excluded_count == 1


def test_growth_rate_rejects_duplicate_source_ids():
    with pytest.raises(ValueError, match="unique"):
        analyze_growth_rate(
            [measurement("m1", 0, 4), measurement("m1", 3, 16)],
            subject_id="culture-1",
            accepted_quality_states={"verified"},
        )


def test_measurement_contract_rejects_naive_timestamps_and_nonfinite_values():
    with pytest.raises(ValueError, match="timezone"):
        BiologicalMeasurement("m1", "org-1", "culture-1", "growth_extent", 1, "mm", datetime(2026, 1, 1), "verified")
    with pytest.raises(ValueError, match="finite"):
        measurement("m2", 1, float("nan"))


def test_growth_rate_ignores_other_subjects_and_other_metric_codes():
    unrelated = BiologicalMeasurement(
        "other", "org-1", "culture-2", "growth_extent", 100, "mm",
        datetime(2026, 1, 1, tzinfo=timezone.utc), "verified"
    )
    result = analyze_growth_rate(
        [measurement("m1", 0, 4), measurement("m2", 2, 10), unrelated],
        subject_id="culture-1",
        accepted_quality_states={"verified"},
    )
    assert result.value == pytest.approx(3.0)
    assert result.source_record_ids == ("m1", "m2")



def test_growth_rate_is_tenant_scoped_even_when_subject_ids_match():
    foreign_tenant = BiologicalMeasurement(
        source_record_id="m3",
        organization_id="org-2",
        subject_id="culture-1",
        metric_code="growth_extent",
        value=20,
        unit_code="mm",
        measured_at=datetime(2026, 1, 4, tzinfo=timezone.utc),
        quality_state="verified",
    )
    result = analyze_growth_rate(
        [measurement("m1", 0, 4), measurement("m2", 2, 10), foreign_tenant],
        organization_id="org-1",
        subject_id="culture-1",
        accepted_quality_states={"verified"},
    )
    assert result.source_record_ids == ("m1", "m2")
