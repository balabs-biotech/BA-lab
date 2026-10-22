import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync("batch-tracker/index.html", "utf8");
const rootHtml = fs.readFileSync("index.html", "utf8");
const scripts = [...html.matchAll(/<script\\b([^>]*)>([\\s\\S]*?)<\\/script>/gi)]
  .filter((match) => !/\\bsrc\\s*=/.test(match[1]) && match[2].trim());

if (scripts.length === 0) {
  throw new Error("No inline JavaScript found in batch-tracker/index.html");
}

for (const [index, match] of scripts.entries()) {
  new vm.Script(match[2], { filename: `batch-tracker/index.html:inline-script-${index + 1}` });
}

const supportedDomains = ["agronomy", "mycology", "laboratory"];
for (const domain of supportedDomains) {
  if (!rootHtml.includes(`href="batch-tracker/?domain=${domain}"`)) {
    throw new Error(`Universe chooser is missing the "${domain}" entry link`);
  }
}

const entryGuard = scripts.find((match) => match[2].includes("initialDomain"));
if (!entryGuard) {
  throw new Error("Direct tracker entry has no universe chooser guard");
}

function evaluateEntryGuard(search) {
  let redirectedTo = null;
  const context = {
    URLSearchParams,
    window: {
      location: {
        search,
        replace: (url) => { redirectedTo = url; },
      },
    },
  };
  vm.runInNewContext(entryGuard[2], context);
  return redirectedTo;
}

for (const domain of supportedDomains) {
  const result = evaluateEntryGuard(`?domain=${domain}`);
  if (result !== null) {
    throw new Error(`Valid universe "${domain}" unexpectedly redirects to ${result}`);
  }
}

for (const search of ["", "?domain=unknown", "?domain=", "?domain=mycology&domain=unknown"]) {
  const result = evaluateEntryGuard(search);
  if (result !== "../") {
    throw new Error(`Invalid entry "${search}" must redirect to ../; got ${String(result)}`);
  }
}

console.log(`✓ Parsed ${scripts.length} inline JavaScript block(s) in batch-tracker/index.html`);
console.log("✓ Universe chooser links and direct-entry redirect regression tests passed");
