import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const adapter = readFileSync(new URL("../batch-tracker/workspace-origin-components.js", import.meta.url), "utf8");
const entryPages = ["green-tech", "mycology", "laboratory"].map((sector) =>
  readFileSync(new URL(`../batch-tracker/${sector}/index.html`, import.meta.url), "utf8")
);

assert.match(adapter, /Kinetic Grid by Vellum AI/);
assert.match(adapter, /mountRisingLines/);
assert.match(adapter, /mountParticleSphere/);
assert.match(adapter, /mountParticleSphereFallback/);
assert.match(adapter, /ba-originkit-rising-lines/);
assert.match(adapter, /ba-originkit-particle-sphere/);
assert.match(adapter, /three@0\.174\.0/);
assert.match(adapter, /vellum-ai\/motion-design/);
assert.match(adapter, /prefers-reduced-motion/);
assert.match(adapter, /ResizeObserver/);
assert.match(adapter, /IntersectionObserver/);
assert.match(adapter, /requestAnimationFrame/);
assert.match(adapter, /pointermove/);
assert.doesNotMatch(adapter, /from\s+["']react["']/);
assert.doesNotMatch(adapter, /useIsStaticRenderer|RenderTarget/);

for (const page of entryPages) {
  assert.match(page, /workspace-origin-components\.js\?v=20261118-origin-components-4/);
  assert.match(page, /visualRuntime\.onload/);
}
console.log("OriginKit visual adapter contract passed.");
