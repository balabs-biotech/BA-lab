import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const calls=[];
const draft={organization_id:"org-1",policy_id:"mycology.inspect",version:"1.0.0",status:"draft"};
const reviewed={id:"p1",revision_seq:1,organization_id:"org-1",policy_id:"mycology.inspect",version:"1.0.0",status:"reviewed",reviewed_by:"user-1",reviewed_at:"2026-11-11T10:00:00Z"};
function clientFor(mode) {
  return {
    auth:{getUser:async()=>({data:{user:{id:"user-1"}},error:null})},
    from(table) {
      const state={table,filters:[]};
      const q={
        insert(row){state.insert=row;calls.push(state);return q;},
        update(row){state.update=row;calls.push(state);return q;},
        select(value){state.select=value;return q;},
        eq(k,v){state.filters.push([k,v]);return q;},
        single:async()=>({data:mode==="create"?{...state.insert,id:"p1"}:{...state.insert,id:"p2",status:"retired"},error:null}),
        maybeSingle:async()=>state.update?{data:reviewed,error:null}:{data:{id:"p1",...draft},error:null}
      };
      return q;
    }
  };
}
const context={Object,Array,String,Number,Date,Map,globalThis:{}};
vm.runInNewContext(fs.readFileSync("shared/biological-decision-policy-authoring.js","utf8"),context);
const api=context.globalThis.BALabsBiologicalDecisionPolicyAuthoring;
const base={policy_id:"mycology.inspect",version:"1.0.0",status:"draft",domain:"mycology",rule_version_id:"rule-uuid-1",trigger_assessment_statuses:["out_of_range"],decision_code:"inspect",title:"Inspection requise",explanation:"Comparer avec le protocole validé.",sources:[{type:"protocol",citation:"PROC-01"}]};
const created=await api.createDraft({client:clientFor("create"),organizationId:"org-1",policy:base});
assert.equal(created.status,"created");
assert.equal(calls[0].insert.organization_id,"org-1");
assert.equal(calls[0].insert.rule_version_id,"rule-uuid-1");
assert.equal((await api.createDraft({client:clientFor("create"),organizationId:"org-1",policy:{...base,trigger_assessment_statuses:["normal"]}})).status,"invalid_policy");
assert.equal((await api.createDraft({client:clientFor("create"),organizationId:"org-1",policy:{...base,domain:"green-tech"}})).status,"invalid_policy");
assert.equal((await api.createDraft({client:clientFor("create"),organizationId:"org-1",policy:{...base,sources:[{type:"protocol",citation:" "}]}})).status,"invalid_policy");
assert.equal((await api.createDraft({client:clientFor("create"),organizationId:"org-1",policy:{...base,sources:[{type:"protocol"}]}})).status,"invalid_policy");
const reviewCalls=[];
const reviewClient=clientFor("review");
const reviewedResult=await api.reviewDraft({client:reviewClient,organizationId:"org-1",policyId:"mycology.inspect",version:"1.0.0"});
assert.equal(reviewedResult.status,"published");
assert.equal(reviewedResult.record.reviewed_by,"user-1");
const retireResult=await api.retirePolicy({client:clientFor("retire"),organizationId:"org-1",policy:{...base,...reviewed,status:"reviewed"},newVersion:"2.0.0"});
assert.equal(retireResult.status,"retired");
assert.equal((await api.retirePolicy({client:clientFor("retire"),organizationId:"org-1",policy:{...base,...reviewed,status:"reviewed"},newVersion:"1.0.0"})).status,"invalid_policy");
console.log("✓ Decision policy authoring: draft validation, reviewer binding and immutable retirement version");
