"""Deterministic serialization of environmental calculations into BAL-JSON v1."""

from collections import defaultdict
from datetime import date, datetime
from typing import Iterable
from uuid import UUID

from ba_environmental_engine.climate.daily_reference import DailyReferenceIndicators
from ba_environmental_engine.climate.windows import ClimateWindowIndicator
from ba_environmental_engine.contracts.bal_json import (
    BALAnalysis,
    Indicator,
    IndicatorCoverage,
    IndicatorInput,
    IndicatorMethod,
    IndicatorPeriod,
    IndicatorQuality,
    AnomalyFinding,
    SourceSummary,
)
from ba_environmental_engine.sources.models import NormalizedEnvironmentalObservation


_DAILY_INPUTS: tuple[tuple[str, str], ...] = (
    ("air_temperature_mean", "degC"),
    ("air_temperature_max", "degC"),
    ("air_temperature_min", "degC"),
    ("wind_speed_mean", "m/s"),
    ("solar_radiation_all_sky", "MJ/m2"),
    ("relative_humidity_mean", "%"),
)

_NET_RADIATION_INPUTS: tuple[tuple[str, str], ...] = (
    ("air_temperature_max", "degC"),
    ("air_temperature_min", "degC"),
    ("solar_radiation_all_sky", "MJ/m2"),
    ("relative_humidity_mean", "%"),
)


def _quality_class(row: NormalizedEnvironmentalObservation) -> str:
    if row.data_family == "satellite":
        return "satellite_derived"
    if row.provider_code == "NASA_POWER":
        return "gridded_estimate"
    return "measured"


def _indicator_quality(rows: list[NormalizedEnvironmentalObservation],
                       diagnostics: Iterable[str] = ()) -> IndicatorQuality:
    if not rows:
        raise ValueError("each indicator must be supported by at least one source observation")
    classes = {_quality_class(row) for row in rows}
    quality_class = next(iter(classes)) if len(classes) == 1 else "mixed"
    flags = {flag for row in rows if row.quality_flag for flag in [row.quality_flag]}
    flags.update(diagnostics)
    if any(row.provider_code == "NASA_POWER" for row in rows):
        flags.add("GRIDDED_ESTIMATE")
    return IndicatorQuality(**{"class": quality_class, "flags": sorted(flags)})


def _rolling_indicator_code(variable_code: str, method: str, window_days: int) -> str:
    """Map canonical variables to stable public indicator codes."""
    base_codes = {
        ("precipitation_corrected", "sum"): "precipitation_sum",
        ("solar_radiation_all_sky", "sum"): "solar_radiation_sum",
    }
    base = base_codes.get((variable_code, method), variable_code)
    return f"{base}_{window_days}d"


def _source_summaries(
    observations: list[NormalizedEnvironmentalObservation],
    consumed_variables: set[str],
) -> list[SourceSummary]:
    groups: dict[tuple[str, str, str], list[NormalizedEnvironmentalObservation]] = defaultdict(list)
    for row in observations:
        if row.variable_code in consumed_variables:
            groups[(row.provider_code, row.dataset_code, row.data_family)].append(row)

    summaries: list[SourceSummary] = []
    for (provider, dataset, family), rows in sorted(groups.items()):
        classes = {_quality_class(row) for row in rows}
        quality_class = next(iter(classes)) if len(classes) == 1 else "mixed"
        resolutions = {row.spatial_resolution_m for row in rows}
        resolution = next(iter(resolutions)) if len(resolutions) == 1 else None
        summaries.append(
            SourceSummary(
                provider_code=provider,
                dataset_code=dataset,
                data_family=family,
                variables=sorted({row.variable_code for row in rows}),
                observations_count=len({row.source_observation_id for row in rows}),
                observed_from=min(row.observed_date for row in rows),
                observed_to=max(row.observed_date for row in rows),
                latest_retrieved_at=max(row.retrieved_at for row in rows),
                quality_class=quality_class,
                spatial_resolution_m=resolution,
                source_urls=sorted({row.source_url for row in rows if row.source_url}),
            )
        )
    return summaries


