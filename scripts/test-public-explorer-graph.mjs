import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createPublicMycologyNetwork } from "../ecosystem/explorer-2d-graph.js";

const languages=["fr","en","ar","pt"];
const expected=["microbiology","plants","ecology","bioprocesses","biomaterials","instrumentation","digital","physical"];
const indexOfUniverse=id=>expected.indexOf(id);
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
  const brand=graph.byId.get("balabs-identity");
  assert.ok(brand,"BA Labs identity must occupy the visual center");
  assert.equal(brand.title,"BA Labs");
  const center=graph.byId.get("mycology-center");
  assert.ok(center,"mycology hub must exist");
  assert.notDeepEqual([brand.x,brand.y],[center.x,center.y],"The BA Labs logo and mycology tissue must have distinct positions");
  assert.equal(center.parent,brand.id);
  assert.ok(graph.edges.some(edge=>edge.identityLink&&edge.a.id===brand.id&&edge.b.id===center.id),"BA Labs identity must connect to the mycology core");
  assert.equal(center.level,0);
  assert.equal(center.data.url,hubUrls[lang]);
  assert.equal(graph.stats.universeCount,8);
  assert.equal(new Set(graph.nodes.map(node=>node.id)).size,graph.nodes.length,"node IDs must be unique");
  assert.equal(graph.stats.inoculationPoints,8,lang+": each territory must have its own inoculation point");
  const roots=expected.map(id=>graph.byId.get(id));
  assert.equal(new Set(roots.map(node=>node.colorKey)).size,8,lang+": all eight universes must have distinct color identities");
  assert.equal(new Set(roots.map(node=>node.inoculationIndex)).size,8,lang+": all eight inoculation anchors must be distinct");
  assert.ok(roots.every(node=>Number.isFinite(node.x)&&Number.isFinite(node.y)),lang+": each universe must have a stable spatial anchor");
  assert.ok(roots.every(node=>node.x!==0||node.y!==center.y),lang+": universe anchors must grow beyond the central mycology tissue");
  assert.ok(graph.edges.filter(edge=>edge.hubLink).every(edge=>edge.primaryHypha===true),lang+": each universe must emerge from the central mycelial tissue");
  for(const root of roots){
    const directChildren=graph.nodes.filter(node=>node.parent===root.id);
    assert.ok(directChildren.length>0,`${lang}: ${root.id} must retain its real first-generation knowledge nodes`);
    assert.ok(directChildren.every(node=>Math.abs(node.angle-root.angle)<=0.95),`${lang}: ${root.id} first-generation branches must grow as a controlled rhizomorphic fan, not a radial starburst`);
    if(directChildren.length>=3){const angles=directChildren.map(node=>node.angle);assert.ok(Math.max(...angles)-Math.min(...angles)>=0.32,`${lang}: ${root.id} first-generation branches must open into a visible fan instead of a narrow bundle`);}
    const hasLateralGrowth=directChildren.some(node=>{const dx=node.x-root.x,dy=node.y-root.y;return Math.abs(-Math.sin(root.angle)*dx+Math.cos(root.angle)*dy)>Math.hypot(dx,dy)*.05;});
    assert.ok(hasLateralGrowth,`${lang}: ${root.id} must show lateral rhizomorphic growth, not only radial spokes`);
    const lateralRatios=directChildren.map(node=>{const dx=node.x-root.x,dy=node.y-root.y;return Math.abs(-Math.sin(root.angle)*dx+Math.cos(root.angle)*dy)/(Math.hypot(dx,dy)||1);});
    assert.ok(Math.max(...lateralRatios)<.38,`${lang}: ${root.id} primary hyphae must advance through the medium before widening laterally, not form a broad fan`);
  }
  assert.ok(graph.edges.filter(edge=>edge.hubLink).every(edge=>!edge.arm),lang+": the network must not be partitioned into three fixed arms");
  assert.ok(graph.edges.some(edge=>edge.generation>=2),lang+": recursive knowledge branches must carry their biological generation");
  const siblingGroups=new Map();
  for(const edge of graph.edges.filter(edge=>edge.fractal)){
    if(!siblingGroups.has(edge.a.id))siblingGroups.set(edge.a.id,[]);
    siblingGroups.get(edge.a.id).push(edge);
  }
  const branchedGroups=[...siblingGroups.entries()].filter(([,edges])=>edges.length>1);
  assert.ok(branchedGroups.length>0,lang+": real branching junctions must exist");
  assert.ok(branchedGroups.every(([,edges])=>edges.every(edge=>edge.branchPoint&&Number.isFinite(edge.branchPoint.x)&&Number.isFinite(edge.branchPoint.y))),lang+": sibling hyphae must share one biological branch origin instead of radiating independently from their parent");
  assert.ok(branchedGroups.every(([parentId,edges])=>{const parent=graph.byId.get(parentId),point=edges[0].branchPoint;return Math.hypot(point.x-parent.x,point.y-parent.y)>8&&edges.every(edge=>edge.branchPoint.x===point.x&&edge.branchPoint.y===point.y);}),lang+": each branch junction must advance along a shared growth trunk before lateral bifurcation");
  assert.ok(branchedGroups.every(([parentId,edges])=>{const parent=graph.byId.get(parentId),point=edges[0].branchPoint,average=edges.reduce((sum,edge)=>sum+Math.hypot(edge.b.x-parent.x,edge.b.y-parent.y),0)/edges.length;return Math.hypot(point.x-parent.x,point.y-parent.y)>=average*.5;}),lang+": the common primary hypha must advance at least halfway to the branching zone before bifurcating");
  for(const id of expected){
    const universe=graph.byId.get(id);
    assert.ok(universe,`${lang}: missing universe ${id}`);
    assert.equal(universe.level,0);
    assert.equal(universe.parent,center.id);
    assert.equal(universe.inoculationIndex,indexOfUniverse(id));
    assert.ok(graph.edges.some(edge=>edge.hubLink&&edge.a.id===center.id&&edge.b.id===id),`${lang}: missing hub connection for ${id}`);
  }
  for(const edge of graph.edges.filter(item=>item.verified)){
    assert.ok(expected.includes(edge.a.rootId)&&expected.includes(edge.b.rootId),"verified cross-universe links must remain inside known territories");
    assert.notEqual(edge.a.rootId,edge.b.rootId,"verified cross-universe links must connect distinct territories");
    assert.ok(["notion-link","page-content"].includes(edge.basis));
  }
  console.log(`✓ ${lang}: mycology hub + eight universes + ${graph.nodes.length} nodes`);
}

