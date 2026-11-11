-- BA Labs Biological Rule Store v1
-- Tenant-scoped, versioned scientific rules. Reviewed versions are immutable.
create table public.biological_rules (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  revision_seq bigint generated always as identity unique,
  rule_id text not null check (length(btrim(rule_id)) > 0),
  version text not null check (length(btrim(version)) > 0),
  status text not null check (status in ('draft','reviewed','retired')),
  domain text not null check (length(btrim(domain)) > 0),
  variable_code text not null references public.variables(code),
  unit_code text not null references public.units(code),
  target jsonb not null check (jsonb_typeof(target) = 'object'),
  rule jsonb not null check (jsonb_typeof(rule) = 'object'),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  primary key (organization_id,id),
  unique (organization_id,rule_id,version),
  check (rule->>'rule_id' = rule_id),
  check (rule->>'version' = version),
  check (rule->>'status' = status),
  check (rule->>'domain' = domain),
  check (rule->>'variable_code' = variable_code),
  check (rule->>'unit_code' = unit_code),
  check (rule->'target' = target),
  check (
    (jsonb_typeof(target->'taxon_code') = 'string' and length(btrim(target->>'taxon_code')) > 0)
    or
    (jsonb_typeof(target->'strain_code') = 'string' and length(btrim(target->>'strain_code')) > 0)
  ),
  check (
    case when jsonb_typeof(rule->'min') = 'number' and jsonb_typeof(rule->'max') = 'number'
      then (rule->>'min')::numeric <= (rule->>'max')::numeric
      else false
    end
  ),
  check (case when jsonb_typeof(rule->'sources') = 'array' then jsonb_array_length(rule->'sources') > 0 else false end),
  check (
    case when status = 'reviewed'
      then reviewed_by is not null and reviewed_at is not null
        and length(btrim(coalesce(rule->'review'->>'reviewer_id',''))) > 0
        and length(btrim(coalesce(rule->'review'->>'reviewed_at',''))) > 0
      else reviewed_by is null and reviewed_at is null
    end
  )
);

create index biological_rules_lookup_idx
  on public.biological_rules (organization_id,domain,variable_code,unit_code,status,created_at desc);

alter table public.biological_rules enable row level security;
create policy biological_rules_select
  on public.biological_rules for select to authenticated
  using (private.is_org_member(organization_id));
create policy biological_rules_insert
  on public.biological_rules for insert to authenticated
  with check (private.is_org_admin(organization_id) and created_by = auth.uid());
create policy biological_rules_update
  on public.biological_rules for update to authenticated
  using (private.is_org_admin(organization_id))
  with check (private.is_org_admin(organization_id));
create policy biological_rules_delete
  on public.biological_rules for delete to authenticated
  using (private.is_org_admin(organization_id));

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
           and prior.status = 'reviewed'
           and prior.domain = new.domain
           and prior.variable_code = new.variable_code
           and prior.unit_code = new.unit_code
           and prior.target = new.target
           and prior.rule->'min' = new.rule->'min'
           and prior.rule->'max' = new.rule->'max'
           and prior.rule->'sources' = new.rule->'sources'
      ) then
        raise exception 'biological_rule_retirement_requires_prior_reviewed_version' using errcode = '23514';
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

revoke all on function private.guard_biological_rule_version() from public;
create trigger biological_rules_version_guard
  before insert or update or delete on public.biological_rules
  for each row execute function private.guard_biological_rule_version();

grant select, insert, update, delete on public.biological_rules to authenticated;
