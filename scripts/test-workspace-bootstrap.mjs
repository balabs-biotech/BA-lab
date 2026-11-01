import assert from "node:assert/strict";
import fs from "node:fs";

const entryPages = [
  ["mycology", "batch-tracker/mycology/index.html"],
  ["agronomy", "batch-tracker/green-tech/index.html"],
  ["laboratory", "batch-tracker/laboratory/index.html"],
];

for (const [domain, path] of entryPages) {
  const html = fs.readFileSync(path, "utf8");
  assert.match(html, new RegExp(`<body[^>]*data-domain=["']${domain}["']`, "i"),
    `${domain} must declare its workspace domain on body`);
  assert.match(html, /workspace-bootstrap\.js/,
    `${domain} must delegate startup to the shared workspace bootstrap`);
  assert.doesNotMatch(html, /fetch\(["']\.\.\/workspace\.html/,
    `${domain} must not keep a private workspace-loading sequence`);
  assert.doesNotMatch(html, /createElement\(["']script["']\)/,
    `${domain} must not inject its own startup scripts`);
}

console.log("✓ All three CultureOps entry pages delegate startup to the shared bootstrap");
console.log("✓ Workspace identity remains declared per entry page");
