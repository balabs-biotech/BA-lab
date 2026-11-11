-- Explicit site elevation for FAO-56 atmospheric pressure calculations.
-- Null is allowed until the site altitude has been verified; the analysis gateway
-- refuses to invent an elevation when this value is missing.
alter table public.locations
  add column if not exists altitude_m double precision;

alter table public.locations
  drop constraint if exists locations_altitude_range;

alter table public.locations
  add constraint locations_altitude_range
  check (altitude_m is null or altitude_m between -500 and 9000);

comment on column public.locations.altitude_m is
  'Verified site elevation above mean sea level in metres; required for FAO-56 environmental analysis.';
