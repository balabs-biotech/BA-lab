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
const pairBlock = scene.match(/const pairs=\[([\s\S]*?)\n      \];/);
assert.ok(pairBlock, 'The 3D network must declare its cross-domain topology');
const relationPairs = [...pairBlock[1].matchAll(/\['(bio|myco|soil|lab|products|iot|work|learn)','(bio|myco|soil|lab|products|iot|work|learn)'\]/g)].map((match) => [match[1], match[2]]);
assert.equal(relationPairs.length, 8, 'Cross-domain topology must remain sparse and legible');
const topology = new Set(relationPairs.map(([a, b]) => [a, b].sort().join(':')));
for (const edge of [['bio','myco'],['myco','soil'],['soil','lab'],['lab','iot'],['lab','products'],['products','work'],['work','iot'],['products','learn']]) {
  assert.ok(topology.has(edge.slice().sort().join(':')), `Missing local network connection: ${edge.join(' → ')}`);
}
assert.ok(scene.includes('const relayRoutes'), 'Multi-domain signal routes must remain present');
assert.ok(scene.includes('branchRelaySignals'), 'Branch signal animation must remain present');
assert.ok(scene.includes('window.enterSphere(id,false)'), '3D selection must call the shared domain navigation');
assert.ok(!scene.includes("document.querySelector('[data-sphere=\"'+id+'\"]')?.click()") && !scene.includes("document.querySelector('[data-sphere=\"'+id+'\"]').click()"), '3D selection must not proxy-click the legacy DOM menu');

assert.ok(scene.includes("root.classList.add('webgl-ready','universe-closed')"), 'The 3D scene must start in the single closed gateway state');
assert.ok(scene.includes('worldGroup.scale.set(closed?.72:(camera?.aspect<.78?.98:1.32),closed?.72:(camera?.aspect<.78?1.18:1.32),closed?.72:(camera?.aspect<.78?1.02:1.32))'), 'Gateway and full universe must use one responsive scaled 3D scene with a readable mobile scale');
assert.ok(scene.includes('THREE.MathUtils.clamp(dist+delta*.012,3.2,120)'), '3D wheel navigation must support a long-range overview zoom');
assert.ok(scene.includes('makeLabel(labels[id].title,0xf5f7fa,29)') && scene.includes('label.scale.set(Math.min(4.25,Math.max(2.25,labels[id].title.length*.135)),.67,1)'), 'Domain labels must remain prominent at overview scale');
assert.ok(scene.includes('return camera?.aspect<.78?8.8:camera?.aspect<1.05?10.2:11'), 'Mobile overview must frame the network at a useful initial scale while preserving long-range zoom');
assert.ok(html.includes('class="linknode ln1" href="#"') && html.includes('target="_blank"'), 'Domain resource nodes must be real links that open their matching Notion pages');
assert.ok(html.includes('a.href=p[1]') && html.includes('a.onclick=null'), 'Domain resource links must preserve the exact page URL without intercepting navigation');
assert.ok(scene.includes('legacy sphere fallback intentionally suppressed'), 'A WebGL failure must not silently revive legacy spheres');
assert.ok(scene.includes('webgl-load-error-panel'), 'A 3D startup failure must provide a recovery message');
const tree = JSON.parse(readFileSync('ecosystem/notion-tree.fr.json', 'utf8'));
assert.equal(tree.version, 1, 'Notion tree manifest must use the supported schema version');
assert.equal(tree.language, 'fr', 'The French tree manifest must identify its language');
assert.ok(Array.isArray(tree.domains), 'Notion tree manifest must expose domain roots');
for (const domain of tree.domains) {
  assert.ok(expectedDomains.includes(domain.id), `Unknown domain in Notion tree: ${domain.id}`);
  const visit = (node) => {
    assert.ok(node.id && node.title && node.notionId && node.url, 'Every Notion node must have a stable ID, title, Notion ID and exact URL');
    assert.match(node.url, /^https:\/\/app\.notion\.com\/p\/[a-f0-9]+$/i, 'Every Notion node must point to its exact public Notion page');
    for (const child of node.children || []) visit(child);
  };
  visit(domain);
}
assert.ok(scene.includes("new URL('./notion-tree.'+lang+'.json'"), '3D engine must load a language-specific Notion tree manifest');
const curatedMatch = scene.match(/const curatedByLanguage=\{([\s\S]*?)\n      \};/);
assert.ok(curatedMatch, 'Learning universe must define language-specific curated resources');
const curatedIds = {};
for (const line of curatedMatch[1].split('\n')) {
  const entry = line.match(/^\s*(fr|ar|en|pt):\[(.*?)\]/);
  if (entry) curatedIds[entry[1]] = [...entry[2].matchAll(/'([^']+)'/g)].map((match) => match[1]);
}
for (const language of ['fr', 'ar', 'en', 'pt']) {
  const localizedTree = JSON.parse(readFileSync(`ecosystem/notion-tree.${language}.json`, 'utf8'));
  const nodes = [];
  const collect = (node, parent = null) => {
    nodes.push({ ...node, parent });
    for (const child of node.children || []) collect(child, node);
  };
  localizedTree.domains.forEach((domain) => collect(domain));
  const urls = nodes.map((node) => node.url);
  assert.equal(new Set(urls).size, urls.length, `The ${language} tree must not duplicate Notion page URLs`);
  for (const node of nodes) {
    assert.equal(node.notionId.toLowerCase(), node.url.split('/').pop().toLowerCase(), `The ${language} Notion ID and URL must match for ${node.id}`);
    if (node.parent) assert.notEqual(node.url, node.parent.url, `The ${language} child ${node.id} must not link back to its parent page`);
  }
  const ids = new Set(nodes.map((node) => node.id));
  assert.ok(curatedIds[language]?.length === 8, `The ${language} learning collection must contain eight curated resources`);
  for (const id of curatedIds[language]) assert.ok(ids.has(id), `Missing ${language} learning resource: ${id}`);
}

