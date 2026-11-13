\set ON_ERROR_STOP on

do $$
declare
  v_kelvin public.units%rowtype;
  v_celsius public.units%rowtype;
  v_variable public.variables%rowtype;
  v_normalized numeric;
begin
  select * into strict v_kelvin from public.units where code = 'K';
  select * into strict v_celsius from public.units where code = 'degC';
  select * into strict v_variable from public.variables where code = 'temperature';

  if v_kelvin.dimension <> 'temperature' or v_celsius.dimension <> 'temperature' then
    raise exception 'FAIL: temperature unit dimensions are inconsistent';
  end if;
  if v_variable.canonical_unit_code <> 'degC' then
    raise exception 'FAIL: temperature canonical unit must be degC';
  end if;
  if v_kelvin.offset_value <> -273.15 then
    raise exception 'FAIL: Kelvin offset must convert to the Celsius base';
  end if;

  v_normalized := ((273.15 * v_kelvin.factor + v_kelvin.offset_value) - v_celsius.offset_value) / v_celsius.factor;
  if abs(v_normalized) > 0.0000001 then
    raise exception 'FAIL: 273.15 K must normalize to 0 degC, got %', v_normalized;
  end if;

  if (select is_linear from public.units where code = 'pH') then
    raise exception 'FAIL: pH must remain non-linear';
  end if;
end
$$;

select 'BAL-Core unit catalogue normalization contract passed' as result;