const fixture=JSON.parse(readFileSync(new URL("../ecosystem/notion-tree.fr.json",import.meta.url),"utf8")).domains;
const nestedFixture=structuredClone(fixture);
const plants=nestedFixture.find(domain=>domain.id==="plants");
const ecology=nestedFixture.find(domain=>domain.id==="ecology");
const soilNode=plants.children.find(node=>node.id==="soil");
ecology.children.push({id:"test-cross-territory-node",title:"Cross-territory test node",children:[]});
soilNode.relations=[...(soilNode.relations||[]),{target:"test-cross-territory-node",label:"Verified nested relation",basis:"notion-link",evidence:"Synthetic test relation only"}];
const nestedGraph=createPublicMycologyNetwork(nestedFixture,{id:"mycology-center",title:"Mycology",url:hubUrls.fr});
assert.ok(nestedGraph.edges.some(edge=>edge.verified&&edge.a.id==="soil"&&edge.b.id==="test-cross-territory-node"),"Nested documented relations must produce transverse links between knowledge nodes");
const original=createPublicMycologyNetwork(fixture,{id:"mycology-center",title:"Mycology",url:hubUrls.fr});
const expanded=structuredClone(fixture);
expanded[0].children.push({id:"future-knowledge-node",title:"Future knowledge",children:[]});
const grown=createPublicMycologyNetwork(expanded,{id:"mycology-center",title:"Mycology",url:hubUrls.fr});
for(const id of expected){
  const before=original.byId.get(id),after=grown.byId.get(id);
  assert.deepEqual([after.x,after.y,after.colorKey],[before.x,before.y,before.colorKey],"Adding knowledge must not move or recolor another territory");
}
assert.deepEqual(
  original.nodes.map(node=>[node.id,node.x,node.y]),
  createPublicMycologyNetwork(fixture,{id:"mycology-center",title:"Mycology",url:hubUrls.fr}).nodes.map(node=>[node.id,node.x,node.y]),
  "The same knowledge tree must always produce the same biological morphology"
);

const explorer=readFileSync(new URL("../ecosystem/explorer-2d.js",import.meta.url),"utf8");
assert.match(explorer,/if\(n\)activateNode\(n\)/,"a single click must select and focus a node");
assert.match(explorer,/function activateNode\(n\)\{if\(!n\)return;focusNode\(n\);\}/,"node selection must not automatically navigate away");
assert.match(explorer,/selection-open-link/,"the selected node must expose an explicit Notion action");
assert.doesNotMatch(explorer,/DOUBLE-CLICK|DOUBLE CLICK|e\.detail<2/,"the public explorer must not require a double-click");
console.log("✓ public explorer single-click navigation contract");

const publicRenderer=readFileSync(new URL("../ecosystem/explorer-2d-pixi.js",import.meta.url),"utf8");
assert.match(publicRenderer,/bezierCurveTo/,"Primary and secondary hyphae must use flowing cubic morphology, not single-arc spokes");
const publicExplorer=readFileSync(new URL("../ecosystem/explorer-2d.js",import.meta.url),"utf8");
assert.match(publicExplorer,/w<600\?180:280/,"Mobile overview must not reserve a desktop-sized label envelope");
