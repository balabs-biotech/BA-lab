import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync("batch-tracker/index.html", "utf8");
const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
  .filter((match) => !/\bsrc\s*=/.test(match[1]) && match[2].trim());

if (scripts.length === 0) {
  throw new Error("No inline JavaScript found in batch-tracker/index.html");
}

for (const [index, match] of scripts.entries()) {
  new vm.Script(match[2], { filename: `batch-tracker/index.html:inline-script-${index + 1}` });
}

console.log(`✓ Parsed ${scripts.length} inline JavaScript block(s) in batch-tracker/index.html`);
