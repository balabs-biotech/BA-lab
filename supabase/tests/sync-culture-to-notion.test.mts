// Tests de la fonction Edge sync-culture-to-notion (Node >= 22.6).
// Le code de la fonction est chargé tel quel ; Deno, createClient et fetch sont simulés :
// aucun réseau, aucun secret. Usage : node --experimental-strip-types supabase/tests/sync-culture-to-notion.test.mts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, "../functions/sync-culture-to-notion/index.ts"), "utf8");
const importLine = 'import { createClient } from "https://esm.sh/@supabase/supabase-js@2.118.0";';
if (!source.includes(importLine)) throw new Error("import line of the function changed: update the test loader");

const DB_ID = "2914c545-fc0b-425a-acbb-0a59c2c2e52b";
const ORG = "9fe4000d-7ca9-477a-90fd-6f3f0af96cca";
const OTHER_ORG = "11111111-1111-1111-1111-111111111111";
const CULTURE = "07f11496-58d4-49c1-ac6f-c505639ea6df";
const OTHER_CULTURE = "21c7fbc8-b590-420b-87bf-3e2cd9ed4e49";

type Json = Record<string, any>;
let env: Record<string, string | undefined> = {};
let db: { cultures: Json[]; visible: string[]; userOk: boolean; membershipRole: string | null; updateError?: string };
let lockBusy = false;
let lockCalls: { name: string; args: Json }[] = [];
let notion: (url: string, init: Json) => { status: number; body: Json };
let notionCalls: { url: string; method: string; body: Json | null }[] = [];
let updates: { payload: Json; filters: Record<string, any> }[] = [];
let queries: { table: string; filters: Record<string, any> }[] = [];
let handler: (req: Request) => Promise<Response>;

function builder(table: string, role: "user" | "admin") {
  const filters: Record<string, any> = {};
  let payload: Json | null = null;
  const run = () => {
    if (payload) {
      updates.push({ payload, filters: { ...filters } });
      return { data: null, error: db.updateError ? { message: db.updateError } : null };
    }
    queries.push({ table, filters: { ...filters } });
    if (table === "organization_members") {
      const row = db.membershipRole ? { role: db.membershipRole } : null;
      return { data: row, error: null };
    }
    const row = db.cultures.find((c) => c.id === filters.id && (!("organization_id" in filters) || c.organization_id === filters.organization_id));
    const visible = role === "admin" || db.visible.includes(filters.id);
    return { data: row && visible ? { ...row } : null, error: row && visible ? null : { message: "not found" } };
  };
  const b: Json = {
    select: () => b,
    update: (p: Json) => { payload = p; return b; },
    eq: (k: string, v: any) => { filters[k] = v; return b; },
    maybeSingle: async () => run(),
    single: async () => run(),
    then: (resolve: any, reject: any) => Promise.resolve(run()).then(resolve, reject),
  };
  return b;
}

(globalThis as any).__createClient = (_url: string, key: string) => ({
  auth: { getUser: async () => (db.userOk ? { data: { user: { id: "user-1" } }, error: null } : { data: { user: null }, error: { message: "bad" } }) },
  from: (table: string) => builder(table, key === "pub" ? "user" : "admin"),
  rpc: async (name: string, args: Json) => {
    lockCalls.push({ name, args });
    if (name === "acquire_culture_notion_sync_lock") {
      if (lockBusy) return { data: false, error: null };
      lockBusy = true;
      return { data: true, error: null };
    }
    if (name === "release_culture_notion_sync_lock") {
      lockBusy = false;
      return { data: true, error: null };
    }
    return { data: null, error: { message: "unexpected rpc" } };
  },
});
(globalThis as any).Deno = {
  env: { get: (k: string) => env[k] },
  serve: (h: any) => { handler = h; },
};
(globalThis as any).fetch = async (url: string, init: Json = {}) => {
  const method = init.method ?? "GET";
  notionCalls.push({ url, method, body: init.body ? JSON.parse(init.body) : null });
  const r = notion(url, init);
  return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body };
};

const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "sync-fn-")), "fn.mts");
fs.writeFileSync(tmp, source.replace(importLine, "const createClient = (globalThis as any).__createClient;"));
await import(pathToFileURL(tmp).href);

function page(id: string, cultureId: string, dbId = DB_ID, extra: Json = {}) {
  return {
    id, url: `https://notion.so/${id}`, archived: false, parent: { database_id: dbId },
    properties: { "Supabase Culture ID": { rich_text: [{ plain_text: cultureId }] } }, ...extra,
  };
}

