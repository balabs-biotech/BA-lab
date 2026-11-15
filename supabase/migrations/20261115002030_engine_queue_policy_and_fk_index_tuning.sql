
drop policy if exists engine_jobs_insert on public.engine_jobs;
create policy engine_jobs_insert on public.engine_jobs
  for insert to authenticated
  with check (
    private.is_org_writer(organization_id)
    and status = 'queued'
    and attempts = 0
    and created_by = (select auth.uid())
  );

create index if not exists engine_jobs_created_by_idx
  on public.engine_jobs(created_by)
  where created_by is not null;
create index if not exists engine_jobs_parent_idx
  on public.engine_jobs(organization_id, parent_job_id)
  where parent_job_id is not null;
;
