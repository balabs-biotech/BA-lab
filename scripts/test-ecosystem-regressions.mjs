import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync('ecosystem/index.html', 'utf8');
const engine = readFileSync('ecosystem/engine-v2.js', 'utf8');
const expectedDomains = ['bio', 'myco', 'soil', 'lab', 'products', 'iot', 'work', 'learn'];

assert.ok(html.includes('engine-v2.js?v=20261102-clean-core-v2'), 'Public explorer must load the clean v2 engine');
assert.ok(!html.includes('constellation-3d.js?v='), 'Legacy monolithic engine must no longer be loaded');
assert.ok(engine.includes("const IDS = ['bio','myco','soil','lab','products','iot','work','learn']"), 'The clean engine must own the complete eight-domain registry');
const htmlDomains = [...html.matchAll(/<button[^>]*data-sphere="([^"]+)"/g)].map(match => match[1]);
assert.deepEqual(htmlDomains, expectedDomains, 'Public HTML must preserve all eight domains');

assert.ok(engine.includes('function createWorld()'), 'The new engine must build its own biological network scene');
assert.ok(engine.includes('makeCellGeometry'), 'Domain nodes must use organic cell geometry');
assert.ok(engine.includes('const LINKS ='), 'The network must define explicit cross-domain connections');
for (const [a,b] of [['bio','myco'],['myco','soil'],['soil','lab'],['lab','iot'],['lab','products'],['products','work'],['work','iot'],['products','learn']]) {
  assert.ok(engine.includes("['" + a + "','" + b + "']"), 'Missing cross-domain link ' + a + ' → ' + b);
}
assert.ok(engine.includes('signalPoints'), 'Cross-domain links must carry animated signal points');
assert.ok(engine.includes('new THREE.TubeGeometry'), 'Organic connections must be rendered as continuous neurites');

assert.ok(engine.includes('stage.addEventListener(\'pointerdown\',onPointerDown)'), 'Pointer input must be attached to the new stage');
assert.ok(engine.includes("document.addEventListener('pointerup',onPointerUp,true)"), 'Tap selection must be captured at document level');
assert.ok(engine.includes('stage.addEventListener(\'wheel\''), 'Desktop wheel zoom must be supported');
assert.ok(engine.includes('pinchStart'), 'Mobile pinch zoom must be supported');
assert.ok(engine.includes('function resize()'), 'The engine must resize its renderer and camera');
assert.ok(engine.includes('cameraPosition();'), 'Camera state must be reapplied after resize instead of resetting zoom');
assert.ok(engine.includes('function smoothCamera('), 'Domain navigation must use a smooth camera transition');
assert.ok(engine.includes('function goOverview()'), 'The user must be able to return to the overview');
assert.ok(engine.includes('function enterDomain(id)'), 'Domain entry must be implemented in the new engine');
assert.ok(engine.includes('Prefer the nearest visible semantic target in screen space'), 'Cell and branch taps must resolve by nearest visible screen target');
assert.ok(engine.includes('if(selected&&distance>10.4){goOverview();return}'), 'Mobile pinch zoom-out must return from a domain to the overview');
assert.ok(engine.includes('if(selected&&e.deltaY>0&&nextDistance>10.4){goOverview();return}'), 'Desktop wheel zoom-out must return from a domain to the overview');
assert.ok(!engine.includes('const bg=new THREE.BufferGeometry()'), 'The opening network must avoid decorative starfield geometry');

assert.ok(engine.includes("fetch('./notion-tree.'+LANG()+'.json'"), 'The engine must load the active language Notion tree');
assert.ok(engine.includes('function flattenTree('), 'Notion page hierarchy must be preserved as nested branches');
assert.ok(engine.includes('new THREE.SphereGeometry(.46,12,10)'), 'Every resource branch must have a generous touch target');
assert.ok(engine.includes('function openResource(item)'), 'Branch selection must open an in-scene details panel');
assert.ok(engine.includes("open.dataset.resourceOpen='true'"), 'The Notion link must be an explicit action, not an automatic redirect');
assert.ok(engine.includes("back.dataset.resourceClear='true'"), 'The selected branch must offer an in-scene return action');
assert.ok(engine.includes('btn.dataset.world=other'), 'Related domains must remain navigable from the focus panel');
assert.ok(engine.includes('window.enterSphere(id,false,true)'), 'Domain selection must synchronize the hidden Notion content source');
assert.ok(engine.includes('window.__BALABS_3D_E2E__'), 'The browser smoke test must be able to inspect the live scene');

console.log('Clean 3D engine regression checks passed: eight domains, mycelial topology, animated signals, stable camera, desktop/mobile controls, hierarchical Notion branches and explicit page actions.');
