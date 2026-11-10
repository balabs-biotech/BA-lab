from datetime import date, timedelta
from uuid import uuid4

import pytest

from ba_environmental_engine.quality.findings import build_temporal_findings
from ba_environmental_engine.quality.temporal import DailyObservation, assess_temporal_anomalies


def test_temporal_findings_preserve_status_method_and_source_lineage():
    analysis_id = uuid4()
    source_ids = [uuid4() for _ in range(8)]
    observations = [
        DailyObservation(date(2026, 1, 1) + timedelta(days=i), value)
        for i, value in enumerate([20.0, 20.2, 19.9, 20.1, 20.0, 20.2, 19.8, 45.0])
    ]
    assessments = assess_temporal_anomalies(
        observations, window=7, minimum_history=7
    )
    findings = build_temporal_findings(
        analysis_id=analysis_id,
        variable_code="air_temperature_mean",
        unit="degC",
        assessments=[assessments[-1]],
        source_observation_ids_by_date={observations[-1].observed_date: [source_ids[-1]]},
    )
    finding = findings[0]
    assert finding.status == "suspect"
    assert finding.observed_value == 45.0
    assert finding.source_observation_ids == [source_ids[-1]]
    assert finding.method.name == "robust_calendar_mad_screening"
    assert finding.finding_id == build_temporal_findings(
        analysis_id=analysis_id,
        variable_code="air_temperature_mean",
        unit="degC",
        assessments=[assessments[-1]],
        source_observation_ids_by_date={observations[-1].observed_date: [source_ids[-1]]},
    )[0].finding_id


def test_temporal_findings_reject_duplicate_source_ids_and_dates():
    day = date(2026, 1, 1)
    assessments = assess_temporal_anomalies([DailyObservation(day, 10.0)])
    source_id = uuid4()
    with pytest.raises(ValueError, match="unique per finding"):
        build_temporal_findings(
            analysis_id=uuid4(),
            variable_code="air_temperature_mean",
            unit="degC",
            assessments=assessments,
            source_observation_ids_by_date={day: [source_id, source_id]},
        )
    with pytest.raises(ValueError, match="unique dates"):
        build_temporal_findings(
            analysis_id=uuid4(),
            variable_code="air_temperature_mean",
            unit="degC",
            assessments=[assessments[0], assessments[0]],
            source_observation_ids_by_date={},
        )
