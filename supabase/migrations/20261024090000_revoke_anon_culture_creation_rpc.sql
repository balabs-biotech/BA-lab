-- Culture creation requires an authenticated organization member and accepted terms.
-- Do not expose this write-capable RPC to anon or PUBLIC; preserve authenticated/service_role grants.
DO $migration$
BEGIN
  IF to_regprocedure('public.create_culture_with_generation(uuid,text,text,uuid,uuid,uuid,uuid,uuid,uuid,timestamptz,jsonb)') IS NOT NULL THEN
    REVOKE ALL PRIVILEGES ON FUNCTION public.create_culture_with_generation(
      uuid, text, text, uuid, uuid, uuid, uuid, uuid, uuid, timestamptz, jsonb
    ) FROM anon, PUBLIC;
  END IF;
END
$migration$;