for (const language of ['ar', 'en', 'pt']) {
  const localizedTree = JSON.parse(readFileSync(`ecosystem/notion-tree.${language}.json`, 'utf8'));
  assert.equal(localizedTree.version, 1, `The ${language} Notion tree must use the supported schema version`);
  assert.equal(localizedTree.language, language, `The ${language} tree must identify its language`);
  assert.ok(Array.isArray(localizedTree.domains), `The ${language} tree must expose domain roots`);
  for (const domain of localizedTree.domains) {
    assert.ok(expectedDomains.includes(domain.id), `Unknown ${language} domain: ${domain.id}`);
    const visitLocalized = (node) => {
      assert.ok(node.id && node.title && node.notionId && node.url, `Every ${language} Notion node must have an ID, title, Notion ID and URL`);
      assert.match(node.url, /^https:\/\/app\.notion\.com\/p\/[a-f0-9]+$/i, `Every ${language} node must use an exact public Notion page URL`);
      for (const child of node.children || []) visitLocalized(child);
    };
    visitLocalized(domain);
  }
}

assert.ok(scene.includes("if(!rootPage?.children?.length)"), 'A language with no mapped child pages must show a transparent empty-state in the selected domain panel');
assert.ok(scene.includes('Aucune page de branche n’est encore reliée à cet univers dans cette langue.') && scene.includes('No branch pages are linked to this world in this language yet.') && scene.includes('لا توجد صفحات فروع مرتبطة بهذا العالم بهذه اللغة حتى الآن.') && scene.includes('Ainda não há páginas de ramificação ligadas a este universo neste idioma.'), 'Empty branch state must be localized for French, English, Arabic and Portuguese');
assert.ok(scene.includes('const visit=(node,depth=0,parentId=domainTree.id'), '3D engine must recursively expand nested Notion pages');
assert.ok(scene.includes('data-notion-tree-node="true"'), 'Manifest nodes must be injected into the 3D resource layer');
assert.ok(scene.includes('parentId:a.dataset.parentId') && scene.includes('depth:Number(a.dataset.depth||0)'), '3D resource nodes must retain their hierarchy metadata');
assert.ok(scene.includes('notionTreeReady.then('), '3D resource nodes must refresh when the manifest finishes loading');
assert.ok(scene.includes("const resourceHit=hits.find(hit=>hit.object.userData?.kind==='resource'||hit.object.userData?.kind==='resource-label')"), 'Clickable Notion branches must take priority over decorative neurites and domain geometry during raycasting');
assert.ok(scene.includes('return resourceHit?[resourceHit,...hits.filter(hit=>hit!==resourceHit)]:hits'), 'A branch hit must be selected even when a decorative object is closer to the camera');
assert.ok(scene.includes("if(!moved)pick(e)"), 'A stationary pointer release must trigger the 3D picking handler');
assert.ok(scene.includes("kind:'resource-label'"), 'The visible title of each Notion branch must be independently clickable');
assert.ok(scene.includes("window.open(targetUrl.href,'_blank')"), 'Selecting a 3D branch must open its exact Notion URL in a new tab');
assert.ok(scene.includes("targetUrl.protocol!=='https:'&&targetUrl.protocol!=='http:'"), '3D branch navigation must reject non-web URL schemes');
assert.ok(scene.includes('importThreeWithTimeout'), 'Three.js CDN loading must have a bounded timeout');
assert.ok(scene.includes('timeoutMs=8000'), 'Three.js CDN fallback must not wait indefinitely');
for (const host of ['cdn.jsdelivr.net', 'unpkg.com', 'esm.sh']) {
  assert.ok(scene.includes(host), `Three.js fallback host missing: ${host}`);
}

