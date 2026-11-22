import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createVernpixiNetwork } from '../ecosystem-core/explorer-2d-network.js';

const canonicalRoots = ['myco', 'bio', 'iot', 'soil', 'lab', 'products', 'work', 'evidence'];
const academyTree = JSON.parse(await readFile('ecosystem-preview/notion-tree.fr.json', 'utf8')).domains;
const publicTree = JSON.parse(await readFile('ecosystem/notion-tree.fr.json', 'utf8')).domains;
assert.equal(academyTree.length, 8, 'Academy must expose eight universes');
assert.equal(publicTree.length, 8, 'Public space must expose eight universes');

const academy = createVernpixiNetwork(academyTree);
const publicSpace = createVernpixiNetwork(publicTree, { rootLayoutIds: canonicalRoots });
for (let i = 0; i < 8; i++) {
  const a = academy.nodes.find(node => node.level === 0 && node.id === academyTree[i].id);
  const p = publicSpace.nodes.find(node => node.level === 0 && node.id === publicTree[i].id);
  assert.ok(a && p, 'Each space must retain its own Notion root');
  assert.equal(p.x, a.x, 'The public universe anchor X must match the Academy');
  assert.equal(p.y, a.y, 'The public universe anchor Y must match the Academy');
  assert.equal(p.colorKey, canonicalRoots[i], 'Public universe color/order must use the common Academy identity');
}
assert.ok(academy.nodes.length > 8 && publicSpace.nodes.length > 8, 'Both trees must expand beyond their eight roots');
assert.ok(publicSpace.edges.length >= publicSpace.nodes.length - 8, 'Public branches must retain their hierarchy edges');

for (const [path, label] of [
  ['ecosystem-preview/explorer-2d.js', 'Academy'],
  ['ecosystem/explorer-2d.js', 'Public']
]) {
  const source = await readFile(path, 'utf8');
  assert.match(source, /\.\.\/ecosystem-core\/explorer-2d-pixi\.js/, label + ' must use the shared Pixi renderer');
  assert.match(source, /\.\.\/ecosystem-core\/explorer-2d-network\.js/, label + ' must use the shared network geometry');
}
console.log(JSON.stringify({ sharedVernpixi: 'PASS', universes: 8, sameRootAnchors: true, academyNodes: academy.nodes.length, publicNodes: publicSpace.nodes.length }, null, 2));
