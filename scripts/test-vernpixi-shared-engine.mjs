import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createVernpixiNetwork } from '../ecosystem-core/explorer-2d-network.js';
import { createPublicMycologyNetwork } from '../ecosystem/explorer-2d-graph.js';

const academyTree=JSON.parse(await readFile('ecosystem-preview/notion-tree.fr.json','utf8')).domains;
const publicTree=JSON.parse(await readFile('ecosystem/notion-tree.fr.json','utf8')).domains;
assert.equal(academyTree.length,8,'Academy must retain its eight departments/universes');
assert.equal(publicTree.length,8,'The public website must expose eight scientific universes');

const academy=createVernpixiNetwork(academyTree);
assert.ok(academy.nodes.length>8,'Academy must retain its independent shared-engine graph');
assert.ok(academy.edges.length>=academy.nodes.length-8,'Academy hierarchy edges must remain intact');

const hub={id:'mycology-center',title:'Mycology',description:'BA Labs mycology hub',url:'https://app.notion.com/p/3e273152f1718161b154d8b8fc50f063'};
const publicSpace=createPublicMycologyNetwork(publicTree,hub);
assert.equal(publicSpace.stats.universeCount,8);
assert.equal(publicSpace.byId.get('mycology-center').data.url,hub.url);
assert.equal(publicSpace.byId.get('balabs-identity').title,'BA Labs','The BA Labs identity node must be the geometric center');
assert.ok(publicSpace.edges.some(edge=>edge.identityLink&&edge.a.id==='balabs-identity'&&edge.b.id==='mycology-center'),'The brand identity must connect directly to the mycology core');
assert.equal(publicSpace.stats.inoculationPoints,8,'The public network must expose eight independent inoculation points');
assert.equal(publicSpace.edges.filter(edge=>edge.hubLink&&edge.primaryHypha).length,8,'The mycology tissue must connect to all eight universes through primary hyphae');
assert.ok(publicSpace.edges.filter(edge=>edge.hubLink).every(edge=>!('arm' in edge)),'The public graph must not partition territories into fixed arms');
assert.ok(publicSpace.edges.some(edge=>edge.fractal&&edge.generation>=1),'The public graph must mark knowledge branches as fractal growth');
for(const universe of publicTree){
  const node=publicSpace.byId.get(universe.id);
  assert.ok(node,'Every public Notion universe must be present');
  assert.equal(node.parent,'mycology-center');
  assert.equal(node.level,0);
}
assert.ok(publicSpace.nodes.length>9,'The public graph must expand beyond its center and eight universe nodes');

const academySource=await readFile('ecosystem-preview/explorer-2d.js','utf8');
const publicSource=await readFile('ecosystem/explorer-2d.js','utf8');
assert.match(academySource,/\.\.\/ecosystem-core\/explorer-2d-pixi\.js/,'Academy must retain the shared Pixi renderer');
assert.match(academySource,/\.\.\/ecosystem-core\/explorer-2d-network\.js/,'Academy must retain the shared Vernpixi graph geometry');
const sharedRenderer=await readFile('ecosystem-core/explorer-2d-pixi.js','utf8');
assert.match(sharedRenderer,/myco:0xb18fc2/,'The Academy mycology palette token must remain unchanged');
assert.doesNotMatch(sharedRenderer,/publicCore|branchPoint|drawnArms|upper-left|upper-right/,'The Academy renderer must remain free of public-only logo and branch geometry');
const publicRenderer=await readFile('ecosystem/explorer-2d-pixi.js','utf8');
assert.match(publicSource,/\.\/explorer-2d-pixi\.js/,'The public site must use its own renderer implementation');
assert.doesNotMatch(publicRenderer,/drawnArms|upper-left|upper-right/,'The rebuilt public renderer must not contain legacy three-arm geometry');
assert.doesNotMatch(publicRenderer,/const count=depth===1\?4:depth===2\?3:2/,'The public renderer must not invent decorative branches that have no graph data');
assert.match(publicRenderer,/primaryHypha|generation/,'The public renderer must distinguish biological filament generations');
assert.match(publicRenderer,/const lineageWidth=level=>level<=0\?4\.1:level===1\?2\.75:level===2\?1\.8:level===3\?1\.15:\.72;/,'Public hyphae must use a strictly decreasing five-generation lineage width scale');
assert.match(publicRenderer,/e\.primaryHypha\?lineageWidth\(0\):lineageWidth\(e\.b\.level\)/,'Each hierarchy edge must inherit the width of the generation it introduces');
assert.match(publicRenderer,/lineageWidth\(parent\.level\+1\)/,'Shared pre-bifurcation trunks must retain the thickness of their child generation');
assert.match(publicRenderer,/e\.verified\?\.82:e\.cross\?\.48/,'Documented transverse relations must remain thinner than every hierarchical branch');
assert.match(publicRenderer,/if\(e\.cross&&!selectedRelation&&scale<3\)continue/,'Documented cross-territory anastomoses must stay quiet in the global overview and reveal progressively');
assert.match(publicRenderer,/e\.primaryHypha\?Math\.min\(210,len\*\.36\)/,'Primary hyphae must use broad organic curvature rather than straight radial spokes');
assert.match(publicSource,/\.\/explorer-2d-graph\.js/,'The public site must use its dedicated mycology-centered graph');
assert.doesNotMatch(publicSource,/\.\.\/ecosystem-core\/explorer-2d-network\.js/,'The public site must not use the Academy graph geometry');
console.log(JSON.stringify({academy:'shared Vernpixi unchanged',public:'dedicated mycology core + eight-point fractal growth',academyNodes:academy.nodes.length,publicNodes:publicSpace.nodes.length},null,2));
