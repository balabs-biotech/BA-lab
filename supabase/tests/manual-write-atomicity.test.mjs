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
  if (!migration.includes("create or replace function public." + rpc + "(") ||
      !migration.includes("Event culture does not match batch culture") ||
      !migration.includes("Batch needs a culture or material anchor for traceability") ||
      !migration.includes("insert into public.events") ||
      !migration.includes("insert into public." + directTable) ||
      !migration.includes("grant execute on function public." + rpc + "(jsonb, jsonb) to authenticated") ||
      !migration.includes("auth.uid(),") ||
      !migration.includes("Event and " + name + " target" + (name === "measurement" ? "s" : "s") + " must match")) {
    throw new Error(name + " RPC migration is incomplete or misses actor/target integrity checks");
  }
}
console.log("✓ Manual measurement and observation writes use atomic RPCs; client-side split inserts are absent");
