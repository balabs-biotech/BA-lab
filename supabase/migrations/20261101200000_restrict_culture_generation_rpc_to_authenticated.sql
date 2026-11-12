-- The culture-generation RPC performs its own membership and consent checks.
-- It is invoker-rights, so anonymous execution is unnecessary; keep it available
-- only to authenticated clients and the trusted service role.
REVOKE EXECUTE ON FUNCTION public.create_culture_with_generation(
  uuid, text, text, uuid, uuid, uuid, uuid, uuid, uuid, timestamptz, jsonb
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_culture_with_generation(
  uuid, text, text, uuid, uuid, uuid, uuid, uuid, uuid, timestamptz, jsonb
) TO authenticated, service_role;
