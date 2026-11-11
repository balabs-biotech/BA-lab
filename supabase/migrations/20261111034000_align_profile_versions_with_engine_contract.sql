-- Align persisted profile version columns with the engine's version contract.
-- The Python domain models and existing persistence tests use semantic version
-- strings (for example, "1.2.0"), not integer sequence numbers.

alter table public.environment_context_profiles
  drop constraint if exists environment_context_profiles_profile_version_check;

alter table public.domain_interpretation_profiles
  drop constraint if exists domain_interpretation_profiles_profile_version_check;

alter table public.environment_context_profiles
  alter column profile_version type text using profile_version::text;

alter table public.domain_interpretation_profiles
  alter column profile_version type text using profile_version::text;

alter table public.environment_context_profiles
  add constraint environment_context_profiles_profile_version_valid
  check (length(profile_version) between 1 and 32);

alter table public.domain_interpretation_profiles
  add constraint domain_interpretation_profiles_profile_version_valid
  check (length(profile_version) between 1 and 32);
