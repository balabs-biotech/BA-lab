import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const context = { Object, Array, String, Set, globalThis: {} };
for (const file of ["shared/biological-context-adapter.js", "shared/biological-context-loader.js"]) {
  vm.runInNewContext(fs.readFileSync(file, "utf8"), context, { filename: file });
}
const loader = context.globalThis.BALabsBiologicalContextLoader;
const adapter = context.globalThis.BALabsBiologicalContextAdapter;
const rows = {
  cultures: { organization_id: "org-A", id: "culture-A", material_id: "material-A", environment_id: "environment-A" },
  materials: { organization_id: "org-A", id: "material-A", strain_id: "strain-A" },
  strains: { organization_id: "org-A", id: "strain-A", strain_code: "STRAIN-A", organism_id: "organism-A" },
  organisms: { id: "organism-A", taxonomy_id: "ncbi:42", scientific_name: "Example species" },
  environments: { organization_id: "org-A", id: "environment-A" },
};
const calls = [];
const client = {
  from(table) {
    const query = { table, filters: [] };
    calls.push(query);
    return {
      select(columns) { query.columns = columns; return this; },
      eq(column, value) { query.filters.push([column, value]); return this; },
      async maybeSingle() { return { data: rows[table] ?? null, error: null }; },
    };
  },
};
const result = await loader.load({
  client, organizationId: "org-A", cultureId: "culture-A", adapter,
});
assert.equal(result.status, "partial_context");
assert.equal(result.context.taxon_code, "ncbi:42");
assert.equal(result.context.strain_code, "STRAIN-A");
for (const table of ["cultures", "materials", "strains", "environments"]) {
  const query = calls.find(item => item.table === table);
  assert.ok(query.filters.some(([column, value]) => column === "organization_id" && value === "org-A"),
    table + " query must be organization-scoped");
}
assert.ok(calls.find(item => item.table === "organisms").filters.some(([column, value]) => column === "id" && value === "organism-A"));

const crossOrg = await loader.load({
  client: { from(table) {
    const query = { filters: [] };
    return {
      select() { return this; },
      eq(column, value) { query.filters.push([column, value]); return this; },
      async maybeSingle() {
        if (table === "cultures") return { data: { ...rows.cultures, organization_id: "org-B" }, error: null };
        return { data: null, error: null };
      },
    };
  } },
  organizationId: "org-A", cultureId: "culture-A", adapter,
});
assert.equal(crossOrg.status, "invalid_context");

const noCulture = await loader.load({
  client: { from() { return { select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: null, error: null }; } }; } },
  organizationId: "org-A", cultureId: "missing", adapter,
});
assert.equal(noCulture.status, "insufficient_context");

console.log("✓ Biological Context Loader: organization-scoped queries, relation loading and adapter handoff");
