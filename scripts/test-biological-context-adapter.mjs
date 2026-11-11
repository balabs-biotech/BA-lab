import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const context = { Object, Array, String, globalThis: {} };
vm.runInNewContext(fs.readFileSync("shared/biological-context-adapter.js", "utf8"), context, {
  filename: "shared/biological-context-adapter.js",
});
const adapter = context.globalThis.BALabsBiologicalContextAdapter;

const snapshot = {
  organization_id: "org-1",
  culture: { organization_id: "org-1", id: "culture-1", material_id: "material-1", environment_id: "environment-1", metadata: {} },
  material: { organization_id: "org-1", id: "material-1", strain_id: "strain-1" },
  strain: { organization_id: "org-1", id: "strain-1", strain_code: "PLEU-OST-01", organism_id: "organism-1" },
  organism: { id: "organism-1", taxonomy_id: "ncbi:12345", scientific_name: "Pleurotus ostreatus" },
  environment: { organization_id: "org-1", id: "environment-1" },
};

assert.equal(adapter.version, "0.1.0");
const resolved = adapter.build(snapshot);
assert.equal(resolved.status, "partial_context");
assert.equal(resolved.context.culture_id, "culture-1");
assert.equal(resolved.context.strain_id, "strain-1");
assert.equal(resolved.context.strain_code, "PLEU-OST-01");
assert.equal(resolved.context.taxon_code, "ncbi:12345");
assert.equal(resolved.context.environment_id, "environment-1");
assert.equal("growth_stage" in resolved.context, false, "stage must not be invented");
assert.equal("medium_code" in resolved.context, false, "medium must not be invented");
assert.equal(resolved.evidence.organism_scientific_name, "Pleurotus ostreatus");

const noStrain = adapter.build({ ...snapshot, material: { organization_id: "org-1", id: "material-1", strain_id: null }, strain: null, organism: null });
assert.equal(noStrain.status, "partial_context");
assert.equal("strain_code" in noStrain.context, false);
assert.equal(noStrain.context.environment_id, "environment-1");

const crossTenant = adapter.build({ ...snapshot, strain: { ...snapshot.strain, organization_id: "org-2" } });
assert.equal(crossTenant.status, "invalid_context");
assert.equal(crossTenant.context, null);

const wrongMaterial = adapter.build({ ...snapshot, material: { ...snapshot.material, id: "other-material" } });
assert.equal(wrongMaterial.status, "invalid_context");

const wrongOrganism = adapter.build({ ...snapshot, organism: { ...snapshot.organism, id: "other-organism" } });
assert.equal(wrongOrganism.status, "invalid_context");

const missingCulture = adapter.build({ ...snapshot, culture: null });
assert.equal(missingCulture.status, "insufficient_context");

console.log("✓ Biological Context Adapter: tenant and lineage checks, exact biological identifiers, explicit partial context");
