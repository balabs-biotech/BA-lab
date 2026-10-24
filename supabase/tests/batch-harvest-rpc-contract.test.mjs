import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const tracker = readFileSync(path.join(root, "batch-tracker/tracker.js"), "utf8");
const migration = readFileSync(path.join(root, "supabase/migrations/20261025120000_add_atomic_batch_harvest_rpc.sql"), "utf8");

const start = tracker.indexOf("async function recordBatchHarvest()");
const end = tracker.indexOf("\nrecordHarvestButton?.addEventListener", start);
if (start < 0 || end < 0) throw new Error("Could not isolate recordBatchHarvest handler");
const handler = tracker.slice(start, end);
if (!handler.includes('rpc("record_batch_harvest"')) throw new Error("Harvest handler does not use the server RPC");
if (handler.includes('.from("events").insert(')) throw new Error("Harvest handler still inserts events directly");
if (!handler.includes("p_batch_id: selectedBatch.id") ||
    !handler.includes("p_quantity: quantity") ||
    !handler.includes("p_unit_code: unit.code") ||
    !handler.includes("p_note: note || null")) {
  throw new Error("Harvest RPC payload is incomplete");
}

for (const required of [
  "security definer",
  "auth.uid()",
  "private.is_org_member(v_batch.organization_id)",
  "for update",
  "v_batch.current_stage is distinct from 'harvest'",
  "v_batch.status is distinct from 'active'",
  "p_quantity <= 0",
  "p_quantity::text = 'NaN'",
  "unknown_unit_code",
  "biological_traceability_anchor_required",
  "actor_user_id",
  "'harvest_recorded'",
  "revoke all on function public.record_batch_harvest",
  "grant execute on function public.record_batch_harvest"
]) {
  if (!migration.toLowerCase().includes(required.toLowerCase())) {
    throw new Error("Harvest RPC missing security/validation contract: " + required);
  }
}
console.log("✓ Harvest recording uses server-validated RPC; direct client event insert is absent");
