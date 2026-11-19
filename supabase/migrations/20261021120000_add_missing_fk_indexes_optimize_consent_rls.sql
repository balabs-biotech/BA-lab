-- Performance follow-up based on production Supabase advisors (2026-10-21).
-- Adds covering indexes for three foreign keys and avoids per-row auth.uid() calls
-- in consent RLS predicates. No data changes; policies preserve the existing access rules.
begin;

create index if not exists batch_qc_checks_unit_code_idx
  on public.batch_qc_checks (unit_code);

create index if not exists batch_qc_templates_default_unit_code_idx
  on public.batch_qc_templates (default_unit_code);

create index if not exists culture_data_consents_user_id_idx
  on public.culture_data_consents (user_id);

drop policy if exists culture_data_consents_select_own
  on public.culture_data_consents;
create policy culture_data_consents_select_own
  on public.culture_data_consents
  for select to authenticated
  using (
    user_id = (select auth.uid())
    and private.is_org_member(organization_id)
  );

drop policy if exists culture_data_consents_insert_own
  on public.culture_data_consents;
create policy culture_data_consents_insert_own
  on public.culture_data_consents
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and private.is_org_member(organization_id)
  );

drop policy if exists culture_data_consents_update_own
  on public.culture_data_consents;
create policy culture_data_consents_update_own
  on public.culture_data_consents
  for update to authenticated
  using (
    user_id = (select auth.uid())
    and private.is_org_member(organization_id)
  )
  with check (
    user_id = (select auth.uid())
    and private.is_org_member(organization_id)
  );

commit;
