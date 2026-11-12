import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL("../migrations/20261112190000_create_environmental_ingestion_jobs.sql", import.meta.url),
  "utf8",
);
const gateway = await readFile(
  new URL("../functions/earth-search-sentinel2-run/index.ts", import.meta.url),
  "utf8",
);

assert.match(migration, /CREATE TABLE public\.environmental_ingestion_jobs/);
assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
assert.match(migration, /TO authenticated[\s\S]*?organization_members/);
assert.match(migration, /GRANT SELECT ON public\.environmental_ingestion_jobs TO authenticated/);
assert.match(migration, /REVOKE ALL ON public\.environmental_ingestion_jobs FROM PUBLIC, anon, authenticated/);

assert.match(gateway, /SUPABASE_SERVICE_ROLE_KEY/);
assert.match(gateway, /from\("environmental_ingestion_jobs"\)[\s\S]*?\.insert\(/);
assert.match(gateway, /status: "processing"/);
assert.match(gateway, /status: finalStatus[\s\S]*?completed_at/);
assert.match(gateway, /scenes_selected/);
assert.match(gateway, /job_id:/);

console.log("Passed durable environmental ingestion job contract checks.");
