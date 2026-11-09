import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync('ecosystem/index.html', 'utf8');
const engine = readFileSync('ecosystem/engine-v2.js', 'utf8');
const previewEngine = readFileSync('ecosystem-preview/engine-v2.js', 'utf8');
const expectedDomains = ['bio', 'myco', 'soil', 'lab', 'products', 'iot', 'work', 'learn'];

assert.ok(html.includes('engine-v2.js?v=20261102-clean-core-v2'), 'Public explorer must load the clean v2 engine');
assert.ok(!html.includes('constellation-3d.js?v='), 'Legacy monolithic engine must no longer be loaded');
assert.ok(engine.includes("const IDS = ['bio','myco','soil','lab','products','iot','work','learn']"), 'The clean engine must own the complete eight-domain registry');
const htmlDomains = [...html.matchAll(/<button[^>]*data-sphere="([^"]+)"/g)].map(match => match[1]);
assert.deepEqual(htmlDomains, expectedDomains, 'Public HTML must preserve all eight domains');

for (const language of ['fr', 'ar', 'en', 'pt']) {
  const tree = JSON.parse(readFileSync('ecosystem/notion-tree.' + language + '.json', 'utf8'));
  assert.deepEqual(tree.domains.map(domain => domain.id).sort(), [...expectedDomains].sort(), language + ' manifest must expose all eight universes');
  const knowledgeHub = tree.domains.find(domain => domain.id === 'learn');
  assert.ok(!knowledgeHub.url && !knowledgeHub.notionId, language + ' knowledge-transfer hub must not invent a parent Notion destination');
  assert.equal(knowledgeHub.children?.length, 4, language + ' knowledge-transfer universe must expose four public resource links');
  for (const resource of knowledgeHub.children) {
    assert.ok(/^https:\/\/app\.notion\.com\/p\/[a-f0-9]{32}$/.test(resource.url), language + ' knowledge resource must use a verified Notion page URL');
    assert.ok(!resource.notionId, language + ' cross-domain resource links must not duplicate source-page identifiers');
  }
  for (const domain of tree.domains.filter(item => item.id !== 'learn')) {
    assert.ok(domain.notionId && domain.url === 'https://app.notion.com/p/' + domain.notionId, language + ' domain ' + domain.id + ' must point to its matching Notion page');
  }
  const seen = new Set();
  const walk = nodes => nodes.forEach(node => {
    if (node.notionId) {
      assert.ok(!seen.has(node.notionId), language + ' manifest must not duplicate Notion page ' + node.notionId);
      seen.add(node.notionId);
    }
    walk(node.children || []);
  });
  walk(tree.domains);
}
const enTree = JSON.parse(readFileSync('ecosystem/notion-tree.en.json', 'utf8'));
const ptTree = JSON.parse(readFileSync('ecosystem/notion-tree.pt.json', 'utf8'));
for (const [language, tree, mycologyId, fungalId] of [
  ['en', enTree, '40173152f17181019838de83de8173f3', '40173152f1718111a73ced2825985454'],
  ['pt', ptTree, '40173152f171814dad1adcd7559c7823', '40173152f171812fb8d5de62178f6aef'],
]) {
  const mycology = tree.domains.find(domain => domain.id === 'myco');
  assert.equal(mycology.notionId, mycologyId, language + ' mycology universe must start at the actual Mycology parent page');
  assert.ok(mycology.children.some(child => child.notionId === fungalId), language + ' Fungal resources must be nested under Mycology');
  assert.equal(mycology.notionParentId, 'hub', language + ' mycology page must retain its verified BA Labs hub parent');
  assert.equal(tree.hub?.parentId, 'language', language + ' BA Labs hub must retain its language-root parent');
}
assert.equal(ptTree.domains.find(domain => domain.id === 'bio').notionId, '40173152f1718120b45bf79f8e81120a', 'Portuguese biotechnology universe must point to the actual Biotecnologia page, not its parent hub');

