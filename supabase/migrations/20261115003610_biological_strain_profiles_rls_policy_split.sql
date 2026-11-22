
drop policy if exists biological_strain_profiles_write on public.biological_strain_profiles;
create policy biological_strain_profiles_insert on public.biological_strain_profiles
for insert to authenticated
with check (private.is_org_writer(organization_id));
create policy biological_strain_profiles_update on public.biological_strain_profiles
for update to authenticated
using (private.is_org_writer(organization_id))
with check (private.is_org_writer(organization_id));
create policy biological_strain_profiles_delete on public.biological_strain_profiles
for delete to authenticated
using (private.is_org_writer(organization_id));
;
