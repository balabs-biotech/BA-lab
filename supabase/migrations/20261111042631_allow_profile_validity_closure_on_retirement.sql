-- Allow an activated profile's validity window to be closed exactly once on retirement.
-- Scientific/configuration fields remain immutable; a retired profile is never reactivated.

create or replace function private.guard_activated_profile_immutability()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.status in ('active', 'retired') then
    if old.status = 'active' and new.status = 'retired' then
      if (to_jsonb(new) - 'status' - 'valid_to')
         is distinct from
         (to_jsonb(old) - 'status' - 'valid_to') then
        raise exception 'activated profile scientific content is immutable';
      end if;

      if new.valid_to is null then
        raise exception 'retiring an activated profile requires a finite valid_to date';
      end if;

      if old.valid_to is not null and new.valid_to > old.valid_to then
        raise exception 'retirement may only shorten an activated profile validity window';
      end if;
    else
      if (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') then
        raise exception 'activated profile versions are immutable';
      end if;

      if old.status = 'retired' and new.status <> 'retired' then
        raise exception 'retired profile versions cannot be reactivated';
      end if;

      if old.status = 'active' and new.status not in ('active', 'retired') then
        raise exception 'active profile can only remain active or be retired';
      end if;
    end if;
  end if;

  return new;
end;
$$;