assert.match(html, /#mainView\.webgl-ready[^{]*\{[^}]*height:/, 'The WebGL stage must have an explicit height');
assert.match(html, /constellation-3d\.js\?v=[^"'\s]+/, 'The 3D asset must use a cache-busting version');
assert.ok(html.includes('.webgl-ready .sphere') || html.includes('.webgl-ready .network') || html.includes('.universe-closed .sphere'), 'Legacy presentation must be controlled explicitly when WebGL is active');

console.log('Ecosystem regression checks passed: 8 domains, organic network, Notion tree hierarchy, exact URLs, cross-domain signals, unified navigation, gateway state, fallback and cache version.');

assert.ok(scene.includes('function domainViewDistance(id)') && scene.includes('const rings=Math.max(1,Math.ceil(maxSiblings/12))'), 'Selected domains must adapt camera distance to their actual branch count and hierarchy');
assert.ok(scene.includes('const zoomArc=Math.min(2.2,travelDistance*.12+Math.abs(endDist-dist)*.09)'), 'Long 3D transitions must create a restrained zoom-out arc between the overview and selected domain');
assert.ok(scene.includes('const duration=Math.min(1900,Math.max(1050,(target?1120:980)+travelDistance*95+Math.abs(endDist-dist)*35))'), '3D transition duration must adapt to travel distance and zoom change');
assert.ok(scene.includes('Math.sin(Math.PI*e)*transition.zoomArc'), 'The camera zoom arc must ease out and return smoothly during the transition');
assert.ok(scene.includes("const b=e.target.closest('button[data-world]');if(b){const targetId=b.dataset.world,node=points.find(point=>point.id===targetId),sourceId=selected;if(!node)return;if(sourceId){if(!routeTrail.length)routeTrail=[sourceId];const existing=routeTrail.indexOf(targetId);"), 'Cross-domain links must resolve their target, append it to the current route and clear the previous branch selection');
assert.ok(scene.includes("flyTo(node.mesh,()=>{if(typeof window.enterSphere==='function')window.enterSphere(targetId,false);requestAnimationFrame(()=>requestAnimationFrame(()=>buildResourceNodes(targetId)))"), 'Cross-domain navigation must fly the camera to the destination before opening its branch map');
assert.ok(scene.includes("notionTreeReady.then(()=>{if(notionTreeManifest&&selected===targetId"), 'Cross-domain navigation must also populate branches when the localized Notion manifest finishes loading');
assert.ok(scene.includes('else if(routeTrail[routeTrail.length-1]!==targetId)routeTrail.push(targetId)'), 'Cross-domain navigation must append successive domains to a persistent multi-hop trail');
assert.ok(scene.includes('if(existing>=0)routeTrail=routeTrail.slice(0,existing+1)'), 'Returning to an earlier domain must truncate the route instead of creating a loop');
assert.ok(scene.includes('routeIndex=routeActive&&e.relation?routeTrail.findIndex((id,index)=>index<routeTrail.length-1&&((id===e.aId&&routeTrail[index+1]===e.bId)||(id===e.bId&&routeTrail[index+1]===e.aId))):-1,routeEdge=routeIndex>=0'), 'Only connections belonging to the visited multi-hop trail should receive route emphasis');
assert.ok(scene.includes('const reverse=routeEdge?routeTrail[routeIndex]===e.bId:'), 'Cross-domain signal pulses must preserve direction along every segment of the multi-hop trail');
assert.ok(scene.includes('routeTrail=[];flyTo(null'), 'Returning to the overview must clear the previous multi-hop route');
assert.ok(scene.includes('const ringSize=12,ring=siblings>ringSize?Math.floor(siblingIndex/ringSize):0') && scene.includes('2.45+ring*1.25'), 'Large branch families must spread across concentric organic rings instead of colliding on one circle');
assert.ok(scene.includes('siblings>ringSize?1.28:1.95'), 'Dense branch families must use narrower labels to reduce overlap');
