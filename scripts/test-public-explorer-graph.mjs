import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createPublicMycologyNetwork } from "../ecosystem/explorer-2d-graph.js";

const explorerPage=readFileSync(new URL("../ecosystem/index.html",import.meta.url),"utf8");
assert.match(explorerPage,/@media\(max-width:700px\)\{[\s\S]*?\.selection-path,[\s\S]*?\.selection-description,[\s\S]*?\.child-branches\{display:none!important\}/,"Mobile selection must hide ancestry, long descriptions, and child lists to preserve canvas space");
const pixiRenderer=readFileSync(new URL("../ecosystem/explorer-2d-pixi.js",import.meta.url),"utf8");
assert.match(pixiRenderer,/const mobileLabelScaleFactor=mobile\?\.68:1/,"Mobile labels must require a later zoom threshold instead of exposing the full hierarchy in the overview");
assert.match(pixiRenderer,/const labelBudget=rootCount\+\(mobile\?3:Math\.min\(34,Math\.max\(8,Math\.round\(10\+scale\*5\)\)\)\)/,"Mobile overview must cap non-root labels to three at a time");

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
  const center=graph.byId.get("mycology-center");
  assert.ok(center,"mycology hub must exist");
  assert.equal(center.level,0);
  assert.deepEqual([center.x,center.y],[0,0],"Mycology itself must occupy the exact center of the circular ecosystem");
  assert.equal(graph.byId.has("balabs-identity"),false,"BA Labs must not be inserted as an extra node above or beside the mycology center");
  assert.equal(center.data.url,hubUrls[lang]);
  assert.equal(graph.stats.universeCount,8);
  assert.equal(new Set(graph.nodes.map(node=>node.id)).size,graph.nodes.length,"node IDs must be unique");
  assert.equal(graph.stats.inoculationPoints,8,lang+": each territory must have its own inoculation point");
  const roots=expected.map(id=>graph.byId.get(id));
  assert.equal(new Set(roots.map(node=>node.colorKey)).size,8,lang+": all eight universes must have distinct color identities");
  assert.ok(roots.every(node=>node.colorKey===node.id),lang+": each universe must use its own current taxonomy key, never a legacy color category");
  assert.ok(roots.every(node=>node.territoryMass>0),lang+": each territory must expose its real content mass");
  assert.ok(roots.every(node=>node.territoryRadius>0),lang+": each territory must receive a content-driven growth envelope");
  for(const root of roots){
    assert.ok(graph.nodes.filter(node=>node.rootId===root.id).every(node=>node.territoryRadius===root.territoryRadius),lang+": the content-driven territory envelope must reach every descendant that uses it for growth");
  }
  assert.equal(new Set(roots.map(node=>node.inoculationIndex)).size,8,lang+": all eight inoculation anchors must be distinct");
  assert.ok(roots.every(node=>Number.isFinite(node.x)&&Number.isFinite(node.y)),lang+": each universe must have a stable spatial anchor");
  const rootRadii=roots.map(node=>Math.hypot(node.x,node.y));
  assert.ok(Math.max(...rootRadii)-Math.min(...rootRadii)<1e-8,lang+": the eight inoculation points must form one symmetric first ring");
  assert.ok(Math.abs(rootRadii[0]-430)<1e-8,lang+": the first ring must keep an even gap around the mycology core");
  const rootAngles=roots.map(node=>Math.atan2(node.y,node.x));
  const angularGaps=rootAngles.map((angle,index)=>{const next=rootAngles[(index+1)%rootAngles.length];return(next-angle+Math.PI*2)%(Math.PI*2);});
  assert.ok(angularGaps.every(gap=>Math.abs(gap-Math.PI/4)<1e-8),lang+": all eight universes must be evenly distributed around the mycology center");
  assert.ok(roots.every(node=>node.x*Math.cos(node.angle)+node.y*Math.sin(node.angle)>250),lang+": each universe must occupy the outer field and grow radially outward into its own territory");
  assert.ok(roots.every(node=>node.x!==0||node.y!==center.y),lang+": universe anchors must grow beyond the central mycology tissue");
  assert.ok(graph.edges.filter(edge=>edge.hubLink).every(edge=>edge.primaryHypha===true),lang+": each universe must emerge from the central mycelial tissue");
  for(const root of roots){
    const directChildren=graph.nodes.filter(node=>node.parent===root.id);
    assert.ok(directChildren.length>0,`${lang}: ${root.id} must retain its real first-generation knowledge nodes`);
    assert.ok(directChildren.every(node=>Math.abs(node.angle-root.angle)<=0.95),`${lang}: ${root.id} first-generation branches must grow as a controlled rhizomorphic fan, not a radial starburst`);
    const hasLateralGrowth=directChildren.some(node=>{const dx=node.x-root.x,dy=node.y-root.y;return Math.abs(-Math.sin(root.angle)*dx+Math.cos(root.angle)*dy)>Math.hypot(dx,dy)*.05;});
    assert.ok(hasLateralGrowth,`${lang}: ${root.id} must show lateral rhizomorphic growth, not only radial spokes`);
    if(root.id==="microbiology"){
      const angularOffsets=directChildren.map(node=>Math.atan2(Math.sin(node.angle-root.angle),Math.cos(node.angle-root.angle)));
      assert.ok(Math.max(...angularOffsets)-Math.min(...angularOffsets)>=.18,`${lang}: first-generation branches must occupy a visible, balanced radial fan`);
      assert.ok(Math.max(...angularOffsets.map(Math.abs))<=.39,`${lang}: first-generation branches must occupy the full radial territory`);
      const firstRing=directChildren.map(node=>Math.hypot(node.x,node.y));
      assert.ok(firstRing.every(radius=>radius>Math.hypot(root.x,root.y)+120),`${lang}: first-generation branches must form a distinct outer ring`);
    }
  }
  assert.ok(graph.edges.filter(edge=>edge.hubLink).every(edge=>!edge.arm),lang+": the network must not be partitioned into three fixed arms");
  assert.ok(graph.edges.some(edge=>edge.generation>=2),lang+": recursive knowledge branches must carry their biological generation");
  const hierarchyEdges=graph=>graph.edges.filter(edge=>edge.fractal);
  assert.ok(hierarchyEdges(graph).every(edge=>edge.a.id===edge.b.parent),lang+": every hypha must connect a page directly to its actual parent");
  assert.ok(hierarchyEdges(graph).every(edge=>!Object.hasOwn(edge,"branchPoint")),lang+": no synthetic shared branch point may replace a real parent");
  assert.ok(hierarchyEdges(graph).every(edge=>{const length=Math.hypot(edge.b.x-edge.a.x,edge.b.y-edge.a.y);return length>=150&&length<=180;}),lang+": every hypha must grow outward from its actual parent by a consistent local segment length, rather than snapping descendants onto global concentric rings");
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
assert.ok(Number.isFinite(original.stats.maxParentEdgeStretchRatio),"Spatial relaxation must report its maximum parent-child edge stretch");
assert.ok(Number.isFinite(original.stats.minParentEdgeLengthRatio),"Spatial relaxation must report its minimum parent-child edge length ratio");
assert.ok(original.stats.maxParentEdgeStretchRatio<=1.25,"Spatial relaxation must not stretch biological parent-child connections by more than 15 percent");
assert.ok(original.stats.minParentEdgeLengthRatio>=0.75,"Spatial relaxation must not compress biological parent-child connections by more than 15 percent");
const expanded=structuredClone(fixture);
expanded[0].children.push({id:"future-knowledge-node",title:"Future knowledge",children:[]});
const grown=createPublicMycologyNetwork(expanded,{id:"mycology-center",title:"Mycology",url:hubUrls.fr});
for(const id of expected){
  const before=original.byId.get(id),after=grown.byId.get(id);
  assert.deepEqual([after.x,after.y,after.colorKey],[before.x,before.y,before.colorKey],"Adding knowledge must not move or recolor another territory");
}
assert.ok(grown.byId.get("microbiology").territoryMass>original.byId.get("microbiology").territoryMass,"Adding real content must increase only that territory mass");
assert.ok(grown.byId.get("microbiology").territoryScale>original.byId.get("microbiology").territoryScale,"Adding real content must expand its growth envelope");
assert.ok(grown.byId.get("microbiology").territoryRadius>original.byId.get("microbiology").territoryRadius,"Adding real content must expand the actual lateral territory envelope");
const envelopeProbe=fixture[0].children.find(node=>(node.children||[]).length);
assert.ok(envelopeProbe,"The microbiology fixture must include a nested branch for envelope-growth verification");
assert.ok(Math.abs(grown.byId.get(envelopeProbe.children[0].id).angle-original.byId.get(envelopeProbe.children[0].id).angle)<.05,"Content updates may gently rebalance adjacent growth lanes but must not randomly rotate stable child branches");
const originalPrimaryIds=original.nodes.filter(node=>node.rootId==="microbiology"&&node.level===1).map(node=>node.id);
const primaryAngles=graph=>originalPrimaryIds.map(id=>[id,graph.byId.get(id).angle]);
assert.ok(primaryAngles(grown).every(([id,angle],index)=>Math.abs(angle-primaryAngles(original)[index][1])<.02),"Adding a new branch may gently rebalance, but must not rotate the first-generation inoculation fan unpredictably");
assert.ok(original.stats.relaxedNodes>0,"Territory packing must relax actual branch coordinates, not only scale branch lengths");
assert.ok(original.nodes.filter(node=>node.level>0).every(node=>node.parent&&original.byId.has(node.parent)),"Every descendant must have a real parent node");
// Every sibling subtree must occupy a disjoint angular growth lane.
for(const parent of original.nodes.filter(node=>node.level>=0)){
  const children=original.nodes.filter(node=>node.parent===parent.id);
  if(children.length<2)continue;
  const lanes=children.map(child=>({id:child.id,min:child.sectorMin,max:child.sectorMax,angle:child.angle})).sort((a,b)=>a.min-b.min);
  assert.ok(lanes.every(lane=>Number.isFinite(lane.min)&&Number.isFinite(lane.max)&&lane.min<lane.max),`Children of ${parent.id} must carry bounded biological growth lanes`);
  for(let i=1;i<lanes.length;i++)assert.ok(lanes[i-1].max<=lanes[i].min+1e-8,`Sibling subtrees ${lanes[i-1].id} [${lanes[i-1].min},${lanes[i-1].max}] and ${lanes[i].id} [${lanes[i].min},${lanes[i].max}] must not occupy overlapping angular lanes`);
  assert.ok(lanes.every(lane=>lane.angle>=lane.min&&lane.angle<=lane.max),`Each branch of ${parent.id} must grow inside its own assigned lane`);
}

for(const parent of original.nodes.filter(node=>node.level>0)){
  const children=original.nodes.filter(node=>node.parent===parent.id);
  if(children.length<2)continue;
  const offsets=children.map(child=>Math.atan2(Math.sin(child.angle-parent.angle),Math.cos(child.angle-parent.angle)));
  assert.ok(offsets.every(offset=>Math.abs(offset)<=.401),`Children of ${parent.id} must fan locally around their actual parent, not around a distant shared sector axis`);
}
for(const root of expected.map(id=>original.byId.get(id))){
  const descendants=original.nodes.filter(node=>node.rootId===root.id&&node.level>0);
  for(const node of descendants){
    const parent=original.byId.get(node.parent);
    assert.ok(Math.hypot(node.x,node.y)>Math.hypot(parent.x,parent.y)+80,"Each generation must advance into a distinct outward growth ring");
    const offset=Math.atan2(Math.sin(node.angle-root.angle),Math.cos(node.angle-root.angle));
    assert.ok(Math.abs(offset)<=.39,"Every branch must remain inside its own evenly spaced radial sector");
  }
}
assert.ok(expected.every(id=>{const a=original.byId.get(id),b=createPublicMycologyNetwork(fixture,{id:"mycology-center",title:"Mycology",url:hubUrls.fr}).byId.get(id);return a.x===b.x&&a.y===b.y;}),"Spatial relaxation must preserve deterministic inoculation anchors");
assert.ok(original.nodes.filter(node=>node.level>0).some(node=>Math.hypot(node.x-original.byId.get(node.rootId).x,node.y-original.byId.get(node.rootId).y)>0),"Spatial relaxation must operate on real descendants");
assert.deepEqual(
  original.nodes.map(node=>[node.id,node.x,node.y]),
  createPublicMycologyNetwork(fixture,{id:"mycology-center",title:"Mycology",url:hubUrls.fr}).nodes.map(node=>[node.id,node.x,node.y]),
  "The same knowledge tree must always produce the same biological morphology"
);
const reordered=structuredClone(fixture);
reordered[0].children.reverse();
const reorderedGraph=createPublicMycologyNetwork(reordered,{id:"mycology-center",title:"Mycology",url:hubUrls.fr});
for(const node of original.nodes.filter(node=>node.rootId==="microbiology"&&node.level>0)){
  const counterpart=reorderedGraph.byId.get(node.id);
  assert.ok(counterpart, "Reordering source pages must not remove existing biological branches");
  assert.ok(Math.abs(counterpart.x-node.x)<.02&&Math.abs(counterpart.y-node.y)<.02, `Branch geometry for ${node.id} must be keyed to stable page identity, not child order (before ${node.x},${node.y}; after ${counterpart.x},${counterpart.y})`);
}

const explorer=readFileSync(new URL("../ecosystem/explorer-2d.js",import.meta.url),"utf8");
assert.match(explorer,/if\(n\)activateNode\(n\)/,"a single click must select and focus a node");
assert.match(explorer,/function activateNode\(n\)\{if\(!n\)return;focusNode\(n\);\}/,"node selection must not automatically navigate away");
assert.match(explorer,/selection-open-link/,"the selected node must expose an explicit Notion action");
assert.doesNotMatch(explorer,/DOUBLE-CLICK|DOUBLE CLICK|e\.detail<2/,"the public explorer must not require a double-click");
console.log("✓ public explorer single-click navigation contract");

const publicRenderer=readFileSync(new URL("../ecosystem/explorer-2d-pixi.js",import.meta.url),"utf8");
assert.match(publicRenderer,/bezierCurveTo/,"Primary and secondary hyphae must use flowing cubic morphology, not single-arc spokes");
assert.match(publicRenderer,/microbiology:0x/i,"The renderer must define the eight current universe colors, not legacy taxonomy colors");
const publicExplorer=readFileSync(new URL("../ecosystem/explorer-2d.js",import.meta.url),"utf8");
assert.match(publicExplorer,/const labelSafeEnvelope=mobile\?32:280/,"Mobile overview must reserve a compact label envelope while preserving desktop breathing room");
assert.ok(publicExplorer.includes("targetScale=clamp(Math.min(scaleX,scaleY)*1.12,.08,.72)"),"Overview must use the available viewport more fully after fitting the complete tree, without changing the graph geometry");
assert.match(publicExplorer,/const bounds=nodes\.filter\(n=>Number\.isFinite\(n\.x\)&&Number\.isFinite\(n\.y\)\)/,"Overview framing must include every real branch node, not only roots, so mobile territories cannot be clipped");

assert.match(publicExplorer,/const mobile=w<600;/,"Selected-node zoom must adapt to narrow mobile viewports instead of forcing desktop magnification");
assert.match(publicExplorer,/mobile\?Math\.min\(defaultZoom\*\.31,1\.2\):defaultZoom/,"Mobile focus must preserve surrounding branches instead of magnifying a single selected node beyond the portrait viewport");
assert.match(publicExplorer,/selected\?12:3\.2/,"The overview must allow meaningful wheel and button zoom before a node is selected");
assert.match(publicExplorer,/const zoomByLevel=\[1\.05,1\.65,2\.8,3\.8,5\.2,6\.5,8,9\.5,10\.5\]/,"Every graph generation must have a distinct, reachable focus zoom");
assert.match(publicExplorer,/mobile\?\.25:1/,"Mobile hit testing must scale its reveal thresholds with the mobile focus zoom");
assert.match(publicRenderer,/scale>threshold\*mobileLabelScaleFactor/,"Mobile labels must require deliberate zoom before revealing deeper generations");
assert.doesNotMatch(publicRenderer,/n\.identity\)continue/,"The renderer must not rely on a separate BA Labs identity node above the central mycology hub");
assert.match(publicRenderer,/const mobile=width<600/,"The public renderer must detect mobile width for readable selected labels");
assert.match(publicRenderer,/fontSize=Math.min\(11,fontSize\+1.5\)/,"Mobile labels must receive a modest readable size increase");
const publicPage=readFileSync(new URL("../ecosystem/index.html",import.meta.url),"utf8");
assert.match(publicPage,/#app\.balabs-ui #selection \.selection-context\{display:none!important\}/,"Mobile selection dock must hide long context trails that collide with the canvas and dock title");

const angularRenderer=readFileSync(new URL("../ecosystem/explorer-2d-pixi.js",import.meta.url),"utf8");
assert.match(angularRenderer,/const angularDeflection=/,"Hyphal curves must follow the actual parent-to-child angular deflection so sibling segments fan apart instead of crossing");
assert.match(angularRenderer,/const branchSign=Math\.sign\(angularDeflection\)/,"Sibling curve direction must be derived from its own biological growth lane, not random seed direction");

// Crowded second/third-generation branches must retain visible physical clearance,
// not merely non-overlapping abstract angular intervals.
const crowdedSiblingGroups=original.nodes
  .filter(parent=>parent.level>=1)
  .map(parent=>original.nodes.filter(node=>node.parent===parent.id))
  .filter(children=>children.length>=3);
assert.ok(crowdedSiblingGroups.length>0,"The real taxonomy must include multi-branch descendants for crowding verification");
for(const children of crowdedSiblingGroups){
  let nearest=Infinity;
  for(let i=0;i<children.length;i++)for(let j=i+1;j<children.length;j++){
    nearest=Math.min(nearest,Math.hypot(children[i].x-children[j].x,children[i].y-children[j].y));
  }
  assert.ok(nearest>=16, `Sibling hyphae must retain at least 16px of junction clearance; ${children[0].parent} has ${nearest.toFixed(2)}px`);
}