function reset(overrides: { env?: Json; notion?: typeof notion; cultures?: Json[]; visible?: string[]; userOk?: boolean; membershipRole?: string | null; updateError?: string; lockBusy?: boolean } = {}) {
  env = {
    SUPABASE_URL: "http://sb.test", SUPABASE_PUBLISHABLE_KEY: "pub", SUPABASE_SECRET_KEY: "svc",
    NOTION_API_KEY: "test-token-not-a-secret", NOTION_CULTURES_DATABASE_ID: DB_ID, ...(overrides.env ?? {}),
  };
  db = {
    cultures: overrides.cultures ?? [{ id: CULTURE, organization_id: ORG, code: "cult-p80-g1", culture_type: "mycelium", notion_page_id: null }],
    visible: overrides.visible ?? [CULTURE],
    userOk: overrides.userOk ?? true,
    membershipRole: overrides.membershipRole === undefined ? "member" : overrides.membershipRole,
    updateError: overrides.updateError,
  };
  lockBusy = overrides.lockBusy ?? false;
  lockCalls = [];
  notion = overrides.notion ?? (() => ({ status: 500, body: { message: "unexpected notion call" } }));
  notionCalls = []; updates = []; queries = [];
}

async function call(body: Json | null = { culture_id: CULTURE }, headers: Record<string, string> = { Authorization: "Bearer jwt" }, method = "POST") {
  const res = await handler(new Request("http://fn.test/", { method, headers, body: body ? JSON.stringify(body) : undefined }));
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Json };
}
const creates = () => notionCalls.filter((c) => c.method === "POST" && c.url.endsWith("/v1/pages"));
const patches = () => notionCalls.filter((c) => c.method === "PATCH");
const finalUpdate = () => updates[updates.length - 1];

