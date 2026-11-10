# FAO-56 daily net-radiation contract v1

## Purpose

Provide a deterministic, provider-independent calculation of daily extraterrestrial radiation, clear-sky radiation and net radiation for the FAO-56 reference evapotranspiration pipeline. This module consumes normalized daily weather observations; it does not acquire data or write database records.

## Equations

Solar geometry follows FAO-56 Eq. 21:

\[
R_a = \frac{24(60)}{\pi}G_{sc}d_r
[\omega_s\sin(\phi)\sin(\delta)+\cos(\phi)\cos(\delta)\sin(\omega_s)]
\]

The clear-sky radiation estimate is:

\[
R_{so}=(0.75+2\times10^{-5}z)R_a
\]

Net shortwave radiation:

\[
R_{ns}=(1-\alpha)R_s
\]

Net longwave radiation:

\[
R_{nl}=\sigma\left[\frac{T_{max,K}^4+T_{min,K}^4}{2}\right]
(0.34-0.14\sqrt{e_a})(1.35R_s/R_{so}-0.35)
\]

Daily net radiation:

\[
R_n=R_{ns}-R_{nl}
\]

The FAO-56 cloudiness ratio \(R_s/R_{so}\) is bounded to [0.3, 1.0] for the longwave calculation. The original ratio is retained in the result; clamping is explicitly flagged.

## Input contract

Required:
- latitude in decimal degrees, north positive;
- day of year (1–366);
- station altitude in metres;
- incoming daily solar radiation \(R_s\), MJ m-2 day-1;
- daily maximum and minimum air temperature in °C;
- actual vapour pressure \(e_a\), kPa.

Optional:
- surface albedo, default 0.23 for the FAO reference grass surface.

The module requires actual vapour pressure as a normalized input. Its upstream calculation must retain the source method and observations (direct vapour pressure, dew point, or humidity-derived). No missing meteorological input is inferred.

## Validation and diagnostics

- Reject invalid latitude, day-of-year, altitude, non-finite values and negative solar radiation.
- Reject Tmin above Tmax, temperatures below absolute zero, invalid albedo, and negative vapour pressure.
- Reject actual vapour pressure above saturation pressure at Tmax.
- Reject zero clear-sky radiation: the daily cloudiness correction is undefined for polar-night conditions.
- Preserve the raw Rs/Rso ratio and expose the bounded ratio.
- Add \`cloudiness_ratio_clamped_low\` or \`cloudiness_ratio_clamped_high\` diagnostics when the FAO bounds are applied.

## Output and provenance

The immutable \`FAO56NetRadiationResult\` includes Ra, Rso, raw and effective Rs/Rso, Rns, Rnl, Rn, location/date inputs, source solar radiation, albedo, actual vapour pressure, formula profile and diagnostics.

Stable formula identifier: \`fao56_daily_net_radiation_v1\`.

The caller must persist source observation IDs, normalized values and units, provider provenance, station coordinates and altitude provenance, execution timestamp and engine version alongside the result. Derived Rn is not a sensor measurement and must not overwrite source solar radiation.

## Limitations

- Daily FAO-56 radiation balance only.
- No hourly radiation calculation.
- No terrain-horizon, slope, aspect, shading or local obstruction correction.
- No automatic solar-radiation gap filling.
- No derivation of actual vapour pressure inside this module.
- The albedo default is for the FAO reference grass surface, not automatically appropriate for greenhouse roofs, bare soil, fungal substrates or other surfaces.
- Polar-night days with zero clear-sky radiation are explicitly unsupported by this daily cloudiness correction.

## Tests

Tests cover solar geometry near the equinox, a numerical radiation balance, both cloudiness-ratio bounds, polar night, and invalid inputs.
