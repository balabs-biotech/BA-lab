"""Variable-specific plausibility screening; never repairs source observations."""

from dataclasses import dataclass
from math import isfinite
from typing import Final, Literal


@dataclass(frozen=True, slots=True)
class ScreeningRule:
    minimum: float | None = None
    maximum: float | None = None
    screening_minimum: float | None = None
    screening_maximum: float | None = None
    negative_is_invalid: bool = False


@dataclass(frozen=True, slots=True)
class PlausibilityAssessment:
    variable_code: str
    original_value: float
    evaluated_value: float
    status: Literal["valid", "suspect", "invalid"]
    flags: tuple[str, ...]
    profile: str = "global_screening_v1"


# Broad screening limits, not crop-specific agronomic operating ranges.
# Hard bounds are reserved for physically constrained variables; soft limits
# only flag values for review and never reject or modify the observation.
_RULES: Final[dict[str, ScreeningRule]] = {
    "air_temperature_mean": ScreeningRule(screening_minimum=-90.0, screening_maximum=60.0),
    "air_temperature_max": ScreeningRule(screening_minimum=-90.0, screening_maximum=60.0),
    "air_temperature_min": ScreeningRule(screening_minimum=-90.0, screening_maximum=60.0),
    "relative_humidity_mean": ScreeningRule(minimum=0.0, maximum=100.0),
    "precipitation_corrected": ScreeningRule(negative_is_invalid=True, screening_maximum=500.0),
    "solar_radiation_all_sky": ScreeningRule(negative_is_invalid=True, screening_maximum=45.0),
    "wind_speed_mean": ScreeningRule(negative_is_invalid=True, screening_maximum=75.0),
    "surface_pressure": ScreeningRule(screening_minimum=30_000.0, screening_maximum=110_000.0),
}


def assess_observation_plausibility(
    variable_code: str, value: float
) -> PlausibilityAssessment:
    """Classify one value as valid, suspect, or invalid under broad screening rules."""
    try:
        rule = _RULES[variable_code]
    except KeyError as error:
        raise ValueError(f"unsupported variable: {variable_code}") from error

    if isinstance(value, bool) or not isinstance(value, (int, float)) or not isfinite(value):
        raise ValueError("value must be a finite number")

    numeric = float(value)
    flags: list[str] = []
    status: Literal["valid", "suspect", "invalid"] = "valid"

    if rule.negative_is_invalid and numeric < 0:
        flags.append("negative_value")
        status = "invalid"
    if (rule.minimum is not None and numeric < rule.minimum) or (
        rule.maximum is not None and numeric > rule.maximum
    ):
        flags.append("outside_physical_bounds")
        status = "invalid"
    if status != "invalid" and (
        (rule.screening_minimum is not None and numeric < rule.screening_minimum)
        or (rule.screening_maximum is not None and numeric > rule.screening_maximum)
    ):
        flag = (
            "above_screening_threshold"
            if rule.screening_maximum is not None and numeric > rule.screening_maximum
            else "below_screening_threshold"
        )
        flags.append(flag)
        status = "suspect"

    return PlausibilityAssessment(
        variable_code=variable_code,
        original_value=numeric,
        evaluated_value=numeric,
        status=status,
        flags=tuple(flags),
    )
