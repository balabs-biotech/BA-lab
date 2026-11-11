-- Persist recommendation definitions as part of the immutable, versioned
-- domain interpretation profile. Python DomainProfile already exposes this
-- contract; without this column, recommendations disappear at the DB boundary.

alter table public.domain_interpretation_profiles
  add column if not exists recommendations jsonb not null default '[]'::jsonb;

alter table public.domain_interpretation_profiles
  add constraint domain_interpretation_profiles_recommendations_array_check
  check (jsonb_typeof(recommendations) = 'array');

create or replace function private.validate_domain_profile_recommendations()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_definition jsonb;
begin
  if jsonb_typeof(new.recommendations) <> 'array' then
    raise exception 'domain_profile_recommendations_must_be_a_json_array'
      using errcode = '23514';
  end if;

  for v_definition in
    select value from jsonb_array_elements(new.recommendations)
  loop
    if not (v_definition ?& array[
      'recommendation_code',
      'instruction_code',
      'rationale_code',
      'applicable_signal_codes',
      'allowed_finding_statuses',
      'required_context_tags',
      'contraindicated_context_tags'
    ])
       or jsonb_typeof(v_definition->'recommendation_code') <> 'string'
       or length(btrim(v_definition->>'recommendation_code')) not between 1 and 120
       or jsonb_typeof(v_definition->'instruction_code') <> 'string'
       or length(btrim(v_definition->>'instruction_code')) not between 1 and 120
       or jsonb_typeof(v_definition->'rationale_code') <> 'string'
       or length(btrim(v_definition->>'rationale_code')) not between 1 and 120
       or jsonb_typeof(v_definition->'applicable_signal_codes') <> 'array'
       or jsonb_array_length(v_definition->'applicable_signal_codes') = 0
       or jsonb_path_exists(v_definition->'applicable_signal_codes', '$[*] ? (@.type() != "string")')
       or jsonb_path_exists(v_definition->'applicable_signal_codes', '$[*] ? (@ == "")')
       or jsonb_typeof(v_definition->'allowed_finding_statuses') <> 'array'
       or jsonb_path_exists(v_definition->'allowed_finding_statuses', '$[*] ? (@.type() != "string")')
       or jsonb_path_exists(
         v_definition->'allowed_finding_statuses',
         '$[*] ? (@ != "normal" && @ != "suspect" && @ != "insufficient_history" && @ != "insufficient_coverage" && @ != "indeterminate")'
       )
       or jsonb_typeof(v_definition->'required_context_tags') <> 'array'
       or jsonb_path_exists(v_definition->'required_context_tags', '$[*] ? (@.type() != "string")')
       or jsonb_typeof(v_definition->'contraindicated_context_tags') <> 'array'
       or jsonb_path_exists(v_definition->'contraindicated_context_tags', '$[*] ? (@.type() != "string")') then
      raise exception 'domain_profile_recommendation_does_not_match_engine_contract'
        using errcode = '23514';
    end if;
  end loop;

  if exists (
    select 1
      from jsonb_array_elements(new.recommendations) as definition(value)
     group by definition.value->>'recommendation_code'
    having count(*) > 1
  ) then
    raise exception 'domain_profile_recommendation_codes_must_be_unique'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_domain_profile_recommendations()
  from public, anon, authenticated;

drop trigger if exists domain_interpretation_profiles_recommendations_validate
  on public.domain_interpretation_profiles;

create trigger domain_interpretation_profiles_recommendations_validate
  before insert or update of recommendations
  on public.domain_interpretation_profiles
  for each row execute function private.validate_domain_profile_recommendations();

comment on column public.domain_interpretation_profiles.recommendations is
  'Versioned, explicit recommendation definitions consumed by the Python interpretation engine. Definitions are validated and become immutable with the activated profile.';
