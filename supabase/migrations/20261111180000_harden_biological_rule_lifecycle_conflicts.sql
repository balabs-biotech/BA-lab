-- Prevent stale draft publication and stale-version retirement races.
-- The revision sequence is assigned at insertion and remains stable for the immutable version.
create or replace function private.guard_biological_rule_version()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, private, auth
as $function$
declare
  v_variable_dimension text;
  v_unit_dimension text;
begin
  if tg_op = 'INSERT' then
    if new.status = 'reviewed' then
      raise exception 'biological_rule_review_must_be_explicit_transition' using errcode = '42501';
    elsif new.status = 'retired' then
      if not exists (
        select 1
          from public.biological_rules prior
         where prior.organization_id = new.organization_id
           and prior.rule_id = new.rule_id
           and prior.revision_seq = (
             select max(latest.revision_seq)
               from public.biological_rules latest
              where latest.organization_id = new.organization_id
                and latest.rule_id = new.rule_id
           )
           and prior.status = 'reviewed'
           and prior.domain = new.domain
           and prior.variable_code = new.variable_code
           and prior.unit_code = new.unit_code
           and prior.target = new.target
           and prior.rule->'min' = new.rule->'min'
           and prior.rule->'max' = new.rule->'max'
           and prior.rule->'sources' = new.rule->'sources'
      ) then
        raise exception 'biological_rule_retirement_requires_latest_reviewed_version' using errcode = '23514';
      end if;
    elsif new.status <> 'draft' then
      raise exception 'biological_rule_invalid_initial_status' using errcode = '23514';
    end if;
  end if;

  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'biological_rule_version_immutable' using errcode = '55000';
    end if;
    return old;
  end if;

  select v.dimension, u.dimension
    into v_variable_dimension, v_unit_dimension
    from public.variables v
    cross join public.units u
   where v.code = new.variable_code and u.code = new.unit_code;
  if not found or v_variable_dimension is distinct from v_unit_dimension then
    raise exception 'biological_rule_variable_unit_dimension_mismatch' using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' then
    if new.status = 'retired' then
      raise exception 'biological_rule_retirement_requires_new_version' using errcode = '55000';
    end if;
    if old.status <> 'draft' then
      raise exception 'biological_rule_version_immutable' using errcode = '55000';
    end if;
    if new.organization_id is distinct from old.organization_id
       or new.id is distinct from old.id
       or new.rule_id is distinct from old.rule_id
       or new.version is distinct from old.version
       or new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at then
      raise exception 'biological_rule_version_identity_immutable' using errcode = '55000';
    end if;
    if new.status = 'reviewed' and exists (
      select 1
        from public.biological_rules newer
       where newer.organization_id = old.organization_id
         and newer.rule_id = old.rule_id
         and newer.revision_seq > old.revision_seq
    ) then
      raise exception 'biological_rule_stale_draft_cannot_be_reviewed' using errcode = '40001';
    end if;
  end if;

  if new.status = 'reviewed' then
    if auth.uid() is null
       or new.rule->'review'->>'reviewer_id' is distinct from auth.uid()::text then
      raise exception 'biological_rule_reviewer_must_match_authenticated_user' using errcode = '42501';
    end if;
    begin
      new.reviewed_at := (new.rule->'review'->>'reviewed_at')::timestamptz;
    exception when others then
      raise exception 'biological_rule_review_timestamp_invalid' using errcode = '22007';
    end;
    new.reviewed_by := auth.uid();
  else
    new.reviewed_by := null;
    new.reviewed_at := null;
  end if;

  return new;
end;
$function$;