def build_bal_analysis(
    *,
    observations: Iterable[NormalizedEnvironmentalObservation],
    analysis_id: UUID,
    generated_at: datetime,
    engine_version: str,
    scope_from: date,
    scope_to: date,
    daily_indicators: Iterable[DailyReferenceIndicators] = (),
    rolling_indicators: Iterable[ClimateWindowIndicator] = (),
    findings: Iterable[AnomalyFinding] = (),
) -> BALAnalysis:
    """Build and validate one tenant/location-scoped BAL-JSON analysis.

    This function is deliberately pure: it does not fetch, persist, interpolate,
    or scientifically reinterpret observations and calculation results.
    """
    rows = list(observations)
    daily_results = list(daily_indicators)
    rolling_results = list(rolling_indicators)
    anomaly_findings = list(findings)

    if scope_to < scope_from:
        raise ValueError("scope_to must be on or after scope_from")
    if generated_at.tzinfo is None or generated_at.utcoffset() is None:
        raise ValueError("generated_at must include a timezone")
    if not rows:
        raise ValueError("at least one normalized source observation is required")

    by_id: dict[UUID, NormalizedEnvironmentalObservation] = {}
    for row in rows:
        if not isinstance(row, NormalizedEnvironmentalObservation):
            raise ValueError("all observations must be normalized environmental observations")
        previous = by_id.get(row.source_observation_id)
        if previous is not None:
            if previous != row:
                raise ValueError("duplicate source observation IDs have conflicting data")
            raise ValueError("duplicate source observation IDs are not allowed")
        by_id[row.source_observation_id] = row

    tenant_scope = {(row.organization_id, row.location_id) for row in rows}
    if len(tenant_scope) != 1:
        raise ValueError("observations must share the same organization and location")
    organization_id, location_id = next(iter(tenant_scope))
    if any(not scope_from <= row.observed_date <= scope_to for row in rows):
        raise ValueError("observations must be contained within analysis scope")

    if not daily_results and not rolling_results:
        raise ValueError("at least one daily or rolling indicator result is required")

    daily_dates = [result.observed_date for result in daily_results]
    if len(daily_dates) != len(set(daily_dates)):
        raise ValueError("daily indicator results must contain at most one result per date")

    rolling_keys = [
        (result.variable_code, result.window_days, result.period_start, result.period_end)
        for result in rolling_results
    ]
    if len(rolling_keys) != len(set(rolling_keys)):
        raise ValueError("duplicate rolling indicator results are not allowed")

    used_variables: set[str] = set()
    output: list[Indicator] = []
    warnings: set[str] = set()

    for result in daily_results:
        if (result.organization_id, result.location_id) != (organization_id, location_id):
            raise ValueError("daily calculation scope must match observations organization and location")
        if not scope_from <= result.observed_date <= scope_to:
            raise ValueError("daily calculation date must be contained within analysis scope")

        result_rows = [
            by_id[source_id]
            for source_id in result.source_observation_ids
            if source_id in by_id
        ]
        if len(result_rows) != len(result.source_observation_ids):
            raise ValueError("daily calculation references unknown source observation IDs")
        if any(row.observed_date != result.observed_date for row in result_rows):
            raise ValueError("daily calculation source observations must match its date")

        selected_by_variable = {row.variable_code: row for row in result_rows}
        if len(selected_by_variable) != len(result_rows):
            raise ValueError("daily calculation cannot reference multiple observations for one variable")
        if set(selected_by_variable) != set(result.source_variable_codes):
            raise ValueError("daily calculation variable lineage does not match source rows")
        used_variables.update(result.source_variable_codes)

        def build_coverage(input_definitions: tuple[tuple[str, str], ...]) -> IndicatorCoverage:
            expected = len(input_definitions)
            observed = sum(1 for variable, _unit in input_definitions if variable in selected_by_variable)
            return IndicatorCoverage(
                expected=expected,
                observed=observed,
                ratio=observed / expected,
            )

        net_radiation_coverage = build_coverage(_NET_RADIATION_INPUTS)
        et0_coverage = build_coverage(_DAILY_INPUTS)

        def build_inputs(input_definitions: tuple[tuple[str, str], ...]) -> list[IndicatorInput]:
            return [
                IndicatorInput(
                    variable_code=variable,
                    unit=unit,
                    source_observation_ids=(
                        [selected_by_variable[variable].source_observation_id]
                        if variable in selected_by_variable else []
                    ),
                )
                for variable, unit in input_definitions
            ]

        net_radiation_rows = [
            selected_by_variable[variable]
            for variable, _unit in _NET_RADIATION_INPUTS
            if variable in selected_by_variable
        ]
        et0_rows = [
            selected_by_variable[variable]
            for variable, _unit in _DAILY_INPUTS
            if variable in selected_by_variable
        ]
        net_radiation_inputs = build_inputs(_NET_RADIATION_INPUTS)
        et0_inputs = build_inputs(_DAILY_INPUTS)
        # An unavailable formula can have zero usable inputs (for example, a
        # daily row containing only wind speed). Retain the source's quality
        # class as context and make the absence of formula inputs explicit.
        net_radiation_quality = _indicator_quality(
            net_radiation_rows or result_rows,
            result.diagnostics + (("NO_AVAILABLE_FORMULA_INPUTS",) if not net_radiation_rows else ()),
        )
        et0_quality = _indicator_quality(
            et0_rows or result_rows,
            result.diagnostics + (("NO_AVAILABLE_FORMULA_INPUTS",) if not et0_rows else ()),
        )
        if result.status == "insufficient_data":
            for variable in result.missing_variables:
                warnings.add(f"INSUFFICIENT_DAILY_INPUT:{result.observed_date.isoformat()}:{variable}")
            net_value = et0_value = None
            net_status = et0_status = "insufficient_data"
        else:
            if result.net_radiation is None or result.et0 is None:
                raise ValueError("available daily calculation must include net radiation and ET0 results")
            net_value = result.net_radiation.net_radiation_mj_m2_day
            et0_value = result.et0.reference_evapotranspiration_mm_day
            net_status = et0_status = "available"

        output.extend(
            [
                Indicator(
                    code="net_radiation_fao56_daily",
                    label="Daily FAO-56 net radiation",
                    value=net_value,
                    unit="MJ/m2/day",
                    period=IndicatorPeriod(
                        **{"from": result.observed_date, "to": result.observed_date,
                           "aggregation": "daily"}
                    ),
                    status=net_status,
                    coverage=net_radiation_coverage,
                    quality=net_radiation_quality,
                    method=IndicatorMethod(
                        name="fao56_net_radiation",
                        version=result.net_radiation.formula_profile if result.net_radiation is not None else "fao56_daily_net_radiation_v1",
                    ),
                    inputs=net_radiation_inputs,
                ),
                Indicator(
                    code="reference_et0_fao56_daily",
                    label="Daily FAO-56 reference evapotranspiration",
                    value=et0_value,
                    unit="mm/day",
                    period=IndicatorPeriod(
                        **{"from": result.observed_date, "to": result.observed_date,
                           "aggregation": "daily"}
                    ),
                    status=et0_status,
                    coverage=et0_coverage,
                    quality=et0_quality,
                    method=IndicatorMethod(
                        name="fao56_penman_monteith",
                        version=result.et0.formula_profile if result.et0 is not None else "fao56_penman_monteith_daily_v1",
                    ),
                    inputs=et0_inputs,
                ),
            ]
        )
        warnings.update(result.diagnostics)

    for result in rolling_results:
        aggregation = result.aggregation
        if aggregation.unit is None:
            raise ValueError(f"rolling indicator {result.variable_code} must declare a unit")
        if result.period_start < scope_from or result.period_end > scope_to:
            raise ValueError("rolling indicator period must be contained within analysis scope")
        if (result.period_end - result.period_start).days + 1 != result.window_days:
            raise ValueError("rolling indicator period length must equal window_days")
        coverage = aggregation.coverage
        if (
            coverage.start != result.period_start
            or coverage.end != result.period_end
            or coverage.expected != result.window_days
        ):
            raise ValueError("rolling indicator coverage must match its declared period")
        variable_rows = [
            row for row in rows
            if row.data_family == "weather"
            and row.variable_code == result.variable_code
            and result.period_start <= row.observed_date <= result.period_end
        ]
        observed_dates = {row.observed_date for row in variable_rows}
        if len(observed_dates) != coverage.observed:
            raise ValueError(
                "rolling indicator source observations do not match reported coverage"
            )
        if not variable_rows:
            raise ValueError(
                "rolling indicator must be supported by source observations in its period"
            )
        used_variables.add(result.variable_code)
        output.append(
            Indicator(
                code=_rolling_indicator_code(
                    result.variable_code, aggregation.method, result.window_days
                ),
                label=f"{result.variable_code} {aggregation.method} over {result.window_days} days",
                value=aggregation.value,
                unit=aggregation.unit,
                period=IndicatorPeriod(
                    **{"from": result.period_start, "to": result.period_end,
                       "aggregation": f"rolling_{result.window_days}d"}
                ),
                status=aggregation.status,
                coverage=IndicatorCoverage(
                    expected=coverage.expected,
                    observed=coverage.observed,
                    ratio=coverage.ratio,
                ),
                quality=_indicator_quality(variable_rows),
                method=IndicatorMethod(name=aggregation.method, version="rolling_daily_v1"),
                inputs=[
                    IndicatorInput(
                        variable_code=result.variable_code,
                        unit=aggregation.unit,
                        source_observation_ids=sorted(
                            (row.source_observation_id for row in variable_rows),
                            key=str,
                        ),
                    )
                ],
            )
        )
        if aggregation.status == "insufficient_data":
            warnings.add(
                f"LOW_COVERAGE:{result.variable_code}:{result.period_start.isoformat()}:{result.period_end.isoformat()}"
            )

    output.sort(key=lambda item: (item.period.from_date, item.code))
    finding_ids = [item.finding_id for item in anomaly_findings]
    if len(finding_ids) != len(set(finding_ids)):
        raise ValueError("anomaly finding IDs must be unique")
    for finding in anomaly_findings:
        if not scope_from <= finding.observed_date <= scope_to:
            raise ValueError("anomaly finding date must be contained within analysis scope")
        if not finding.source_observation_ids:
            raise ValueError("anomaly findings must retain source observation lineage")
        finding_rows = []
        for source_id in finding.source_observation_ids:
            source_row = by_id.get(source_id)
            if source_row is None:
                raise ValueError("anomaly finding references unknown source observation IDs")
            if (
                source_row.observed_date != finding.observed_date
                or source_row.variable_code != finding.variable_code
                or source_row.unit != finding.unit
                or source_row.value != finding.observed_value
            ):
                raise ValueError("anomaly finding source observations must match its date, variable, unit and value")
            finding_rows.append(source_row)
        used_variables.add(finding.variable_code)

    summaries = _source_summaries(rows, used_variables)

    return BALAnalysis(
        contract_version="1.0.0",
        engine={"name": "ba-environmental-intelligence", "version": engine_version},
        analysis_id=analysis_id,
        generated_at=generated_at,
        scope={
            "organization_id": organization_id,
            "location_id": location_id,
            "from": scope_from,
            "to": scope_to,
        },
        source_summary=summaries,
        indicators=output,
        findings=anomaly_findings,
        warnings=sorted(warnings),
    )
