# FAO-56 daily reference evapotranspiration contract v1

## Purpose

Define a deterministic, provider-independent implementation of FAO-56 Penman–Monteith reference evapotranspiration (ET0) for daily time steps. The calculation is part of the Environmental Intelligence Python core. It is not an acquisition adapter and has no network or database access.

## Formula

For a daily time step, FAO-56 Eq. 6 is implemented:

\[
ET_0 = \frac{0.408\,\Delta\,(R_n-G)+\gamma\,\frac{900}{T+273}\,u_2\,(e_s-e_a)}
{\Delta+\gamma(1+0.34u_2)}
\]

Where:
- ET0: reference evapotranspiration (mm day-1);
- T: mean daily air temperature at 2 m (°C);
- u2: wind speed at 2 m (m s-1);
- es: mean saturation vapour pressure (kPa), calculated from daily Tmax and Tmin;
- ea: actual vapour pressure (kPa);
- es - ea: vapour-pressure deficit (kPa);
- Δ: slope of the saturation vapour pressure curve at T (kPa °C-1);
- γ: psychrometric constant (kPa °C-1);
- Rn: net radiation (MJ m-2 day-1);
- G: soil heat flux density (MJ m-2 day-1), defaulted to zero for this daily implementation.

Saturation vapour pressure uses the FAO-56 Tetens equation. Atmospheric pressure is either supplied directly or estimated from an explicitly supplied station altitude using FAO-56 Eq. 7. The psychrometric constant is γ = 0.000665 P.

## Input contract

Required:
- mean, maximum and minimum daily air temperature in °C;
- wind speed normalized to 2 m in m s-1;
- net radiation in MJ m-2 day-1;
- exactly one of station atmospheric pressure (kPa) or station altitude (m);
- exactly one actual-vapour-pressure source:
  - direct actual vapour pressure (kPa);
  - both daily RH minimum and maximum (%), using the FAO-56 RH-extremes equation;
  - dew-point temperature (°C).

Optional:
- soil heat flux in MJ m-2 day-1; defaults to 0 for daily ET0.

No altitude, pressure, humidity, wind-height correction, or radiation value is inferred by this module. Net radiation must already be calculated or supplied by a validated upstream source. Solar radiation is not accepted as a substitute for net radiation.

## Validation and diagnostics

- Reject booleans, non-numeric values, NaN and infinities.
- Reject temperatures outside the Tetens equation domain, Tmax < Tmin, and Tmean outside [Tmin, Tmax].
- Reject negative wind speed and invalid pressure/altitude.
- Reject missing or conflicting vapour-pressure methods.
- Reject relative humidity outside [0, 100] and physically inconsistent vapour pressure above saturation.
- Retain negative calculated ET0 values without clamping; attach a diagnostic flag for review of energy-balance inputs.

## Output and provenance

The immutable `FAO56ET0Result` includes ET0, derived saturation and actual vapour pressure, VPD, Δ, γ, pressure, wind, net radiation, soil heat flux, formula profile and diagnostics. The stable formula identifier is `fao56_penman_monteith_daily_v1`.

The caller must persist the input observation IDs, normalized input values/units, source provenance, location/elevation provenance, execution timestamp and engine version alongside the result. The calculation module itself does not write records.

## Explicit limitations

- Daily reference grass ET0 only; not crop-specific ETc.
- No hourly calculation.
- No estimation of net radiation from shortwave radiation in this module.
- No automatic wind-height adjustment; the input contract requires u2.
- No automatic gap filling or imputation.
- No use of ET0 as a direct measurement of actual crop, greenhouse, or fungal-substrate water loss.

## Tests

The test suite covers a numerical FAO-56 daily calculation, pressure from altitude, direct vapour pressure, RH-extremes and dew-point derivations, zero wind, invalid and ambiguous inputs, missing pressure/altitude, and negative-result diagnostics.
