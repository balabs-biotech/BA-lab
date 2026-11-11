-- Tenant-scoped, versioned decision policies bound to exact reviewed biological rule versions.
create table public.biological_decision_policies (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  revision_seq bigint generated always as identity unique,
  policy_id text not null check (length(btrim(policy_id)) > 0),
  version text not null check (length(btrim(version)) > 0),
  status text not null check (status in ('draft','reviewed','retired')),
  domain text not null check (domain in ('mycology','laboratory')),
  rule_version_id uuid not null,
  trigger_assessment_statuses text[] not null default array['out_of_range']::text[],
  decision_code text not null check (length(btrim(decision_code)) > 0),
  title text not null check (length(btrim(title)) > 0),
  explanation text not null check (length(btrim(explanation)) > 0),
  severity text,
  recommended_action text,
  sources jsonb not null check (jsonb_typeof(sources) = 'array' and jsonb_array_length(sources) > 0),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  primary key (organization_id,id),
  unique (organization_id,policy_id,version),
  foreign key (organization_id,rule_version_id)
    references public.biological_rules(organization_id,id) on delete restrict,
  check (cardinality(trigger_assessment_statuses) = 1 and trigger_assessment_statuses <@ array['out_of_range']::text[]),
  check (
    (status = 'reviewed' and reviewed_by is not null and reviewed_at is not null)
    or (status <> 'reviewed' and reviewed_by is null and reviewed_at is null)
  )
);

create index biological_decision_policies_lookup_idx
  on public.biological_decision_policies
  (organization_id,domain,rule_version_id,status,revision_seq desc);

alter table public.biological_decision_policies enable row level security;
create policy biological_decision_policies_select
  on public.biological_decision_policies for select to authenticated
  using (private.is_org_member(organization_id));
create policy biological_decision_policies_insert
  on public.biological_decision_policies for insert to authenticated
  with check (private.is_org_admin(organization_id) and created_by = auth.uid());
create policy biological_decision_policies_update
  on public.biological_decision_policies for update to authenticated
  using (private.is_org_admin(organization_id))
  with check (private.is_org_admin(organization_id));
create policy biological_decision_policies_delete
  on public.biological_decision_policies for delete to authenticated
  using (private.is_org_admin(organization_id));

create or replace function private.guard_biological_decision_policy_version()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, private, auth
as $function$
declare
  v_rule public.biological_rules%rowtype;
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'biological_decision_policy_version_immutable' using errcode = '55000';
    end if;
    return old;
  end if;

  if jsonb_typeof(new.sources) is distinct from 'array' then
    raise exception 'biological_decision_policy_source_evidence_invalid' using errcode = '23514';
  end if;
  if jsonb_array_length(new.sources) = 0 or exists (
    select 1 from jsonb_array_elements(new.sources) as source(value)
     where jsonb_typeof(source.value) is distinct from 'object'
        or nullif(btrim(source.value->>'type'),'') is null
        or nullif(btrim(source.value->>'citation'),'') is null
  ) then
    raise exception 'biological_decision_policy_source_evidence_invalid' using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    if new.status = 'reviewed' then
      raise exception 'biological_decision_policy_review_must_be_explicit_transition' using errcode = '42501';
    elsif new.status = 'retired' then
      if not exists (
        select 1 from public.biological_decision_policies prior
         where prior.organization_id = new.organization_id
           and prior.policy_id = new.policy_id
           and prior.status = 'reviewed'
           and prior.revision_seq = (
             select max(latest.revision_seq) from public.biological_decision_policies latest
              where latest.organization_id = new.organization_id
                and latest.policy_id = new.policy_id and latest.status = 'reviewed'
           )
           and prior.domain = new.domain
           and prior.rule_version_id = new.rule_version_id
           and prior.trigger_assessment_statuses = new.trigger_assessment_statuses
           and prior.decision_code = new.decision_code
           and prior.title = new.title
           and prior.explanation = new.explanation
           and prior.severity is not distinct from new.severity
           and prior.recommended_action is not distinct from new.recommended_action
           and prior.sources = new.sources
      ) then
        raise exception 'biological_decision_policy_retirement_requires_latest_reviewed_version' using errcode = '23514';
      end if;
    elsif new.status <> 'draft' then
      raise exception 'biological_decision_policy_invalid_initial_status' using errcode = '23514';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if new.status = 'retired' then
      raise exception 'biological_decision_policy_retirement_requires_new_version' using errcode = '55000';
    end if;
    if old.status <> 'draft' then
      raise exception 'biological_decision_policy_version_immutable' using errcode = '55000';
    end if;
    if new.organization_id is distinct from old.organization_id
       or new.id is distinct from old.id
       or new.policy_id is distinct from old.policy_id
       or new.version is distinct from old.version
       or new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at then
      raise exception 'biological_decision_policy_identity_immutable' using errcode = '55000';
    end if;
  end if;

  if new.status <> 'retired' then
    select * into v_rule from public.biological_rules
     where organization_id = new.organization_id and id = new.rule_version_id
     for share;
    if not found or v_rule.status <> 'reviewed' or v_rule.domain is distinct from new.domain
       or exists (
         select 1 from public.biological_rules newer
          where newer.organization_id = new.organization_id
            and newer.rule_id = v_rule.rule_id
            and newer.revision_seq > v_rule.revision_seq
            and newer.status in ('reviewed','retired')
       ) then
      raise exception 'biological_decision_policy_requires_current_reviewed_rule' using errcode = '23514';
    end if;
  end if;

  if new.status = 'reviewed' then
    if auth.uid() is null then
      raise exception 'biological_decision_policy_reviewer_required' using errcode = '42501';
    end if;
    if exists (
      select 1 from public.biological_decision_policies newer
       where newer.organization_id = new.organization_id
         and newer.policy_id = new.policy_id
         and newer.revision_seq > old.revision_seq
    ) then
      raise exception 'biological_decision_policy_stale_draft_cannot_be_reviewed' using errcode = '40001';
    end if;
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
  else
    new.reviewed_by := null;
    new.reviewed_at := null;
  end if;

  if tg_op = 'INSERT' and new.status = 'retired' then
    if exists (
      select 1 from public.biological_decision_policies newer
       where newer.organization_id = new.organization_id
         and newer.policy_id = new.policy_id
         and newer.revision_seq > (
           select max(prior.revision_seq) from public.biological_decision_policies prior
            where prior.organization_id = new.organization_id
              and prior.policy_id = new.policy_id and prior.status = 'reviewed'
         )
         and newer.status in ('reviewed','retired')
    ) then
      raise exception 'biological_decision_policy_stale_retirement_blocked' using errcode = '40001';
    end if;
  end if;
  return new;
end;
$function$;

revoke all on function private.guard_biological_decision_policy_version() from public;
create trigger biological_decision_policies_version_guard
  before insert or update or delete on public.biological_decision_policies
  for each row execute function private.guard_biological_decision_policy_version();

revoke all on public.biological_decision_policies from public, anon, authenticated;
grant select, insert, update, delete on public.biological_decision_policies to authenticated;
