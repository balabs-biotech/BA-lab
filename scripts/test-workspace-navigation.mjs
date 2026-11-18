import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const navigation = readFileSync(new URL("../batch-tracker/workspace-navigation.js", import.meta.url), "utf8");
const entryPages = [
  "green-tech",
  "mycology",
  "laboratory"
].map((sector) => readFileSync(new URL(`../batch-tracker/${sector}/index.html`, import.meta.url), "utf8"));

assert.match(navigation, /ba-module-rail/);
assert.match(navigation, /data-direction="left"/);
assert.match(navigation, /data-direction="right"/);
assert.match(navigation, /data-direction="up"/);
assert.match(navigation, /data-direction="down"/);
assert.match(navigation, /event\.altKey/);
assert.match(navigation, /ArrowLeft.*ArrowRight.*ArrowUp.*ArrowDown/s);
assert.match(navigation, /prefers-reduced-motion/);
assert.match(navigation, /pointerdown/);
assert.match(navigation, /pointerup/);
assert.match(navigation, /Math\.abs\(dy\)/);
assert.match(navigation, /aria-current/);
assert.match(navigation, /workspace-authenticated/);
assert.doesNotMatch(navigation, /supabase\.from\(|\.insert\(|\.update\(/);

for (const page of entryPages) {
  assert.match(page, /workspace-navigation\.js\?v=20261118-spatial-rail-2/);
}
console.log("CultureOps spatial module navigation contract passed.");
