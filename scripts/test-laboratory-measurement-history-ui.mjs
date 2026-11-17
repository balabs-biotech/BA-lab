import fs from "node:fs";
import assert from "node:assert/strict";

const styles = fs.readFileSync("batch-tracker/styles/workspace-components.css", "utf8");
assert.ok(styles.includes("#measurementHistory > .measurement-entry"), "Recent measurements must have a scoped history layout");
assert.ok(styles.includes(".measurement-entry .measurement-value"), "Measured values must be visually prioritized");
assert.ok(styles.includes(".measurement-entry .measurement-stamp"), "Measurement timestamps and reference codes must remain readable");
assert.ok(styles.includes("@media(max-width:620px)"), "Measurement history must have a compact mobile layout");
console.log("✓ Laboratory measurement history has a responsive, value-first visual contract");
