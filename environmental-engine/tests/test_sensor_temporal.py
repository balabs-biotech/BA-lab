from ba_environmental_engine.sources.sensor_temporal import assess_sensor_temporal_anomalies

from test_sensor_analysis import envelope


def test_sensor_temporal_screen_flags_outlier_against_past_only_history():
    rows = [envelope(index, value) for index, value in enumerate(
        (10, 11, 12, 13, 14, 15, 16, 17, 100)
    )]
    results = assess_sensor_temporal_anomalies(
        rows,
        window_seconds=9 * 60,
        minimum_history=7,
        threshold=3.5,
    )
    last = results[-1]
    assert last.observation_id == rows[-1].measurement.observation_id
    assert last.status == "suspect"
    assert last.history_count == 8
    assert last.baseline_median == 13.5
    assert last.robust_z_score is not None and last.robust_z_score > 3.5


def test_sensor_temporal_screen_does_not_use_current_or_future_values_as_history():
    rows = [envelope(index * 60, value) for index, value in enumerate(
        (10, 11, 12, 13, 14, 15, 16, 100)
    )]
    results = assess_sensor_temporal_anomalies(
        rows,
        window_seconds=8 * 60,
        minimum_history=7,
        threshold=3.5,
    )
    assert results[-1].history_count == 7
    assert results[-1].status == "suspect"


def test_sensor_temporal_screen_excludes_quality_excluded_rows_from_baseline():
    rows = [
        envelope(0, 10), envelope(60, 11), envelope(120, 12),
        envelope(180, 13), envelope(240, 14), envelope(300, 15),
        envelope(360, 16), envelope(420, 17),
        envelope(8, 999, quality="excluded"),
        envelope(9, 18),
    ]
    results = assess_sensor_temporal_anomalies(
        rows,
        window_seconds=9 * 60,
        minimum_history=7,
        threshold=3.5,
    )
    assert all(item.observation_id != rows[8].measurement.observation_id for item in results)
    assert results[-1].history_count == 8
    assert results[-1].status == "normal"


def test_sensor_temporal_screen_reports_insufficient_history_without_inventing_baseline():
    rows = [envelope(index * 60, 20 + index) for index in range(3)]
    results = assess_sensor_temporal_anomalies(
        rows,
        window_seconds=10 * 60,
        minimum_history=4,
        threshold=3.5,
    )
    assert results[-1].status == "insufficient_history"
    assert results[-1].baseline_median is None
    assert results[-1].robust_z_score is None
