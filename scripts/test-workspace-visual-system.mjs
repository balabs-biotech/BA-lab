import fs from "node:fs";
import assert from "node:assert/strict";

const html = fs.readFileSync("batch-tracker/workspace.html", "utf8");
const visuals = fs.readFileSync("batch-tracker/workspace-visuals.js", "utf8");
const motion = fs.readFileSync("batch-tracker/styles/motion.css", "utf8");
const shared = fs.readFileSync("batch-tracker/styles/workspace-components.css", "utf8");

assert.ok(html.includes('class="app-hero"'), "Each sector must retain the shared workspace header");
assert.ok(!html.includes('id="ba-particle-field"'), "The obsolete global particle layer must be removed from the shared workspace markup");
assert.ok(!html.includes("visual-mycology"), "The obsolete branching mycelium hero SVG must not be shipped in the shared markup");
assert.ok(!visuals.includes("workspace-particle-field"), "The old generic global particle field must be removed");
assert.ok(visuals.includes('ba-sector-visual--mycology'), "Mycology must have a dedicated colony-growth scene");
assert.ok(visuals.includes('ba-sector-visual--greentech'), "GreenTech must have a dedicated leaf-growth scene");
assert.ok(visuals.includes('ba-sector-visual--laboratory'), "Laboratory must have a dedicated bioreactor scene");
assert.ok(!visuals.includes("links: { enable: true"), "Decorative sector particles must not form filament-like links");
assert.ok(visuals.includes("prefers-reduced-motion"), "The visual runtime must respect reduced motion");
assert.ok(visuals.includes("pauseOnOutsideViewport: true"), "Particle animation must pause outside the viewport");
assert.ok(motion.includes("ba-colony-ring"), "Mycology colony rings must animate independently");
assert.ok(motion.includes("ba-leaf-trace"), "GreenTech vein scan must animate independently");
assert.ok(motion.includes("ba-reactor-bubble"), "Laboratory reactor bubbles must animate independently");
assert.ok(motion.includes("workspace-authenticated .hero-art.ba-sector-art"), "Sector identity must remain visible in authenticated workspaces");
assert.ok(motion.includes("prefers-reduced-motion:reduce"), "CSS motion must include a reduced-motion fallback");
assert.ok(shared.includes("backdrop-filter:blur(18px)"), "Workspace toolbar must retain the glass navigation treatment");
assert.ok(motion.includes("radial-gradient(360px circle at var(--ba-pointer-x"), "OriginKit-inspired pointer light must remain integrated into the shared surface system");

console.log("✓ CultureOps sector-specific visual runtime contract");
