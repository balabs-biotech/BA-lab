import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const panel = await readFile(new URL("../batch-tracker/environmental-jobs-panel.js", import.meta.url), "utf8");
const entry = await readFile(new URL("../batch-tracker/green-tech/index.html", import.meta.url), "utf8");

test("Sentinel-2 history panel is isolated to Green Tech", () => {
  assert.match(panel, /document\.body\.dataset\.domain !== "agronomy"/);
  assert.match(entry, /environmental-jobs-panel\.js/);
});

test("job history reads are tenant-scoped and read-only", () => {
  assert.match(panel, /from\("environmental_ingestion_jobs"\)/);
  assert.match(panel, /\.eq\("organization_id", organizationId\)/);
  assert.match(panel, /\.eq\("job_type", "sentinel2_scene_ingestion"\)/);
  assert.doesNotMatch(panel, /\.insert\(|\.update\(|\.delete\(/);
});

test("rendering uses text nodes for database-provided values", () => {
  assert.match(panel, /textContent = text/);
  assert.doesNotMatch(panel, /innerHTML/);
});
