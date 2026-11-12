-- Harden plant-culture client privileges and align writes with tenant roles.
-- Supabase default privileges can grant broad table ACLs to API roles;
-- RLS does not apply to TRUNCATE, REFERENCES, or TRIGGER privileges.
REVOKE ALL PRIVILEGES ON TABLE public.plant_cultures FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.plant_cultures TO authenticated;

DROP POLICY IF EXISTS plant_cultures_select ON public.plant_cultures;
CREATE POLICY plant_cultures_select ON public.plant_cultures
  FOR SELECT TO authenticated
  USING (private.is_org_member(organization_id));

DROP POLICY IF EXISTS plant_cultures_insert ON public.plant_cultures;
CREATE POLICY plant_cultures_insert ON public.plant_cultures
  FOR INSERT TO authenticated
  WITH CHECK (private.is_org_writer(organization_id));

DROP POLICY IF EXISTS plant_cultures_update ON public.plant_cultures;
CREATE POLICY plant_cultures_update ON public.plant_cultures
  FOR UPDATE TO authenticated
  USING (private.is_org_writer(organization_id))
  WITH CHECK (private.is_org_writer(organization_id));

DROP POLICY IF EXISTS plant_cultures_delete ON public.plant_cultures;
CREATE POLICY plant_cultures_delete ON public.plant_cultures
  FOR DELETE TO authenticated
  USING (private.is_org_writer(organization_id));
