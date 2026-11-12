import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = [
  "../functions/nasa-power-agroclimate/index.ts",
  "../functions/nasa-power-scheduled-import/index.ts",
];
for (const path of paths) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  assert.match(
    source,
    /rpc\([\s\S]*?upsert_weather_environmental_observations/,
    path + " must use the partial-index-aware weather RPC",
  );
  assert.doesNotMatch(
    source,
    /from\("environmental_observations"\)[\s\S]*?\.upsert\(/,
    path + " must not use generic PostgREST upsert against a partial index",
  );
}
console.log("Passed NASA POWER partial-index persistence contract checks.");
