-- The profile registries are not public API resources.
-- RLS remains enabled; remove anonymous table-level privileges as defense in depth.

revoke all on table
  public.biological_contexts,
  public.environment_context_profiles,
  public.environment_context_profile_sensors,
  public.domain_interpretation_profiles
from anon;
