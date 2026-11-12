import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(new URL("../migrations/20261112210000_add_environmental_ingestion_job_leases.sql", import.meta.url), "utf8");

test("queue claims are atomic and bounded by leases", () => {
  assert.match(sql, /FOR UPDATE SKIP LOCKED/);
  assert.match(sql, /p_lease_seconds < 30 OR p_lease_seconds > 900/);
  assert.match(sql, /lease_expires_at = now\(\) \+ make_interval/);
  assert.match(sql, /attempt_count = job\.attempt_count \+ 1/);
});

test("stale workers cannot heartbeat or finalize reclaimed jobs", () => {
  assert.match(sql, /lease_token = p_lease_token/);
  assert.match(sql, /lease_expires_at > now\(\)/);
  assert.match(sql, /heartbeat_environmental_ingestion_job/);
  assert.match(sql, /complete_environmental_ingestion_job/);
});

test("worker RPCs are service-role-only", () => {
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.claim_environmental_ingestion_job/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.heartbeat_environmental_ingestion_job/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.complete_environmental_ingestion_job/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.claim_environmental_ingestion_job\(text, integer\) TO service_role/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.reconcile_stale_environmental_ingestion_jobs\(\) TO service_role/);
});

test("attempt exhaustion is reconciled to a terminal failed state", () => {
  assert.match(sql, /attempt_count >= max_attempts/);
  assert.match(sql, /lease_expired_attempts_exhausted/);
  assert.match(sql, /completed_at = now\(\)/);
});
