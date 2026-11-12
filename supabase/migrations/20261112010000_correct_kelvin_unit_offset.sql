-- Kelvin is expressed relative to the Celsius base used by the canonical temperature variable.
-- The factor/offset convention is: base_value = value * factor + offset_value.
update public.units
   set offset_value = -273.15
 where code = 'K'
   and dimension = 'temperature'
   and factor = 1
   and offset_value = 0;
