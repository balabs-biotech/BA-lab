-- Organization provisioning is restricted to trusted backend/admin workflows.
-- claim-ba-labs reads the pre-seeded BA-LABS organization and only inserts membership.
-- The trusted service_role backend continues to bypass RLS.
DROP POLICY IF EXISTS organizations_insert ON public.organizations;
