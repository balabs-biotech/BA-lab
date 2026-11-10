from datetime import date

import pytest

from ba_environmental_engine.quality.seasonal import (
    DailySeasonalObservation,
    assess_seasonal_reference,
)


def observations():
    rows = []
    for year, base in [(2022, 10.0), (2023, 10.5), (2024, 9.8), (2025, 10.2)]:
        for day in range(1, 31):
            rows.append(DailySeasonalObservation(date(year, 6, day), base + (day % 3) * 0.1))
    rows.append(DailySeasonalObservation(date(2026, 6, 15), 30.0))
    return rows


def test_compares_against_same_season_from_prior_years_only():
    result = assess_seasonal_reference(
        observations(), minimum_years=3, half_window_days=15, threshold=3.5
    )[-1]
    assert result.status == "suspect"
    assert result.reference_years == (2022, 2023, 2024, 2025)
    assert result.reference_median == pytest.approx(10.2)
    assert result.evaluated_value == 30.0


def test_does_not_use_observations_from_the_same_or_future_year():
    rows = [
        DailySeasonalObservation(date(2025, 6, 15), 10.0),
        DailySeasonalObservation(date(2026, 6, 15), 80.0),
    ]
    result = assess_seasonal_reference(rows, minimum_years=2)[-1]
    assert result.status == "insufficient_reference"


def test_reports_zero_mad_as_indeterminate():
    rows = [
        DailySeasonalObservation(date(year, 6, 15), 10.0)
        for year in (2022, 2023, 2024, 2025)
    ]
    rows.append(DailySeasonalObservation(date(2026, 6, 15), 30.0))
    result = assess_seasonal_reference(rows, minimum_years=3)[-1]
    assert result.status == "indeterminate"
    assert "zero_mad_reference" in result.flags


def test_leap_year_dates_share_the_same_seasonal_calendar():
    rows = [
        DailySeasonalObservation(date(2022, 3, 1), 10.0),
        DailySeasonalObservation(date(2023, 3, 1), 10.2),
        DailySeasonalObservation(date(2024, 3, 1), 9.9),
        DailySeasonalObservation(date(2025, 3, 1), 10.1),
        DailySeasonalObservation(date(2026, 3, 1), 30.0),
    ]
    result = assess_seasonal_reference(rows, minimum_years=3, half_window_days=2)[-1]
    assert result.reference_years == (2022, 2023, 2024, 2025)
    assert result.status == "suspect"


def test_rejects_duplicate_dates_and_non_finite_values():
    duplicate = [
        DailySeasonalObservation(date(2024, 1, 1), 1.0),
        DailySeasonalObservation(date(2024, 1, 1), 2.0),
    ]
    with pytest.raises(ValueError, match="duplicate"):
        assess_seasonal_reference(duplicate)
    invalid = [DailySeasonalObservation(date(2024, 1, 1), float("nan"))]
    with pytest.raises(ValueError, match="finite"):
        assess_seasonal_reference(invalid)
