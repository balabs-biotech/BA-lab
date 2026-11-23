import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createPublicMycologyNetwork } from "../ecosystem/explorer-2d-graph.js";

const languages=["fr","en","ar","pt"];
const expected=["microbiology","plants","ecology","bioprocesses","biomaterials","instrumentation","digital","physical"];
const hubUrls={
  fr:"https://app.notion.com/p/3e273152f1718161b154d8b8fc50f063",
  en:"https://app.notion.com/p/40173152f17181019838de83de8173f3",
  ar:"https://app.notion.com/p/40173152f171813ba690d5064844f54a",
  pt:"https://app.notion.com/p/40173152f171814dad1adcd7559c7823"
};

for(const lang of languages){
  const manifest=JSON.parse(readFileSync(new URL(`../ecosystem/notion-tree.${lang}.json`,import.meta.url),"utf8"));
  assert.deepEqual(manifest.domains.map(item=>item.id),expected,`${lang}: the eight universe IDs and their order must stay aligned`);
  const graph=createPublicMycologyNetwork(manifest.domains,{
    id:"mycology-center",title:"Mycology",description:"The BA Labs mycology hub",url:hubUrls[lang]
  });
  const center=graph.byId.get("mycology-center");
  assert.ok(center,"mycology hub must exist");
  assert.equal(center.level,0);
  assert.equal(center.data.url,hubUrls[lang]);
  assert.equal(graph.stats.universeCount,8);
  assert.equal(new Set(graph.nodes.map(node=>node.id)).size,graph.nodes.length,"node IDs must be unique");
  for(const id of expected){
    const universe=graph.byId.get(id);
    assert.ok(universe,`${lang}: missing universe ${id}`);
    assert.equal(universe.level,0);
    assert.equal(universe.parent,center.id);
    assert.ok(graph.edges.some(edge=>edge.hubLink&&edge.a.id===center.id&&edge.b.id===id),`${lang}: missing hub connection for ${id}`);
  }
  for(const edge of graph.edges.filter(item=>item.verified)){
    assert.ok(expected.includes(edge.a.id)&&expected.includes(edge.b.id),"verified cross-universe links must connect universe roots only");
    assert.ok(["notion-link","page-content"].includes(edge.basis));
  }
  console.log(`✓ ${lang}: mycology hub + eight universes + ${graph.nodes.length} nodes`);
}

const explorer=readFileSync(new URL("../ecosystem/explorer-2d.js",import.meta.url),"utf8");
assert.match(explorer,/if\(n\)activateNode\(n\)/,"a single click must open the selected Notion destination");
assert.doesNotMatch(explorer,/DOUBLE-CLICK|DOUBLE CLICK|e\.detail<2/,"the public explorer must not require a double-click");
console.log("✓ public explorer single-click navigation contract");
