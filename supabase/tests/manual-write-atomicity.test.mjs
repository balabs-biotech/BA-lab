import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const tracker = readFileSync(path.join(root, "batch-tracker/tracker.js"), "utf8");
const migration = readFileSync(path.join(root, "supabase/migrations/20261025110000_add_atomic_manual_measurement_observation_rpc.sql"), "utf8");

for (const [name, rpc, payloadKey, directTable] of [
  ["measurement", "record_manual_measurement", "p_measurement", "measurements"],
  ["observation", "record_manual_observation", "p_observation", "observations"]
]) {
  const fn = name === "measurement" ? "async function saveMeasurement()" : "async function saveObservation()";
  const start = tracker.indexOf(fn);
  const next = tracker.indexOf("\nasync function ", start + fn.length);
  if (start < 0 || next < 0) throw new Error("Could not isolate " + name + " save handler");
  const block = tracker.slice(start, next);
  if (!block.includes('rpc("' + rpc + '"')) throw new Error(name + " handler does not call atomic RPC");
  if (!block.includes(payloadKey + ":")) throw new Error(name + " RPC payload missing");
  if (!block.includes("p_idempotency_key:")) throw new Error(name + " RPC does not send a stable idempotency key");
  if (block.includes('.from("events").insert(') || block.includes('.from("' + directTable + '").insert(')) {
    throw new Error(name + " handler still performs non-atomic direct inserts");
  }
  const sqlStart = migration.indexOf("create or replace function public." + rpc + "(");
  const sqlEnd = migration.indexOf("$$;", migration.indexOf("as $$", sqlStart) + 5);
  const sqlFunction = migration.slice(sqlStart, sqlEnd);
  if (!sqlFunction.includes("create or replace function public." + rpc + "(") ||
      !sqlFunction.includes("Event culture does not match batch culture") ||
      !sqlFunction.includes("Batch needs a culture or material anchor for traceability") ||
      !sqlFunction.includes("Batch not found in organization") ||
      !sqlFunction.includes("insert into public.events") ||
      !sqlFunction.includes("insert into public." + directTable) ||
      !sqlFunction.includes("auth.uid(),") ||
      !sqlFunction.includes("v_batch_location_id") ||
      !sqlFunction.includes("Event and " + name + " targets must match") ||
      (name === "measurement" && (!sqlFunction.includes("Event and measurement environments must match") ||
        !sqlFunction.includes("nullif(p_measurement->>'environment_id', '')::uuid, v_batch_environment_id")))) {
    throw new Error(name + " RPC migration is incomplete or misses actor/target/batch integrity checks");
  }
}
console.log("✓ Manual measurement and observation writes use atomic RPCs; client-side split inserts are absent");

const idempotencyMigration = readFileSync(path.join(root, "supabase/migrations/20261109110000_add_manual_write_idempotency.sql"), "utf8");
for (const rpc of ["record_manual_measurement", "record_manual_observation"]) {
  const start = idempotencyMigration.indexOf("create or replace function public." + rpc + "(");
  const end = idempotencyMigration.indexOf("$$;", start);
  const sqlFunction = start >= 0 && end >= 0 ? idempotencyMigration.slice(start, end) : "";
  if (!sqlFunction.includes("p_idempotency_key uuid") ||
      !sqlFunction.includes("security definer") ||
      !sqlFunction.includes("set search_path = pg_catalog")) {
    throw new Error(rpc + " must be a pinned SECURITY DEFINER RPC with an explicit safe search_path and idempotency key");
  }
}
if (!idempotencyMigration.includes("private.operation_idempotency_receipts")) {
  throw new Error("Manual writes must reuse the private idempotency receipt ledger");
}
if (!idempotencyMigration.includes("idempotency_key_reused_with_different_payload")) {
  throw new Error("Manual writes must reject key reuse with a different payload");
}
console.log("✓ Manual measurement and observation RPCs preserve retry identity and private receipt isolation");

// A manual measurement linked to a culture must inherit that culture's exact
// experimental unit in both the measurement row and its traceability event.
const unitLineageMigration = readFileSync(path.join(root, "supabase/migrations/20261111130000_record_manual_measurement_experimental_unit.sql"), "utf8");
const unitRpcStart = unitLineageMigration.indexOf("create or replace function public.record_manual_measurement(");
const unitRpcEnd = unitLineageMigration.indexOf("$$;", unitRpcStart);
const unitRpc = unitRpcStart >= 0 && unitRpcEnd >= 0
  ? unitLineageMigration.slice(unitRpcStart, unitRpcEnd)
  : "";
for (const fragment of [
  "v_experimental_unit_id",
  "from public.cultures c",
  "c.experimental_unit_id",
  "from public.experimental_units eu",
  "eu.organization_id = v_org_id",
  "experimental_unit_id",
  "v_experimental_unit_id",
  "measurements",
  "events",
  "p_idempotency_key"
]) {
  if (!unitRpc.includes(fragment)) {
    throw new Error("Manual measurement experimental-unit lineage missing: " + fragment);
  }
}
if (!unitRpc.includes("culture_experimental_unit_mismatch") ||
    !unitRpc.includes("experimental_unit_not_found") ||
    !unitRpc.includes("'experimental_unit_id', v_experimental_unit_id")) {
  throw new Error("Manual measurement RPC must validate and persist consistent experimental-unit lineage");
}
if (!tracker.includes('select("id, variable_code, raw_value, raw_unit_code, normalized_value, normalized_unit_code, measured_at, method, instrument, culture_id, plant_culture_id, experimental_unit_id, event_id, metadata")')) {
  throw new Error("Measurement history must retrieve experimental_unit_id");
}
if (!tracker.includes('from("experimental_units")') ||
    !tracker.includes("row.experimental_unit_id")) {
  throw new Error("Measurement history must resolve and display its experimental-unit context");
}
console.log("✓ Manual measurements preserve experimental-unit lineage and expose it in the history");
