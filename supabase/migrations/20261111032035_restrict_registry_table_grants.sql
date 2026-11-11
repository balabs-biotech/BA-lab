-- Supabase projects may have permissive default table grants.
-- Keep authenticated access limited to row-scoped CRUD; RLS governs each operation.
revoke all on table
  public.biological_contexts,
  public.environment_context_profiles,
  public.environment_context_profile_sensors,
  public.domain_interpretation_profiles
from authenticated;

grant select, insert, update, delete on table
  public.biological_contexts,
  public.environment_context_profiles,
  public.environment_context_profile_sensors,
  public.domain_interpretation_profiles
to authenticated;
