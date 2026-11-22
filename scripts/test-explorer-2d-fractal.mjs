import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createFractalGrowthModel } from "../ecosystem/explorer-2d-fractal.js";

const catalogue = JSON.parse(await readFile(new URL("../ecosystem/notion-tree.fr.json", import.meta.url), "utf8"));
const candidates = [];
const walk = (items, depth = 0) => {
  for (const node of items || []) {
    const children = node.children || [];
    const count = n => (n.children || []).reduce((sum, child) => sum + Math.max(1, count(child)), 0);
    if (children.length && depth >= 1 && count(node) >= 8) candidates.push({ node, depth, count: count(node) });
    walk(children, depth + 1);
  }
};
walk(catalogue.domains);
const fixture = candidates.sort((a, b) => b.count - a.count)[0]?.node;
assert.ok(fixture, "French Notion catalogue must contain a real multi-generation branch");
const model = createFractalGrowthModel(fixture);
const repeat = createFractalGrowthModel(fixture);
const leafCount = node => (node.children || []).length
  ? node.children.reduce((sum, child) => sum + leafCount(child), 0)
  : 1;
assert.equal(model.branches.length, model.junctions.length - 1, "Every generated junction must be reached by one parent branch");
assert.equal(model.terminals.length, leafCount(fixture), "Every real Notion leaf must become one natural terminal");
assert.equal(model.stats.reservedBeforeDrawing, true);
assert.ok(model.stats.maxDepth >= 2, "Fixture must include at least two generations");
assert.deepEqual(model, repeat, "Geometry must be deterministic across redraws");
for (const branch of model.branches) {
  for (const p of [branch.start, branch.control1, branch.control2, branch.end]) {
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), "Bezier coordinates must be finite");
  }
  assert.ok(branch.reservedSector[1] > branch.reservedSector[0], "Every daughter branch must own a non-empty reserved sector");
}
const byParent = new Map();
for (const branch of model.branches) {
  if (!byParent.has(branch.parentId)) byParent.set(branch.parentId, []);
  byParent.get(branch.parentId).push(branch);
}
for (const siblings of byParent.values()) {
  const ordered = siblings.slice().sort((a, b) => a.reservedSector[0] - b.reservedSector[0]);
  for (let i = 1; i < ordered.length; i++) {
    assert.ok(Math.abs(ordered[i - 1].reservedSector[1] - ordered[i].reservedSector[0]) < 1e-8,
      "Sibling sectors must be allocated contiguously before geometry is drawn");
  }
}
console.log(JSON.stringify({fixture: fixture.title, ...model.stats, siblingFansReserved: byParent.size}, null, 2));
