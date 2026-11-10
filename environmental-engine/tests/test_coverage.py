from datetime import date, timedelta

from ba_environmental_engine.quality.coverage import assess_daily_coverage


def test_seven_day_window_with_one_missing_day_is_available():
    start = date(2026, 10, 1)
    observed = [start + timedelta(days=i) for i in range(6)]

    result = assess_daily_coverage(start, start + timedelta(days=6), observed, minimum_ratio=6 / 7)

    assert result.expected == 7
    assert result.observed == 6
    assert result.ratio == 6 / 7
    assert result.available is True
    assert result.missing_dates == [start + timedelta(days=6)]


def test_coverage_below_threshold_is_not_available():
    start = date(2026, 10, 1)
    observed = [start + timedelta(days=i) for i in range(5)]

    result = assess_daily_coverage(start, start + timedelta(days=6), observed, minimum_ratio=6 / 7)

    assert result.available is False
    assert result.observed == 5
    assert result.missing_dates == [start + timedelta(days=5), start + timedelta(days=6)]
