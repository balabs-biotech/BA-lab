-- Extend the shared measurement catalogue for agronomic and controlled-environment work.
-- Existing generic measurements/units tables remain the canonical model.
INSERT INTO public.units (code, label, dimension, factor, offset_value, is_linear)
VALUES
  ('mS/cm', 'millisiemens per centimeter', 'electrical_conductivity', 1, 0, true),
  ('lux', 'lux', 'illuminance', 1, 0, true),
  ('ppm', 'parts per million', 'mole_fraction', 1, 0, true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.variables (code, label, dimension, canonical_unit_code, description)
VALUES
  ('electrical_conductivity', 'Electrical conductivity (EC)', 'electrical_conductivity', 'mS/cm', 'Electrical conductivity of water, nutrient solution, substrate extract, or leachate.'),
  ('relative_humidity', 'Relative humidity', 'fraction', '%', 'Relative humidity of the surrounding air.'),
  ('co2_concentration', 'CO2 concentration', 'mole_fraction', 'ppm', 'Carbon dioxide concentration in air.'),
  ('illuminance', 'Illuminance', 'illuminance', 'lux', 'Incident visible-light illuminance measured at the target plane.'),
  ('substrate_moisture', 'Substrate moisture', 'fraction', '%', 'Moisture reading reported as a percentage; method and instrument should be recorded.')
ON CONFLICT (code) DO NOTHING;
