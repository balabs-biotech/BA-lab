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
assert.equal(publicSpace.edges.filter(edge=>edge.hubLink).length,8,'The mycology hub must connect directly to all eight public universes');
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
assert.match(publicSource,/\.\.\/ecosystem-core\/explorer-2d-pixi\.js/,'The public site may reuse the shared Pixi renderer');
assert.match(publicSource,/\.\/explorer-2d-graph\.js/,'The public site must use its dedicated mycology-centered graph');
assert.doesNotMatch(publicSource,/\.\.\/ecosystem-core\/explorer-2d-network\.js/,'The public site must not use the Academy graph geometry');
console.log(JSON.stringify({academy:'shared Vernpixi unchanged',public:'dedicated mycology hub + eight universes',academyNodes:academy.nodes.length,publicNodes:publicSpace.nodes.length},null,2));
