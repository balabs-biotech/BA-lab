import fs from "node:fs";
import assert from "node:assert/strict";

const html = fs.readFileSync("batch-tracker/workspace.html", "utf8");
const visuals = fs.readFileSync("batch-tracker/workspace-visuals.js", "utf8");
const styles = fs.readFileSync("batch-tracker/styles/workspace-components.css", "utf8");
const motion = fs.readFileSync("batch-tracker/styles/motion.css", "utf8");
const field = html.indexOf('id="ba-particle-field" class="workspace-particle-field"');
const toolbar = html.indexOf('class="app-toolbar"');
const hero = html.indexOf('class="app-hero"');
assert.ok(field >= 0 && field < toolbar, "Ambient particle field must live in the workspace shell before the toolbar");
assert.ok(field < hero, "Ambient particle field must not be confined to the introductory hero");
assert.ok(visuals.includes('particleLayer?.classList.contains("workspace-particle-field")'), "Visual runtime must initialize the global particle field");
assert.ok(visuals.includes("fpsLimit: 30"), "Ambient animation must remain capped for integrated graphics");
assert.ok(styles.includes(".workspace-particle-field"), "Global particle layer must have a dedicated visual surface");
assert.ok(styles.includes("backdrop-filter:blur(18px)"), "Workspace toolbar must use the glass navigation treatment");
assert.ok(motion.includes("radial-gradient(360px circle at var(--ba-pointer-x"), "OriginKit-inspired pointer light must be integrated into the shared surface system");
console.log("✓ CultureOps global visual shell and lightweight ambient runtime contract");
