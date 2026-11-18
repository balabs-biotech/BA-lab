import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const navigation = readFileSync(new URL("../batch-tracker/workspace-navigation.js", import.meta.url), "utf8");
const entryPages = [
  "green-tech",
  "mycology",
  "laboratory"
].map((sector) => readFileSync(new URL(`../batch-tracker/${sector}/index.html`, import.meta.url), "utf8"));

assert.match(navigation, /ba-module-rail/);
assert.match(navigation, /data-direction="-1"/);
assert.match(navigation, /data-direction="1"/);
assert.match(navigation, /Alt\+ArrowLeft/);
assert.match(navigation, /Alt\+ArrowRight/);
assert.match(navigation, /prefers-reduced-motion/);
assert.match(navigation, /pointerdown/);
assert.match(navigation, /pointerup/);
assert.match(navigation, /aria-current/);
assert.match(navigation, /workspace-authenticated/);
assert.doesNotMatch(navigation, /supabase\.from\(|\.insert\(|\.update\(/);

for (const page of entryPages) {
  assert.match(page, /workspace-navigation\.js\?v=20261118-spatial-rail-1/);
}
console.log("CultureOps spatial module navigation contract passed.");