let failed = 0;
async function test(name: string, fn: () => Promise<void>) {
  try { await fn(); console.log(`PASS  ${name}`); }
  catch (e) { failed++; console.log(`FAIL  ${name}\n      ${e instanceof Error ? e.message : e}`); }
}
function eq(actual: any, expected: any, what: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function ok(cond: any, what: string) { if (!cond) throw new Error(what); }

await test("sans en-tête Authorization : 401 et aucun appel Notion", async () => {
  reset(); const r = await call({ culture_id: CULTURE }, {});
  eq(r.status, 401, "status"); eq(notionCalls.length, 0, "notion calls");
});
await test("session invalide : 401 et aucun appel Notion", async () => {
  reset({ userOk: false }); const r = await call();
  eq(r.status, 401, "status"); eq(notionCalls.length, 0, "notion calls");
});
await test("culture non visible par l'utilisateur (RLS) : 404, rien n'est écrit", async () => {
  reset({ visible: [] }); const r = await call();
  eq(r.status, 404, "status"); eq(notionCalls.length, 0, "notion calls"); eq(updates.length, 0, "updates");
});
await test("viewer peut lire la culture mais ne peut pas déclencher une synchronisation privilégiée", async () => {
  reset({ membershipRole: "viewer" }); const r = await call();
  eq(r.status, 403, "status"); eq(notionCalls.length, 0, "notion calls"); eq(updates.length, 0, "updates");
});
await test("secret de base Notion invalide : 503 sans appel Notion", async () => {
  reset({ env: { NOTION_CULTURES_DATABASE_ID: "pas-un-uuid" } }); const r = await call();
  eq(r.status, 503, "status"); eq(notionCalls.length, 0, "notion calls");
});
await test("ID de base avec point final : normalisé, page créée dans la bonne base", async () => {
  reset({
    env: { NOTION_CULTURES_DATABASE_ID: `${DB_ID}.` },
    notion: (url, init) => url.endsWith("/query") ? { status: 200, body: { results: [] } }
      : init.method === "POST" ? { status: 200, body: page("page-new", CULTURE) } : { status: 200, body: {} },
  });
  const r = await call();
  eq(r.status, 200, "status"); eq(creates().length, 1, "creates");
  eq(creates()[0].body?.parent, { database_id: DB_ID }, "parent");
});
await test("création : aucune page existante -> une seule page, statut synced enregistré", async () => {
  reset({
    notion: (url, init) => url.endsWith("/query") ? { status: 200, body: { results: [] } }
      : init.method === "POST" ? { status: 200, body: page("page-new", CULTURE) } : { status: 200, body: {} },
  });
  const r = await call();
  eq(r.status, 200, "status"); eq(r.body.notion_page_id, "page-new", "page id"); eq(creates().length, 1, "creates");
  eq(finalUpdate().payload.notion_sync_status, "synced", "sync status"); eq(finalUpdate().payload.notion_sync_error, null, "error cleared");
  eq(finalUpdate().filters, { id: CULTURE, organization_id: ORG }, "update filters");
});
await test("relance : page déjà liée et valide -> mise à jour, aucune création", async () => {
  reset({
    cultures: [{ id: CULTURE, organization_id: ORG, code: "cult-p80-g1", culture_type: "mycelium", notion_page_id: "page-1" }],
    notion: (url, init) => url.includes("/v1/pages/page-1") ? { status: 200, body: init.method === "GET" ? page("page-1", CULTURE) : page("page-1", CULTURE) } : { status: 500, body: { message: "unexpected" } },
  });
  const r = await call();
  eq(r.status, 200, "status"); eq(creates().length, 0, "creates"); eq(patches().length, 1, "patches");
  ok(patches()[0].url.endsWith("/v1/pages/page-1"), "patch target");
});
await test("page liée appartenant à une AUTRE culture : jamais modifiée ni réutilisée", async () => {
  reset({
    cultures: [{ id: CULTURE, organization_id: ORG, code: "cult-p80-g1", culture_type: "mycelium", notion_page_id: "page-foreign" }],
    notion: (url, init) => {
      if (url.includes("/v1/pages/page-foreign")) return { status: 200, body: page("page-foreign", OTHER_CULTURE) };
      if (url.endsWith("/query")) return { status: 200, body: { results: [] } };
      return init.method === "POST" ? { status: 200, body: page("page-new", CULTURE) } : { status: 200, body: {} };
    },
  });
  const r = await call();
  eq(r.status, 200, "status"); eq(r.body.notion_page_id, "page-new", "new page used");
  ok(!patches().some((p) => p.url.includes("page-foreign")), "foreign page must not be patched");
});
await test("page liée située dans une AUTRE base : ignorée", async () => {
  reset({
    cultures: [{ id: CULTURE, organization_id: ORG, code: "x", culture_type: "m", notion_page_id: "page-elsewhere" }],
    notion: (url, init) => {
      if (url.includes("/v1/pages/page-elsewhere")) return { status: 200, body: page("page-elsewhere", CULTURE, "99999999-9999-9999-9999-999999999999") };
      if (url.endsWith("/query")) return { status: 200, body: { results: [] } };
      return init.method === "POST" ? { status: 200, body: page("page-new", CULTURE) } : { status: 200, body: {} };
    },
  });
  const r = await call();
  ok(!patches().some((p) => p.url.includes("page-elsewhere")), "page of another database must not be patched");
  eq(r.body.notion_page_id, "page-new", "new page used");
});
await test("réconciliation : page existante retrouvée par Supabase Culture ID -> mise à jour, pas de doublon", async () => {
  reset({
    notion: (url, init) => url.endsWith("/query") ? { status: 200, body: { results: [page("page-found", CULTURE)] } }
      : init.method === "PATCH" ? { status: 200, body: page("page-found", CULTURE) } : { status: 500, body: { message: "unexpected" } },
  });
  const r = await call();
  eq(r.status, 200, "status"); eq(creates().length, 0, "creates"); eq(r.body.notion_page_id, "page-found", "page id");
  eq(finalUpdate().payload.notion_page_id, "page-found", "linked page saved");
});
await test("DÉFAUT CORRIGÉ : recherche Notion en échec -> AUCUNE création, erreur enregistrée", async () => {
  reset({ notion: (url) => url.endsWith("/query") ? { status: 503, body: { message: "unavailable" } } : { status: 200, body: page("page-new", CULTURE) } });
  const r = await call();
  eq(r.status, 502, "status"); eq(creates().length, 0, "creates (must be 0 to avoid a duplicate)");
  eq(finalUpdate().payload.notion_sync_status, "error", "error status saved");
  eq(finalUpdate().filters, { id: CULTURE, organization_id: ORG }, "error update filtered by organization_id");
});
await test("plusieurs pages portent déjà le même Culture ID : arrêt, rien n'est créé ni modifié", async () => {
  reset({ notion: (url) => url.endsWith("/query") ? { status: 200, body: { results: [page("a", CULTURE), page("b", CULTURE)] } } : { status: 500, body: { message: "unexpected" } } });
  const r = await call();
  eq(r.status, 502, "status"); eq(creates().length, 0, "creates"); eq(patches().length, 0, "patches");
  ok(/duplicate/i.test(r.body.error), "error mentions duplicate");
});
await test("échec de création Notion : statut error enregistré avec le message", async () => {
  reset({ notion: (url, init) => url.endsWith("/query") ? { status: 200, body: { results: [] } } : init.method === "POST" ? { status: 400, body: { message: "validation failed" } } : { status: 200, body: {} } });
  const r = await call();
  eq(r.status, 502, "status"); eq(finalUpdate().payload.notion_sync_status, "error", "status"); eq(finalUpdate().payload.notion_sync_error, "validation failed", "message");
});
await test("la lecture admin de la culture est filtrée par organization_id", async () => {
  reset({ notion: (url, init) => url.endsWith("/query") ? { status: 200, body: { results: [] } } : init.method === "POST" ? { status: 200, body: page("p", CULTURE) } : { status: 200, body: {} } });
  await call();
  const adminRead = queries.find((q) => q.table === "cultures" && q.filters.organization_id);
  ok(adminRead && adminRead.filters.organization_id === ORG, "admin read must filter on the organization of the caller");
});
await test("le jeton Notion n'apparaît dans aucune réponse ni message d'erreur", async () => {
  reset({ notion: (url) => url.endsWith("/query") ? { status: 503, body: { message: "unavailable" } } : { status: 200, body: {} } });
  const r = await call();
  ok(!JSON.stringify(r.body).includes("test-token-not-a-secret"), "token leaked in response");
  ok(!JSON.stringify(updates).includes("test-token-not-a-secret"), "token leaked in stored error");
});

await test("récupération après création Notion mais échec de sauvegarde Supabase : la relance retrouve la page", async () => {
  let createdPage: Json | null = null;
  let queryCount = 0;
  const mockNotion = (url: string, init: Json) => {
    if (url.endsWith("/query")) {
      queryCount++;
      return { status: 200, body: { results: createdPage ? [createdPage] : [] } };
    }
    if (init.method === "POST" && url.endsWith("/v1/pages")) {
      createdPage = page("page-recovered", CULTURE);
      return { status: 200, body: createdPage };
    }
    if (init.method === "PATCH" && url.includes("/v1/pages/page-recovered")) {
      return { status: 200, body: createdPage ?? {} };
    }
    return { status: 200, body: {} };
  };

  reset({ notion: mockNotion, updateError: "temporary Supabase write failure" });
  const first = await call();
  eq(first.status, 502, "first sync status");
  eq(creates().length, 1, "first sync creates exactly one page");

  // Simulate a retry after the Supabase write path recovers, while the page id
  // is still absent from the stored culture row.
  db.updateError = undefined;
  notionCalls = [];
  updates = [];
  queries = [];
  const second = await call();
  eq(second.status, 200, "retry status");
  eq(creates().length, 0, "retry must not create a duplicate");
  eq(second.body.notion_page_id, "page-recovered", "recovered page id");
  eq(finalUpdate().payload.notion_page_id, "page-recovered", "page link persisted on retry");
  ok(queryCount >= 2, "retry must reconcile against Notion");
});

await test("synchronisation déjà verrouillée : 409, aucun appel Notion et aucune écriture de statut", async () => {
  reset({ lockBusy: true });
  const r = await call();
  eq(r.status, 409, "status");
  eq(r.body.code, "sync_in_progress", "error code");
  eq(notionCalls.length, 0, "Notion calls");
  eq(updates.length, 0, "culture updates");
  eq(lockCalls[0].name, "acquire_culture_notion_sync_lock", "lock RPC");
});

await test("verrou de synchronisation libéré après succès", async () => {
  reset({
    notion: (url, init) => url.endsWith("/query") ? { status: 200, body: { results: [] } }
      : init.method === "POST" ? { status: 200, body: page("page-lock", CULTURE) } : { status: 200, body: {} },
  });
  const r = await call();
  eq(r.status, 200, "status");
  eq(lockCalls.map((c) => c.name), ["acquire_culture_notion_sync_lock", "release_culture_notion_sync_lock"], "lock lifecycle");
  eq(lockBusy, false, "lock released");
});


await test("verrou de synchronisation libéré après une erreur Notion", async () => {
  reset({ notion: (url) => url.endsWith("/query")
    ? { status: 503, body: { message: "temporary Notion outage" } }
    : { status: 500, body: { message: "unexpected" } },
  });
  const r = await call();
  eq(r.status, 502, "status");
  eq(lockCalls.map((c) => c.name), ["acquire_culture_notion_sync_lock", "release_culture_notion_sync_lock"], "lock lifecycle after failure");
  eq(lockBusy, false, "lock released after failure");
  eq(finalUpdate().payload.notion_sync_status, "error", "sync error persisted");
});

console.log(failed ? `\n${failed} test(s) en échec` : "\nOK: sync-culture-to-notion tests passed");
process.exit(failed ? 1 : 0);