assert.ok(engine.includes('function createWorld()'), 'The new engine must build its own biological network scene');
assert.ok(engine.includes("ctx.font='700 '+(size*4)+'px Inter,system-ui,sans-serif'"), '3D labels must use enlarged, heavier glyphs that remain readable when zoomed');
assert.ok(engine.includes('lineHeight=142'), 'Multi-line 3D labels must retain sufficient vertical spacing at the larger font size');
assert.ok(previewEngine.includes("ctx.font='700 '+(size*4)+'px Inter,system-ui,sans-serif'"), 'Preview 3D labels must use the same enlarged, heavier glyphs');
assert.ok(previewEngine.includes('lineHeight=142'), 'Preview multiline labels must use matching vertical spacing');
assert.ok(engine.includes("const soma=new THREE.Group();soma.userData={id,kind:'domain'};group.add(soma);"), 'Domain centres must remain open mycelial junctions rather than solid cell bodies');
assert.ok(engine.includes('Sparse background hyphae connect the field'), 'The overview must contain fine background mycelial connections');
assert.ok(engine.includes('for(let j=0;j<14;j++)'), 'Domain branches must retain dense radial connectivity');
assert.ok(engine.includes('const LINKS ='), 'The network must define explicit cross-domain connections');
for (const [a,b] of [['bio','myco'],['myco','soil'],['soil','lab'],['lab','iot'],['lab','products'],['products','work'],['work','iot'],['products','learn']]) {
  assert.ok(engine.includes("['" + a + "','" + b + "']"), 'Missing cross-domain link ' + a + ' → ' + b);
}
assert.ok(engine.includes('signalPoints'), 'Cross-domain links must carry animated signal points');
assert.ok(engine.includes('new THREE.TubeGeometry'), 'Organic connections must be rendered as continuous neurites');

assert.ok(engine.includes('stage.addEventListener(\'pointerdown\',onPointerDown)'), 'Pointer input must be attached to the new stage');
assert.ok(engine.includes("document.addEventListener('pointerup',onPointerUp,true)"), 'Tap selection must be captured at document level');
assert.ok(engine.includes('stage.addEventListener(\'wheel\''), 'Desktop wheel zoom must be supported');
assert.ok(engine.includes("stage.setAttribute('aria-keyshortcuts','ArrowUp ArrowDown ArrowLeft ArrowRight + - Escape Backspace Home')"), 'The 3D stage must advertise keyboard navigation shortcuts');
assert.ok(engine.includes("renderer.domElement.setAttribute('tabindex','0')"), 'The 3D canvas must be keyboard focusable');
assert.ok(engine.includes("canvas:focus-visible{outline:2px solid #d1d0c5"), 'Keyboard focus must be visibly indicated on the 3D canvas');
assert.ok(engine.includes("if(key==='ArrowLeft')theta-=.12"), 'Keyboard arrows must rotate and navigate the 3D view');
assert.ok(engine.includes("else if(key==='Home'){goOverview();return}"), 'The Home key must return to the network overview');
assert.ok(previewEngine.includes("stage.setAttribute('aria-keyshortcuts','ArrowUp ArrowDown ArrowLeft ArrowRight + - Escape Backspace Home')"), 'Preview engine must expose the same keyboard navigation');
assert.ok(engine.includes('pinchStart'), 'Mobile pinch zoom must be supported');
assert.ok(engine.includes('function resize()'), 'The engine must resize its renderer and camera');
assert.ok(engine.includes('cameraPosition();'), 'Camera state must be reapplied after resize instead of resetting zoom');
assert.ok(engine.includes('function smoothCamera('), 'Domain navigation must use a smooth camera transition');
assert.ok(engine.includes('function goOverview()'), 'The user must be able to return to the overview');
assert.ok(engine.includes('function enterDomain(id)'), 'Domain entry must be implemented in the new engine');
assert.ok(engine.includes('The active folder owns all taps while inside a universe'), 'A selected universe must not let adjacent domains steal folder taps');
assert.ok(engine.includes('nearestLabelDistance<(window.innerWidth<760?58:70)'), 'Folder taps must resolve against the visible labels of the active hierarchy without stealing adjacent branches');
assert.ok(engine.includes('if(selected&&distance>9.5){goBackLevel();return}'), 'Mobile pinch zoom-out must return one folder level at a time');
assert.ok(engine.includes('if(selected&&e.deltaY>0&&nextDistance>9.5){goBackLevel();return}'), 'Desktop wheel zoom-out must return one folder level at a time');
assert.ok(!engine.includes('const bg=new THREE.BufferGeometry()'), 'The opening network must avoid decorative starfield geometry');

