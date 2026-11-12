import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

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

const source = fs.readFileSync("batch-tracker/workspace-bootstrap.js", "utf8");
const trackerSource = fs.readFileSync("batch-tracker/tracker.js", "utf8");
const environmentalSource = fs.readFileSync("batch-tracker/environmental-data.js", "utf8");

assert.match(trackerSource, /window\.BA_LABS_SUPABASE_CLIENT\s*=\s*supabaseClient/,
  "the shared tracker must expose its authenticated Supabase client");
assert.match(environmentalSource, /const db\s*=\s*window\.BA_LABS_SUPABASE_CLIENT/,
  "Green Tech must reuse the shared authenticated Supabase client");
assert.doesNotMatch(environmentalSource, /supabase\.createClient\s*\(/,
  "Green Tech must not create an isolated Supabase client");

console.log("✓ Green Tech reuses the single authenticated Supabase client");

async function runWorkspace(domain, options = {}) {
  const events = [];
  const root = { innerHTML: "" };
  const body = {
    dataset: { domain },
    appendChild(script) {
      events.push(`script:${script.src}`);
      queueMicrotask(() => options.failScript === script.src
        ? script.onerror?.()
        : script.onload?.());
      return script;
    }
  };
  const document = {
    body,
    getElementById(id) { return id === "workspace-root" ? root : null; },
    createElement(tag) {
      assert.equal(tag, "script");
      return { src: "", onload: null, onerror: null, dataset: {} };
    }
  };
  const window = {
    supabase: options.noSupabase ? null : { createClient() {} },
    BA_LABS_DOMAIN: null
  };
  const fetch = async path => {
    events.push(`fetch:${path}`);
    if (options.failFetch) return { ok: false, text: async () => "" };
    return { ok: true, text: async () => "<main>workspace</main>" };
  };
  vm.runInNewContext(source, { window, document, fetch, console, queueMicrotask });
  const result = await window.BA_LABS_WORKSPACE_BOOTSTRAP.ready;
  const duplicateStartResult = await window.BA_LABS_WORKSPACE_BOOTSTRAP.start();
  assert.equal(duplicateStartResult, result);
  return { events, root, window, result };
}

for (const [domain, specialized] of [
  ["mycology", "smart-entry.js"],
  ["laboratory", "smart-entry.js"],
  ["agronomy", "environmental-data.js"],
]) {
  const run = await runWorkspace(domain);
  assert.equal(run.result, true, `${domain} startup should succeed`);
  assert.equal(run.window.BA_LABS_DOMAIN, domain);
  assert.match(run.root.innerHTML, /workspace/);
  const scriptEvents = run.events.filter(event => event.startsWith("script:"));
  assert.equal(scriptEvents.length, 3);
  assert.match(scriptEvents[0], /i18n\.js/);
  assert.equal(scriptEvents[1], "script:../tracker.js?v=20261101-auth-session-stability-1");
  assert.match(scriptEvents[2], new RegExp(specialized));
  if (domain === "agronomy") {
    assert.ok(!scriptEvents.some(event => /smart-entry\.js/.test(event)));
  } else {
    assert.ok(!scriptEvents.some(event => /environmental-data\.js/.test(event)));
  }
}

const missingSupabase = await runWorkspace("mycology", { noSupabase: true });
assert.equal(missingSupabase.result, false);
assert.match(missingSupabase.root.innerHTML, /role="alert"/);
assert.equal(missingSupabase.events.length, 0);

const missingWorkspace = await runWorkspace("laboratory", { failFetch: true });
assert.equal(missingWorkspace.result, false);
assert.match(missingWorkspace.root.innerHTML, /role="alert"/);
assert.equal(missingWorkspace.events.filter(event => event.startsWith("script:")).length, 0);

console.log("✓ All three CultureOps entry pages delegate startup to the shared bootstrap");
console.log("✓ Workspace identity and module isolation are preserved");
console.log("✓ Missing Supabase or workspace HTML produces a visible startup error");

const missingTracker = await runWorkspace("mycology", {
  failScript: "../tracker.js?v=20261101-auth-session-stability-1"
});
assert.equal(missingTracker.result, false);
assert.match(missingTracker.root.innerHTML, /role="alert"/);
assert.equal(missingTracker.events.filter(event => event.startsWith("script:")).length, 2);

const unknownDomain = await runWorkspace("unknown");
assert.equal(unknownDomain.result, false);
assert.match(unknownDomain.root.innerHTML, /Espace inconnu/);
assert.equal(unknownDomain.events.length, 0);

console.log("✓ Failed engine loads stop startup with visible feedback");
console.log("✓ Unknown domains are rejected before loading workspace scripts");

const missingTranslations = await runWorkspace("laboratory", {
  failScript: "../i18n.js?v=20261026-core-refresh-1"
});
assert.equal(missingTranslations.result, false);
assert.match(missingTranslations.root.innerHTML, /Traductions indisponibles/);
assert.equal(missingTranslations.events.filter(event => event.startsWith("script:")).length, 1);

const missingWorkspaceModule = await runWorkspace("agronomy", {
  failScript: "../environmental-data.js?v=20261027-sentinel-fallback-fix-1"
});
assert.equal(missingWorkspaceModule.result, false);
assert.match(missingWorkspaceModule.root.innerHTML, /Module de l’espace indisponible/);
assert.equal(missingWorkspaceModule.events.filter(event => event.startsWith("script:")).length, 3);

console.log("✓ Translation and workspace-specific module failures stop startup with explicit feedback");
