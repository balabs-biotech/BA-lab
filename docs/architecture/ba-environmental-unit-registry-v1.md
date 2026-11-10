# Climate unit registry — v1

The unit registry is an explicit conversion boundary. It does not guess units,
infer a variable from a label, or silently accept aliases. Source observations
retain their original value and unit; the normalized value is an in-memory
representation for calculations.

## Canonical variables

| Variable code | Canonical unit | Accepted source units |
|---|---|---|
| `air_temperature_mean` | `degC` | `degC`, `K` |
| `air_temperature_max` | `degC` | `degC`, `K` |
| `air_temperature_min` | `degC` | `degC`, `K` |
| `wind_speed_mean` | `m/s` | `m/s`, `km/h` |
| `relative_humidity_mean` | `%` | `%`, `fraction` |
| `precipitation_corrected` | `mm` | `mm`, `kg/m2` |
| `solar_radiation_all_sky` | `MJ/m2` | `MJ/m2`, `kWh/m2` |
| `surface_pressure` | `Pa` | `Pa`, `hPa`, `kPa` |

## Physical conventions and constraints

- Temperature is converted through kelvin, so Celsius conversion includes an
  offset rather than a scale-only conversion.
- For liquid-water precipitation, `1 kg/m2 = 1 mm` water equivalent. This
  equivalence is not a generic mass-to-length conversion and must not be reused
  for arbitrary substances or snow-water assumptions without a defined source
  convention.
- Solar radiation uses `1 kWh/m2 = 3.6 MJ/m2`.
- Relative humidity is represented canonically as percent; a fractional input
  such as `0.65` becomes `65 %`.
- Unsupported units, incompatible dimensions, unknown variables, booleans,
  NaN, and infinite values are rejected.
- Unit symbols are intentionally strict in v1. Provider-specific unit labels
  must be mapped in the source adapter before calling the registry.

## Provenance

`NormalizedValue` carries both the canonical value/unit and the original
value/unit. The source database row is never modified by normalization.