assert.ok(engine.includes("fetch('./notion-tree.'+LANG()+'.json'"), 'The engine must load the active language Notion tree');
assert.ok(engine.includes('const maxDepth=2'), 'The spatial graph must preview multiple nested Notion levels');
assert.ok(engine.includes('const drawNode=(item,pos,depth,parent,angle,index)=>'), 'Every rendered node must preserve its position in the real Notion hierarchy');
assert.ok(engine.includes("const l=makeResourceLabel(data,color,depth);"), 'Every visible hierarchy depth, including depth two, must display its folder or page label');
assert.ok(engine.includes('drawNode(child,childPos,depth+1,item,childAngle,childIndex)'), 'Nested folders and pages must be drawn recursively');
assert.ok(engine.includes('function navigateToStack(index)'), 'Breadcrumbs must navigate to previously visited folder levels');
assert.ok(engine.includes('function goBackLevel()'), 'The previous-level control must navigate up the Notion hierarchy');
assert.ok(engine.includes("nav.className='webgl-path'"), 'The scene must use compact spatial breadcrumbs instead of a resource table');
assert.ok(engine.includes('const hitRadius=depth===0?.32:depth===1?.25:.19'), 'Every hierarchy depth must keep a generous touch target');
assert.ok(engine.includes('function openResource(item)'), 'Branch selection must drill into folders or open terminal pages');
assert.ok(engine.includes('nearestLabelDistance<(window.innerWidth<760?58:70)'), 'Mobile and desktop label hit radii must stay narrow enough to avoid selecting adjacent branches');
assert.ok(engine.includes("if(data.children?.length){"), 'Folders with children must open a deeper spatial level');
assert.ok(engine.includes('const ancestors=[];let parent=data.parentNode'), 'Directly selected nested folders must preserve every ancestor in the breadcrumb stack');
assert.ok(engine.includes("if(data.url){window.open(data.url"), 'Terminal pages must open their corresponding Notion page');
assert.ok(!engine.includes("open.dataset.resourceOpen='true'"), 'The obsolete resource details panel must not be used for navigation');
assert.ok(engine.includes("data-camera=\"back\""), 'The scene must expose a direct previous-level control');
assert.ok(engine.includes("if(action==='out'){if(selected){goBackLevel();return}"), 'Zooming out inside a universe must return to the parent level instead of resetting the overview');
assert.ok(engine.includes('renderPath()'), 'The active folder path must remain visible in the scene');
assert.ok(engine.includes('window.enterSphere(id,false,true)'), 'Domain selection must synchronize the hidden Notion content source');
assert.ok(!html.includes("mainView.addEventListener('pointerdown',beginOrbit)"), 'Legacy orbit input must not compete with the clean engine');
assert.ok(!html.includes("openUniverse.addEventListener('click',toggleUniverse)"), 'Legacy hub navigation must not compete with the clean engine');
assert.ok(html.includes('if(!spatial3D&&mainView.classList.contains(\'universe-closed\'))toggleUniverse()'), 'The hidden content source must not change the new engine scene state');
assert.ok(engine.includes('window.__BALABS_3D_E2E__'), 'The browser smoke test must be able to inspect the live scene');

console.log('Clean 3D engine regression checks passed: eight domains, mycelial topology, animated signals, stable camera, desktop/mobile controls, hierarchical Notion branches and explicit page actions.');
