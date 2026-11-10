from ba_environmental_engine.indicators.biological_pipeline import (
    analyze_measurement_rows,
)


def row(record_id, day, value, **overrides):
    item = {
        "id": record_id,
        "organization_id": "org-1",
        "culture_id": "culture-1",
        "plant_culture_id": None,
        "sample_id": None,
        "experimental_unit_id": None,
        "variable_code": "root_length",
        "raw_value": value,
        "raw_unit_code": "mm",
        "normalized_value": value,
        "normalized_unit_code": "mm",
        "measured_at": f"2026-01-{day:02d}T10:00:00+00:00",
        "quality_state": "validated",
    }
    item.update(overrides)
    return item


def run(rows):
    return analyze_measurement_rows(
        rows,
        organization_id="org-1",
        subject_id="culture-1",
        subject_type="culture",
        variable_code="root_length",
        variable_registry={"root_length": "mm"},
        accepted_quality_states={"validated"},
    )


def test_pipeline_maps_rows_and_returns_calculation_with_provenance():
    result = run([row("m1", 1, 4), row("m2", 4, 16)])
    assert result.status == "calculated"
    assert result.calculation.value == 4.0
    assert result.calculation.unit_code == "mm/day"
    assert result.calculation.source_record_ids == ("m1", "m2")
    assert result.input_row_count == 2
    assert result.candidate_row_count == 2
    assert result.ignored_out_of_scope_count == 0
    assert result.rejected_rows == ()


def test_pipeline_ignores_other_tenants_variables_and_subjects():
    result = run([
        row("m1", 1, 4),
        row("m2", 4, 16),
        row("foreign", 5, 900, organization_id="org-2"),
        row("other-variable", 5, 900, variable_code="shoot_length"),
        row("other-subject", 5, 900, culture_id="culture-2"),
        row(
            "other-subject-type",
            5,
            900,
            culture_id=None,
            plant_culture_id="plant-culture-1",
        ),
    ])
    assert result.calculation.value == 4.0
    assert result.calculation.source_record_ids == ("m1", "m2")
    assert result.input_row_count == 6
    assert result.candidate_row_count == 4
    assert result.ignored_out_of_scope_count == 2


def test_pipeline_reports_invalid_candidate_rows_instead_of_silently_dropping_them():
    result = run([
        row("m1", 1, 4),
        row("bad-unit", 4, 16, raw_unit_code="cm", normalized_unit_code="cm"),
    ])
    assert result.status == "insufficient_evidence"
    assert result.calculation.value is None
    assert len(result.rejected_rows) == 1
    assert result.rejected_rows[0].source_record_id == "bad-unit"
    assert "canonical unit" in result.rejected_rows[0].reason
    assert result.candidate_row_count == 2


def test_pipeline_accepts_one_shot_iterables_and_reports_insufficient_evidence():
    result = run(iter([row("m1", 1, 4)]))
    assert result.status == "insufficient_evidence"
    assert result.calculation.value is None
    assert result.calculation.source_record_ids == ("m1",)


def test_pipeline_does_not_hide_duplicate_source_record_ids():
    try:
        run([row("duplicate", 1, 4), row("duplicate", 4, 16)])
    except ValueError as exc:
        assert "unique" in str(exc)
    else:
        raise AssertionError("duplicate source IDs must be rejected")
