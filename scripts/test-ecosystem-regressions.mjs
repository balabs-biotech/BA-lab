import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync('ecosystem/index.html', 'utf8');
const scene = readFileSync('ecosystem/constellation-3d.js', 'utf8');

const expectedDomains = ['bio', 'myco', 'soil', 'lab', 'products', 'iot', 'work', 'learn'];
const idsMatch = scene.match(/const ids\s*=\s*\[([^\]]+)\]/);
assert.ok(idsMatch, '3D scene must declare its domain registry');
const sceneDomains = [...idsMatch[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
assert.deepEqual(sceneDomains, expectedDomains, '3D domain registry must preserve all eight domains');

const htmlDomains = [...html.matchAll(/<button[^>]*data-sphere="([^"]+)"/g)].map((match) => match[1]);
assert.deepEqual(htmlDomains, expectedDomains, 'HTML navigation must preserve the same eight domains');

const initFunctionIndex = scene.indexOf('function init(){');
const junctionPathsDeclarationIndex = scene.indexOf('let junctionPaths=[];');
assert.ok(junctionPathsDeclarationIndex >= 0 && junctionPathsDeclarationIndex < initFunctionIndex, 'Anastomosis relay paths must be declared outside init so the relay animator can access them');
assert.ok(scene.includes('junctionPaths.length=0;'), 'Anastomosis paths must be reset before the scene graph is rebuilt');
assert.ok(scene.includes('const makeNeurite'), 'Organic neurite geometry must remain present');
assert.ok(scene.toLowerCase().includes('anastomosis'), 'Cross-domain mycelial junctions must remain present');
assert.ok(scene.includes('const relayRoutes'), 'Multi-domain signal routes must remain present');
assert.ok(scene.includes('branchRelaySignals'), 'Branch signal animation must remain present');
assert.ok(scene.includes('window.enterSphere(id,false)'), '3D selection must call the shared domain navigation');
assert.ok(!scene.includes("document.querySelector('[data-sphere=\"'+id+'\"]')?.click()") && !scene.includes("document.querySelector('[data-sphere=\"'+id+'\"]').click()"), '3D selection must not proxy-click the legacy DOM menu');

assert.ok(scene.includes("root.classList.add('webgl-ready','universe-closed')"), 'The 3D scene must start in the single closed gateway state');
assert.ok(scene.includes('worldGroup.scale.setScalar(closed?.34:1)'), 'Gateway and full universe must use one scaled 3D scene');
assert.ok(scene.includes('legacy sphere fallback intentionally suppressed'), 'A WebGL failure must not silently revive legacy spheres');
assert.ok(scene.includes('webgl-load-error-panel'), 'A 3D startup failure must provide a recovery message');
assert.ok(scene.includes('importThreeWithTimeout'), 'Three.js CDN loading must have a bounded timeout');
assert.ok(scene.includes('timeoutMs=8000'), 'Three.js CDN fallback must not wait indefinitely');
for (const host of ['cdn.jsdelivr.net', 'unpkg.com', 'esm.sh']) {
  assert.ok(scene.includes(host), `Three.js fallback host missing: ${host}`);
}

assert.match(html, /#mainView\.webgl-ready[^{]*\{[^}]*height:/, 'The WebGL stage must have an explicit height');
assert.match(html, /constellation-3d\.js\?v=[^"'\s]+/, 'The 3D asset must use a cache-busting version');
assert.ok(html.includes('.webgl-ready .sphere') || html.includes('.webgl-ready .network') || html.includes('.universe-closed .sphere'), 'Legacy presentation must be controlled explicitly when WebGL is active');

console.log('Ecosystem regression checks passed: 8 domains, organic network, cross-domain signals, unified navigation, gateway state, fallback and cache version.');
