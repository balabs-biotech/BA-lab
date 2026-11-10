-- Explicit site elevation for FAO-56 atmospheric pressure calculations.
-- Null is allowed until the site altitude has been verified; the analysis gateway
-- refuses to invent an elevation when this value is missing.
ALTER TABLE public.locations
  ADD COLUMN altitude_m double precision;

ALTER TABLE public.locations
  ADD CONSTRAINT locations_altitude_range
  CHECK (altitude_m IS NULL OR altitude_m BETWEEN -500 AND 9000);

COMMENT ON COLUMN public.locations.altitude_m IS
  'Verified site elevation above mean sea level in metres; required for FAO-56 environmental analysis.';
