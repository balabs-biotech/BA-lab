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
  if (block.includes('.from("events").insert(') || block.includes('.from("' + directTable + '").insert(')) {
    throw new Error(name + " handler still performs non-atomic direct inserts");
  }
  const sqlStart = migration.indexOf("create or replace function public." + rpc + "(");
  const sqlEnd = migration.indexOf("$;", migration.indexOf("as $", sqlStart) + 5);
  const sqlFunction = migration.slice(sqlStart, sqlEnd);
  if (!sqlFunction.includes("create or replace function public." + rpc + "(") ||
      !sqlFunction.includes("Event culture does not match batch culture") ||
      !sqlFunction.includes("Batch needs a culture or material anchor for traceability") ||
      !sqlFunction.includes("Batch not found in organization") ||
      !sqlFunction.includes("insert into public.events") ||
      !sqlFunction.includes("insert into public." + directTable) ||
      !sqlFunction.includes("grant execute on function public." + rpc + "(jsonb, jsonb) to authenticated") && 
      !migration.includes("grant execute on function public." + rpc + "(jsonb, jsonb) to authenticated") ||
      !sqlFunction.includes("auth.uid(),") ||
      !sqlFunction.includes("v_batch_location_id") ||
      !sqlFunction.includes("Event and " + name + " targets must match") ||
      (name === "measurement" && (!sqlFunction.includes("Event and measurement environments must match") ||
        !sqlFunction.includes("nullif(p_measurement->>'environment_id', '')::uuid, v_batch_environment_id")))) {
    throw new Error(name + " RPC migration is incomplete or misses actor/target/batch integrity checks");
  }
}
console.log("✓ Manual measurement and observation writes use atomic RPCs; client-side split inserts are absent");
