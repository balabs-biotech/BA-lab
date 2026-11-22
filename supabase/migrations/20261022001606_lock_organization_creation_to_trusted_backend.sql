-- Organization provisioning is restricted to trusted backend/admin workflows.
-- The app's claim-ba-labs bootstrap reads the pre-seeded BA-LABS organization and only inserts membership.
-- service_role bypasses RLS and remains able to manage organizations.
DROP POLICY IF EXISTS organizations_insert ON public.organizations;
