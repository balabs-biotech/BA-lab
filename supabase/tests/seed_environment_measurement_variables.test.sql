-- Regression test: environmental measurement variables use the shared catalogue.
\set ON_ERROR_STOP on
CREATE TABLE public.units (
  code text PRIMARY KEY,
  label text NOT NULL,
  dimension text NOT NULL,
  factor numeric,
  offset_value numeric NOT NULL DEFAULT 0,
  is_linear boolean NOT NULL DEFAULT true
);
CREATE TABLE public.variables (
  code text PRIMARY KEY,
  label text NOT NULL,
  dimension text NOT NULL,
  canonical_unit_code text REFERENCES public.units(code),
  description text
);
INSERT INTO public.units (code, label, dimension, factor, offset_value, is_linear)
VALUES ('%', 'percent', 'fraction', 1, 0, true);

\i supabase/migrations/20261022004302_seed_environment_measurement_variables.sql

DO $assertions$
BEGIN
  IF (SELECT count(*) FROM public.variables WHERE code IN (
    'electrical_conductivity', 'relative_humidity', 'co2_concentration',
    'illuminance', 'substrate_moisture'
  )) <> 5 THEN
    RAISE EXCEPTION 'FAIL: expected all five environmental measurement variables';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.variables v JOIN public.units u ON u.code=v.canonical_unit_code
    WHERE v.code='electrical_conductivity' AND u.code='mS/cm' AND v.dimension=u.dimension) THEN
    RAISE EXCEPTION 'FAIL: EC variable has no compatible canonical unit';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.variables v JOIN public.units u ON u.code=v.canonical_unit_code
    WHERE v.code='co2_concentration' AND u.code='ppm' AND v.dimension=u.dimension) THEN
    RAISE EXCEPTION 'FAIL: CO2 variable has no compatible canonical unit';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.variables v JOIN public.units u ON u.code=v.canonical_unit_code
    WHERE v.code='illuminance' AND u.code='lux' AND v.dimension=u.dimension) THEN
    RAISE EXCEPTION 'FAIL: illuminance variable has no compatible canonical unit';
  END IF;
END
$assertions$;

DROP TABLE public.variables;
DROP TABLE public.units;
