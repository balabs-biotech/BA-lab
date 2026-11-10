from datetime import date, timedelta

from ba_environmental_engine.climate.aggregation import aggregate_daily_values


def test_mean_aggregation_reports_coverage_and_value():
    start = date(2026, 10, 1)
    values = {start + timedelta(days=i): float(i + 10) for i in range(6)}

    result = aggregate_daily_values(
        values, start, start + timedelta(days=6), method="mean", minimum_ratio=6 / 7
    )

    assert result.status == "available"
    assert result.value == 12.5
    assert result.coverage.expected == 7
    assert result.coverage.observed == 6


def test_low_coverage_returns_null_instead_of_a_partial_total():
    start = date(2026, 10, 1)
    values = {start + timedelta(days=i): 2.0 for i in range(5)}

    result = aggregate_daily_values(
        values, start, start + timedelta(days=6), method="sum", minimum_ratio=6 / 7
    )

    assert result.status == "insufficient_data"
    assert result.value is None


def test_non_finite_values_are_rejected():
    start = date(2026, 10, 1)

    try:
        aggregate_daily_values(
            {start: float("nan")}, start, start, method="mean", minimum_ratio=1.0
        )
    except ValueError as error:
        assert "finite" in str(error)
    else:
        raise AssertionError("non-finite values must be rejected")
