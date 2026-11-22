import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createVernpixiNetwork } from '../ecosystem-core/explorer-2d-network.js';

const languages = ['fr', 'en', 'ar', 'pt'];
const publicDomainIdentity = {
  microbiology: 'myco',
  bioprocesses: 'bio',
  instrumentation: 'iot',
  plants: 'soil',
  physical: 'lab',
  biomaterials: 'products',
  digital: 'work',
  ecology: 'learn'
};

for (const lang of languages) {
  const academyTree = JSON.parse(await readFile(`ecosystem-preview/notion-tree.${lang}.json`, 'utf8')).domains;
  const publicTree = JSON.parse(await readFile(`ecosystem/notion-tree.${lang}.json`, 'utf8')).domains;
  assert.equal(academyTree.length, 8, `${lang}: Academy must expose eight universes`);
  assert.equal(publicTree.length, 8, `${lang}: Public space must expose eight universes`);

  const publicLayoutIds = publicTree.map(root => root.academyUniverseId);
  assert.deepEqual(publicLayoutIds, academyTree.map(root => root.id),
    `${lang}: public roots must follow the Academy's canonical locale order`);
  for (const root of publicTree) {
    assert.equal(root.academyUniverseId, publicDomainIdentity[root.id],
      `${lang}: ${root.id} must map to its semantically corresponding Academy universe`);
    const academyRoot = academyTree.find(item => item.id === root.academyUniverseId);
    assert.equal(root.title, academyRoot.title,
      `${lang}: public root title must exactly match the Academy identity`);
  }
  assert.equal(new Set(publicLayoutIds).size, 8, `${lang}: canonical universe mappings must be unique`);

  const academy = createVernpixiNetwork(academyTree);
  const publicSpace = createVernpixiNetwork(publicTree, { rootLayoutIds: publicLayoutIds });
  for (let i = 0; i < 8; i++) {
    const a = academy.nodes.find(node => node.level === 0 && node.id === academyTree[i].id);
    const p = publicSpace.nodes.find(node => node.level === 0 && node.id === publicTree[i].id);
    assert.ok(a && p, `${lang}: each space must retain its own Notion root`);
    assert.equal(p.x, a.x, `${lang}: public universe anchor X must match Academy`);
    assert.equal(p.y, a.y, `${lang}: public universe anchor Y must match Academy`);
    assert.equal(p.colorKey, academyTree[i].id, `${lang}: public universe color must use Academy identity`);
  }
  assert.ok(publicSpace.nodes.length > 8, `${lang}: public science branches must remain present`);
  assert.ok(publicSpace.edges.length >= publicSpace.nodes.length - 8,
    `${lang}: public branches must retain hierarchy edges`);
}

for (const [path, label] of [
  ['ecosystem-preview/explorer-2d.js', 'Academy'],
  ['ecosystem/explorer-2d.js', 'Public']
]) {
  const source = await readFile(path, 'utf8');
  assert.match(source, /\.\.\/ecosystem-core\/explorer-2d-pixi\.js/, `${label} must use the shared Pixi renderer`);
  assert.match(source, /\.\.\/ecosystem-core\/explorer-2d-network\.js/, `${label} must use the shared network geometry`);
}
const publicController = await readFile('ecosystem/explorer-2d.js', 'utf8');
assert.match(publicController, /root\.academyUniverseId/,
  'Public layout must use explicit per-root Academy identity, never array-order assumptions');
console.log(JSON.stringify({ sharedVernpixi: 'PASS', languages, universesPerLanguage: 8, academyAlignedAnchors: true }, null, 2));
