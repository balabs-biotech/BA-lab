import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const calls = [];
const rows = [
  { id:"p2", organization_id:"org-1", policy_id:"mycology.inspect", version:"2.0.0", revision_seq:2,
    status:"reviewed", domain:"mycology", rule_version_id:"rule-v1",
    trigger_assessment_statuses:["out_of_range"], decision_code:"inspect",
    title:"Inspection requise", explanation:"Consulter le protocole.",
    severity:"review", recommended_action:"Vérifier les mesures indépendantes.",
    sources:[{type:"protocol",citation:"PROC-01"}], reviewed_by:"user-1", reviewed_at:"2026-11-11T10:00:00Z" },
  { id:"p1", organization_id:"org-1", policy_id:"mycology.inspect", version:"1.0.0", revision_seq:1,
    status:"reviewed", domain:"mycology", rule_version_id:"rule-v1",
    trigger_assessment_statuses:["out_of_range"], decision_code:"inspect-old",
    title:"Ancienne version", explanation:"Ancienne version.",
    sources:[{type:"protocol",citation:"PROC-OLD"}], reviewed_by:"user-1", reviewed_at:"2026-11-10T10:00:00Z" },
  { id:"foreign", organization_id:"org-2", policy_id:"foreign", version:"1.0.0", revision_seq:3,
    status:"reviewed", domain:"mycology", rule_version_id:"rule-v1",
    trigger_assessment_statuses:["out_of_range"], decision_code:"foreign",
    title:"Foreign", explanation:"Foreign", sources:[{type:"protocol"}],
    reviewed_by:"user-2", reviewed_at:"2026-11-11T10:00:00Z" }
];
function queryBuilder(table) {
  const state = { table, filters:[] };
  const q = {
    select(value){state.select=value;return q;},
    eq(key,value){state.filters.push(["eq",key,value]);return q;},
    in(key,value){state.filters.push(["in",key,value]);return q;},
    order(key,value){state.order=[key,value];return q;},
    limit(value){state.limit=value;return q;},
    then(resolve,reject){calls.push(state); const selected=rows.filter(row=>row.organization_id==="org-1" && row.domain==="mycology" && row.rule_version_id==="rule-v1"); return Promise.resolve({data:selected,error:null}).then(resolve,reject);}
  };
  return q;
}
const context={Object,Array,String,Number,Date,Map,globalThis:{}};
vm.runInNewContext(fs.readFileSync("shared/biological-decision-policy-store.js","utf8"),context);
const store=context.globalThis.BALabsBiologicalDecisionPolicyStore;
const assessment={id:"a1",organization_id:"org-1",domain:"mycology",rule_version_id:"rule-v1",status:"out_of_range"};
const loaded=await store.loadReviewedPolicies({client:{from:queryBuilder},assessment});
assert.equal(loaded.status,"loaded");
assert.equal(loaded.policies.length,1);
assert.equal(loaded.policies[0].policy_id,"mycology.inspect");
assert.equal(loaded.policies[0].version,"2.0.0");
assert.equal(loaded.policies[0].organization_id,"org-1");
assert.equal(loaded.policies[0].rule_version_id,"rule-v1");
assert.equal(loaded.policies[0].review.reviewer_id,"user-1");
assert.equal((await store.loadReviewedPolicies({client:{from:()=>queryBuilder("bad")},assessment})).policies.length,1);
assert.ok(calls[0].filters.some(x=>x[1]==="organization_id" && x[2]==="org-1"));
assert.ok(calls[0].filters.some(x=>x[1]==="rule_version_id" && x[2]==="rule-v1"));
assert.equal((await store.loadReviewedPolicies({client:{from:queryBuilder},assessment:{...assessment,organization_id:""}})).status,"insufficient_context");
assert.equal((await store.loadReviewedPolicies({client:{from:queryBuilder},assessment:{...assessment,status:"normal"}})).status,"not_applicable");
console.log("✓ Decision policy store: tenant/rule-version scope, latest revision and fail-closed input");
