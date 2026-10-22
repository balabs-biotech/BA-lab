-- The tracker uses these views only for SELECT reference/creation options.
-- Remove unnecessary write privileges from the API-facing views.
REVOKE ALL PRIVILEGES ON TABLE public.v_culture_creation_options FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.v_culture_creation_options FROM authenticated;

REVOKE ALL PRIVILEGES ON TABLE public.v_culture_creation_reference FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.v_culture_creation_reference FROM authenticated;
