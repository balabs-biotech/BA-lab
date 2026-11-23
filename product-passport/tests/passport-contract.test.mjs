import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../passport.js", import.meta.url), "utf8");

class Element {
  constructor() { this.hidden = false; this.textContent = ""; this.children = []; this.className = ""; }
  append(...items) { this.children.push(...items); }
  replaceChildren(...items) { this.children = items; }
  addEventListener(type, callback) { this.listeners ||= {}; this.listeners[type] = callback; }
  setAttribute(name, value) { this.attributes ||= {}; this.attributes[name] = value; }
  removeAttribute(name) { if (this.attributes) delete this.attributes[name]; }
}

async function render({ search = "", hash = "", passport = null } = {}) {
  const ids = [
    "loading", "missing", "error", "passport", "error-title", "error-copy",
    "product-name", "product-code", "product-category", "lot-code", "facts",
    "description-section", "product-description", "usage-section", "product-usage",
    "alerts-section", "alerts-list", "published-date", "manual-lookup", "passport-entry", "lookup-error"
  ];
  const elements = Object.fromEntries(ids.map(id => [id, new Element()]));
  const calls = [];
  const document = {
    getElementById: id => elements[id],
    createElement: () => new Element()
  };
  const window = {
    location: { search, hash, origin: "https://ba-labs-product-passport.pages.dev/" },
    setTimeout: () => 1,
    clearTimeout: () => {}
  };
  const fetch = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, json: async () => ({ passport }) };
  };

  vm.runInNewContext(source, {
    document, window, fetch, URL, URLSearchParams, AbortController, Intl, Date,
    encodeURIComponent
  });
  await new Promise(resolve => setTimeout(resolve, 0));
  return { elements, calls, window };
}

test("renders the actual published snapshot schema from the QR hash", async () => {
  const token = "A".repeat(43);
  const { elements, calls } = await render({
    hash: "#/p?token=" + token,
    passport: {
      schema_version: "1.0",
      passport_code: "BA-LOT-2026-001",
      product: {
        code: "BA-MYC-01",
        name: "Culture de Pleurote",
        category: "Mycologie",
        description: "Description publique",
        usage: "Conseil d'utilisation"
      },
      lot: { code: "BA-LOT-2026-001", manufactured_on: "2026-11-01", expires_on: "2026-12-01" },
      quality: { status: "released", reviewed_passing_checks: 2 },
      status: "released",
      published_at: "2026-11-20T10:00:00Z",
      alerts: [{ title: "Information", summary: "Avis public", published_at: "2026-11-21T10:00:00Z" }]
    }
  });

  assert.equal(calls.length, 1);
  assert.match(calls[0].url, new RegExp("token=" + token));
  assert.equal(calls[0].init.headers.apikey, undefined, "public endpoint must not trigger a preflight with an unnecessary apikey header");
  assert.equal(elements.passport.hidden, false);
  assert.equal(elements["product-name"].textContent, "Culture de Pleurote");
  assert.equal(elements["lot-code"].textContent, "BA-LOT-2026-001");
  assert.equal(elements["product-description"].textContent, "Description publique");
  assert.equal(elements["product-usage"].textContent, "Conseil d'utilisation");
  assert.equal(elements["alerts-list"].children.length, 1);
  const facts = elements.facts.children.map(item => item.children[0].textContent + ":" + item.children[1].textContent);
  assert.ok(facts.includes("STATUT DU LOT:Lot libéré"));
  assert.ok(facts.includes("CONTRÔLES QUALITÉ VALIDÉS:2"));
  assert.ok(facts.includes("RÉFÉRENCE DU PASSEPORT:BA-LOT-2026-001"));
});

test("rejects malformed QR tokens before making a network request", async () => {
  const { elements, calls } = await render({ search: "?token=not-a-valid-token" });
  assert.equal(calls.length, 0);
  assert.equal(elements.error.hidden, false);
  assert.equal(elements["error-title"].textContent, "QR code non reconnu");
});

test("shows the QR entry state when no token is present", async () => {
  const { elements, calls } = await render();
  assert.equal(calls.length, 0);
  assert.equal(elements.missing.hidden, false);
});

test("accepts a pasted public QR URL from the manual lookup form", async () => {
  const token = "B".repeat(43);
  const { elements, calls, window } = await render();
  elements["passport-entry"].value = "https://ba-labs-product-passport.pages.dev/#/p?token=" + token;
  elements["manual-lookup"].listeners.submit({ preventDefault() {} });
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.equal(window.location.hash, "/p?token=" + token);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, new RegExp("token=" + token));
});
