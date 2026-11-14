-- Bind each activated interpretation-profile version to an immutable content digest.
-- Existing activated rows are preserved; profiles activated after this migration require a digest.

alter table public.domain_interpretation_profiles
  add column if not exists content_sha256 text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.domain_interpretation_profiles'::regclass
      and conname = 'domain_interpretation_profiles_content_sha256_format'
  ) then
    alter table public.domain_interpretation_profiles
      add constraint domain_interpretation_profiles_content_sha256_format
      check (content_sha256 is null or content_sha256 ~ '^[0-9a-f]{64}$');
  end if;
end
$$;

create or replace function private.guard_domain_interpretation_profile_digest()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
begin
  if new.status in ('active', 'retired')
     and (tg_op = 'INSERT' or old.status = 'draft')
     and new.content_sha256 is null then
    raise exception 'activating an interpretation profile requires a content SHA-256 digest'
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE'
     and old.status = 'draft'
     and (
       new.domain,
       new.profile_code,
       new.profile_version,
       new.rules
     ) is distinct from (
       old.domain,
       old.profile_code,
       old.profile_version,
       old.rules
     )
     and new.content_sha256 is not distinct from old.content_sha256 then
    raise exception 'changing draft interpretation profile content requires a new content SHA-256 digest'
      using errcode = '23514';
  end if;

  return new;
end;
$function$;

revoke all on function private.guard_domain_interpretation_profile_digest() from public, anon, authenticated;

drop trigger if exists domain_interpretation_profiles_digest_guard on public.domain_interpretation_profiles;
create trigger domain_interpretation_profiles_digest_guard
  before insert or update of domain, profile_code, profile_version, rules, status, content_sha256
  on public.domain_interpretation_profiles
  for each row execute function private.guard_domain_interpretation_profile_digest();
