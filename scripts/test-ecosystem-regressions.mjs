import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync('ecosystem/index.html', 'utf8');
const previewHtml = readFileSync('ecosystem-preview/index.html', 'utf8');
const engine = readFileSync('ecosystem/engine-v2.js', 'utf8');
const previewEngine = readFileSync('ecosystem-preview/engine-v2.js', 'utf8');
const expectedDomains = ['bio', 'myco', 'soil', 'lab', 'products', 'iot', 'work', 'learn'];

const languageTrees = Object.fromEntries(['fr', 'en', 'ar', 'pt'].map((language) => [
  language,
  JSON.parse(readFileSync('ecosystem/notion-tree.' + language + '.json', 'utf8')),
]));
for (const language of ['fr', 'en', 'ar', 'pt']) {
  const ids = languageTrees[language].domains.map((domain) => domain.id).sort();
  assert.deepEqual(ids, [...expectedDomains].sort(), language + ' manifest must expose exactly the eight public universes');
}
function flattenManifest(node, out = []) {
  out.push(node);
  for (const child of node.children || []) flattenManifest(child, out);
  return out;
}
for (const language of ['fr', 'en', 'ar', 'pt']) {
  const tree = languageTrees[language];
  const allIds = new Set();
  for (const domain of tree.domains) {
    const nodes = flattenManifest(domain);
    for (const node of nodes) {
      assert.ok(node.id && !allIds.has(node.id), language + ' manifest node IDs must be present and unique');
      allIds.add(node.id);
      if (node.url) {
        const match = node.url.match(/^https:\/\/app\.notion\.com\/p\/([a-f0-9]{32})$/);
        assert.ok(match, language + ' ' + node.id + ' must use a valid Notion page URL');
        if (node.notionId) assert.equal(node.notionId, match[1], language + ' ' + node.id + ' notionId must match its URL');
      } else {
        assert.equal(node, domain, language + ' only a universe root may omit its own Notion URL');
        assert.ok((node.children || []).length > 0, language + ' an unlinked universe root must still expose real child pages');
      }
    }
  }
}
for (const [label, source] of [['public', engine], ['preview', previewEngine]]) {
  assert.ok(source.includes("fetch('./notion-tree.'+LANG()+'.json'") && source.includes("attributeFilter:['lang']"),
    label + ' 3D explorer must load the active language manifest and refresh it when the document language changes');
  assert.ok(source.includes('function buildResources(id,parentNode=null,anchor=null)') && source.includes('currentNode.children||[]'),
    label + ' 3D explorer must build each navigable level from the active manifest hierarchy');
}
function domainRootFromEngine(source, domain, language) {
  const start = source.indexOf('const pages={');
  const end = source.indexOf('\n};', start);
  assert.ok(start >= 0 && end > start, 'engine pages map must be present');
  const map = source.slice(start, end);
  const domainStart = map.indexOf('\n' + domain + ':{');
  if (domainStart < 0) return null;
  const nextDomain = map.slice(domainStart + 1).search(/\n[a-z]+:\{/);
  const section = nextDomain < 0 ? map.slice(domainStart) : map.slice(domainStart, domainStart + 1 + nextDomain);
  const match = section.match(new RegExp(language + ":'([^']+)'"));
  return match?.[1] || null;
}
for (const [label, source] of [['public', html], ['preview', previewHtml]]) {
  for (const language of ['fr', 'en', 'ar', 'pt']) {
    for (const domain of languageTrees[language].domains) {
      const expectedId = domain.notionId || domain.url?.match(/\/p\/([a-f0-9]{32})/)?.[1];
      if (!expectedId) continue;
      const actualUrl = domainRootFromEngine(source, domain.id, language);
      assert.ok(actualUrl, label + ' ' + language + ' ' + domain.id + ' must have a universe entry URL');
      assert.equal(actualUrl.match(/\/p\/([a-f0-9]{32})/)?.[1], expectedId,
        label + ' ' + language + ' ' + domain.id + ' must open the verified root page from its language manifest');
    }
  }
}

for (const [label, source] of [['public', html], ['preview', previewHtml]]) {
  assert.ok(source.includes("document.documentElement.dir=direction") && source.includes("app.dir=direction"), label + ' Arabic mode must set document-level and app-level reading direction');
  assert.ok(source.includes("localStorage.setItem('balabs-language',l)") && source.includes("localStorage.getItem('balabs-language')"), label + ' language preference must persist and restore safely');
  assert.ok(source.includes("let initialLanguage='fr'") && source.includes("setLanguage(initialLanguage)"), label + ' must restore a supported language before rendering the page');
  assert.ok(source.includes('role="group" aria-label="Choisir la langue"') && source.includes('aria-label="العربية"'), label + ' language controls must have a named semantic group and explicit language names');
  assert.ok(source.includes('<small id="brandSubtitle">Applied biotechnology · Sétif</small>') && !source.includes('<div class="mark" aria-hidden="true">Y</div>'), label + ' header must use the text wordmark rather than a substitute Y glyph');
  assert.ok(source.includes("brandSubtitles={fr:'Biotechnologie appliquée · Sétif'") && source.includes('brandSubtitle.textContent=brandSubtitles[l]'), label + ' brand descriptor must follow the selected language');
  assert.ok(source.includes('id="siteNavigation"') && source.includes("setAttribute('aria-label',navigationLabels[l])"), label + ' primary navigation accessible name must follow the active language');
  assert.ok(source.includes("document.title=({fr:'BALabs — Réseau vivant'"), label + ' document title must follow the selected language');
  assert.ok(source.includes('id="pageDescription"') && source.includes("description.content=descriptions[l]"), label + ' SEO description must follow the selected language');
  assert.ok(source.includes('<main id="main-content" tabindex="-1">') && source.includes('class="skip-link" href="#main-content"') && source.includes('.skip-link:focus'), label + ' keyboard users must have a visible skip link targeting the complete semantic main landmark');
  assert.ok(source.includes('.top{flex-wrap:wrap;align-items:center;row-gap:12px}') && source.includes('.lang{min-width:44px;min-height:44px;'), label + ' mobile language controls must wrap cleanly and meet a 44px touch target');
  assert.ok(!source.includes('<section class="hero" id="accueil" role="main">'), label + ' hero must not incorrectly represent the entire main landmark');
  assert.equal(source.split('<main').length - 1, 1, label + ' page must contain exactly one main landmark');
  assert.ok(source.includes("skipLabels={fr:'Aller au contenu principal'") && source.includes('skip.textContent=skipLabels[l]'), label + ' skip navigation text must be localised in all four languages');
}

assert.ok(html.includes("a[data-domain-page],a[data-work-page]") && previewHtml.includes("a[data-domain-page],a[data-work-page]") && html.includes("enterSphere(id,true,false)") && previewHtml.includes("enterSphere(id,true,false)"), 'Homepage universe and featured-work links must open the selected domain directly');
assert.ok(!/<a class="(?:editorial-link|work-card-link)" data-(?:domain|work)-page="[^"]+" href="#">/.test(html) && !/<a class="(?:editorial-link|work-card-link)" data-(?:domain|work)-page="[^"]+" href="#">/.test(previewHtml), 'Featured-work and domain shortcuts must have a useful in-page fallback destination');
assert.ok(html.includes('engine-v2.js?v=20261110-touch-branch-activation-v53'), 'Public explorer must load the cache-busted screen-space label engine');
assert.ok(html.includes('Customer journey: featured work → live 3D explorer → eight domains') && previewHtml.includes('Customer journey: featured work → live 3D explorer → eight domains') && html.includes('app.insertBefore(scene,domains);') && previewHtml.includes('app.insertBefore(scene,domains);') && !html.includes('app.insertBefore(method,work);') && !previewHtml.includes('app.insertBefore(method,work);') && !html.includes('app.insertBefore(bridge,work);') && !previewHtml.includes('app.insertBefore(bridge,work);'), 'The homepage discovery path must flow from featured projects to the live 3D explorer and then the eight-universe directory, with method content after it');
assert.ok(previewHtml.includes('engine-v2.js?v=20261110-touch-branch-activation-v54'), 'Preview must load the matching cache-busted label engine');
assert.ok(engine.includes('function syncLabelScales()') && engine.includes('cameraDistance*projection*targetPixels'), '3D labels must keep a stable screen-space size across zoom levels');
assert.ok(engine.includes('resourceHitTargets.set(label,element)'), 'Public branch labels must have real DOM hit targets');
assert.ok(engine.includes('domainHitTargets.set(id,{object:hit,button:domainButton})'), 'Public universes must have real clickable hit targets');
assert.ok(engine.includes('button.style.left=') && engine.includes('function syncResourceHitTargets()'), 'Public hit targets must follow projected 3D positions during camera motion');
assert.ok(previewEngine.includes('resourceHitTargets.set(label,element)') && previewEngine.includes('domainHitTargets.set(id,{object:hit,button:domainButton})'), 'Preview universes and branches must use the same real DOM hit targets');
assert.ok(engine.includes('function renderBranchDock()') && engine.includes('webgl-branch-dock') && engine.includes('openResource(item)'), 'Public engine must expose visible, recursively navigable branch and sub-branch controls');
assert.ok(engine.includes('window.__BALABS_3D_NAV_TRACE__=trace') && previewEngine.includes('window.__BALABS_3D_NAV_TRACE__=trace') && engine.includes('lastOpenError:window.__BALABS_3D_LAST_OPEN_ERROR__||null,navTrace:window.__BALABS_3D_NAV_TRACE__||null') && previewEngine.includes('lastOpenError:window.__BALABS_3D_LAST_OPEN_ERROR__||null,navTrace:window.__BALABS_3D_NAV_TRACE__||null'), 'Browser probe must expose recursive navigation state and runtime errors for branch clicks');
assert.ok(engine.includes(".webgl-hit-target,.webgl-branch-dock") && previewEngine.includes(".webgl-hit-target,.webgl-branch-dock"), 'Document-level canvas picking must ignore branch dock clicks to prevent duplicate or incorrect navigation');
assert.ok(engine.includes("el.addEventListener('pointerup'") && previewEngine.includes("el.addEventListener('pointerup'") && engine.includes("event.pointerType!=='touch'") && previewEngine.includes("event.pointerType!=='touch'") && engine.includes("activate(event,'touch-pointerup')") && previewEngine.includes("activate(event,'touch-pointerup')") && engine.includes('openResource(item)') && previewEngine.includes('openResource(item)') && engine.includes('sourceItem===data||object.userData===data') && previewEngine.includes('sourceItem===data||object.userData===data'), 'Branch dock must activate touch pointer releases and resolve the exact Notion node to its positioned spatial counterpart');
assert.ok(engine.includes('sourceItem:item') && previewEngine.includes('sourceItem:item') && engine.includes('raw=data,spatial=resourceObjects.find(') && previewEngine.includes('raw=data,spatial=resourceObjects.find(') && engine.includes('if(spatial)data=spatial') && previewEngine.includes('if(spatial)data=spatial'), 'Branch dock nodes must always resolve by exact Notion identity to canonical positioned spatial nodes before camera navigation');
assert.ok(engine.includes('branchDock.hidden=true;ROOT.append(branchDock)') && previewEngine.includes('branchDock.hidden=true;ROOT.append(branchDock)') && engine.includes('.webgl-branch-dock{touch-action:pan-y;') && previewEngine.includes('.webgl-branch-dock{touch-action:pan-y;'), 'Branch navigator must sit outside the gesture-locked canvas and retain native vertical touch scrolling');
assert.ok(engine.includes('z-index:2147483647!important') && previewEngine.includes('z-index:2147483647!important'), 'Branch dock must stack above projected 3D hit targets so actual pointer events reach its controls');
assert.ok(engine.includes('z-index:2147483647!important') && previewEngine.includes('z-index:2147483647!important'), 'Branch dock must be above the high-z-index projected spatial hit targets');
assert.ok(engine.includes(".webgl-hit-target,.webgl-branch-dock'))return") && previewEngine.includes(".webgl-branch-dock'))return") && engine.includes(".webgl-hit-target,.webgl-branch-dock')){touchFallback=null;return}") && previewEngine.includes(".webgl-hit-target,.webgl-branch-dock')){touchFallback=null;return}"), 'Stage pointer capture and touch fallback must leave branch dock taps to native buttons');
assert.ok(previewEngine.includes('function renderBranchDock()') && previewEngine.includes('webgl-branch-dock') && previewEngine.includes('openResource(item)'), 'Preview engine must expose visible, recursively navigable branch and sub-branch controls');
assert.ok(engine.includes('let distance = 13.5, zoomTargetDistance = 13.5') && engine.includes('const blend=1-Math.exp(-dt*13)'), 'Public camera zoom must ease smoothly toward its target instead of stepping instantly');
assert.ok(previewEngine.includes('let distance = 13.5, zoomTargetDistance = 13.5') && previewEngine.includes('const blend=1-Math.exp(-dt*13)'), 'Preview camera zoom must use the same smooth easing');
assert.ok(previewEngine.includes('function syncLabelScales()') && previewEngine.includes('cameraDistance*projection*targetPixels') && previewEngine.includes('syncLabelScales();'), 'Preview labels must keep the same stable screen-space size across zoom levels');
assert.ok(engine.includes('function panCameraByPixels(dx,dy)') && previewEngine.includes('function panCameraByPixels(dx,dy)'), 'Both 3D engines must translate the complete camera view when a two-finger gesture moves the map');
assert.ok(engine.includes("lastBranchTouchActivationAt=performance.now()") && previewEngine.includes("lastBranchTouchActivationAt=performance.now()") && engine.includes("e.stopImmediatePropagation();return") && previewEngine.includes("e.stopImmediatePropagation();return"), 'A touch branch activation must suppress its synthetic follow-up canvas click');
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
assert.ok(engine.includes("ctx.font='700 '+(size*14)+'px Inter,system-ui,sans-serif'"), '3D labels must use enlarged, heavier glyphs that remain readable when zoomed');
assert.ok(engine.includes('lineHeight=210'), 'Multi-line 3D labels must retain sufficient vertical spacing at the larger font size');
assert.ok(previewEngine.includes("ctx.font='700 '+(size*14)+'px Inter,system-ui,sans-serif'"), 'Preview 3D labels must use the same enlarged, heavier glyphs');
assert.ok(previewEngine.includes('lineHeight=210'), 'Preview multiline labels must use matching vertical spacing');
assert.ok(engine.includes("e.target.closest('.webgl-controls,.webgl-focus,.webgl-intro,.webgl-hit-target,.webgl-branch-dock')"), 'Public branch controls must keep native click dispatch outside stage pointer capture');
assert.ok(previewEngine.includes("e.target.closest('.webgl-controls,.webgl-focus,.webgl-intro,.webgl-hit-target,.webgl-branch-dock')"), 'Preview branch controls must keep native click dispatch outside stage pointer capture');
assert.ok(engine.includes("button.style.display=visible?'block':'none'"), 'Public offscreen hit targets must not intercept branch clicks');
assert.ok(previewEngine.includes("button.style.display=visible?'block':'none'"), 'Preview offscreen hit targets must not intercept branch clicks');
assert.ok(engine.includes("const soma=new THREE.Group();soma.userData={id,kind:'domain'};group.add(soma);"), 'Domain centres must remain open mycelial junctions rather than solid cell bodies');
assert.ok(engine.includes('Sparse background hyphae connect the field'), 'The overview must contain fine background mycelial connections');
assert.ok(engine.includes('for(let j=0;j<14;j++)'), 'Domain branches must retain dense radial connectivity');
assert.ok(engine.includes('const LINKS ='), 'The network must define explicit cross-domain connections');
for (const [a,b] of [['bio','myco'],['myco','soil'],['soil','lab'],['lab','iot'],['lab','products'],['products','work'],['work','iot'],['products','learn']]) {
  assert.ok(engine.includes("['" + a + "','" + b + "']"), 'Missing cross-domain link ' + a + ' → ' + b);
}
assert.ok(engine.includes('signalPoints'), 'Cross-domain links must carry animated signal points');
assert.ok(engine.includes('new THREE.TubeGeometry'), 'Organic connections must be rendered as continuous neurites');
assert.ok(engine.includes('Represent each folder/page as a living hyphal junction') && engine.includes('junction.add(filamentArm)'), 'Public branch nodes must be rendered as branching hyphal junctions, not bead-like solids');
assert.ok(previewEngine.includes('Represent each folder/page as a living hyphal junction') && previewEngine.includes('junction.add(filamentArm)'), 'Preview branch nodes must use the same hyphal-junction visual language');

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
assert.ok(engine.includes('THREE.MathUtils.clamp(zoomTargetDistance*Math.exp((pinchStart-d)*.006),1.25,60)'), 'Mobile pinch must zoom continuously through the full depth range without forcing hierarchy changes');
assert.ok(engine.includes('THREE.MathUtils.clamp(zoomTargetDistance*Math.exp(e.deltaY*.0016),1.25,60)'), 'Desktop wheel zoom must be exponential and continuous through the full depth range');
assert.ok(!engine.includes('const bg=new THREE.BufferGeometry()'), 'The opening network must avoid decorative starfield geometry');

assert.ok(engine.includes("fetch('./notion-tree.'+LANG()+'.json'"), 'The engine must load the active language Notion tree');
assert.ok(engine.includes('const maxDepth=3'), 'The spatial graph must expose the deepest real Notion folders and pages');
assert.ok(engine.includes('children.length>16') && engine.includes('Math.sqrt((k+.5)/children.length)'), 'Dense folders must use a spread-out phyllotaxis layout instead of one crowded ring');
assert.ok(engine.includes('label.userData.denseRoot?(compact?38:44)') && engine.includes("ctx.font='700 '+(size*14)+'px") && engine.includes("element.dataset.depth=String(data.depth||0)") && engine.includes('const occupied=[]') && engine.includes('const obstacles=') && engine.includes('12000+Math.round((1-item.p.z)*100)'), 'Dense root labels must use a readable compact screen-space size');
assert.ok(engine.includes('rootCount>16?(window.innerWidth<760?20.5:11.5):7.5'), 'Dense folders must fit the initial camera framing on mobile and desktop');
assert.ok(previewEngine.includes('children.length>16') && previewEngine.includes('Math.sqrt((k+.5)/children.length)'), 'Preview must use the same dense-folder layout as the public explorer');
assert.ok(previewEngine.includes('const maxDepth=3'), 'Preview and public engines must expose the same deepest Notion level');
assert.ok(engine.includes('THREE.MathUtils.clamp(zoomTargetDistance*Math.exp(e.deltaY*.0016),1.25,60)') && previewEngine.includes('THREE.MathUtils.clamp(zoomTargetDistance*Math.exp(e.deltaY*.0016),1.25,60)'), 'Public and preview explorers must share continuous deep zoom behavior');
assert.ok(!engine.includes('distance>9.5') && !previewEngine.includes('distance>9.5'), 'Zooming out must never unexpectedly pop the user to another hierarchy level');
assert.ok(previewEngine.includes('nearestLabelDistance<(window.innerWidth<760?58:70)'), 'Preview branch hit radius must match the public engine on mobile and desktop');
for (const language of ['fr', 'ar', 'en', 'pt']) {
  const tree = JSON.parse(readFileSync('ecosystem/notion-tree.' + language + '.json', 'utf8'));
  let deepest = 0;
  const inspectDepth = (nodes, depth) => nodes.forEach(node => { deepest = Math.max(deepest, depth); inspectDepth(node.children || [], depth + 1); });
  inspectDepth(tree.domains, 0);
  assert.ok(deepest <= 3, language + ' manifest depth must remain visible in the 3D engine');
}
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
assert.ok(engine.includes('let parent=data.parentNode;const ancestors=[];') && engine.includes('while(parent&&parent!==previousNode){ancestors.unshift(parent);parent=parent.parentNode}'), 'Directly selected nested folders must preserve every ancestor in the breadcrumb stack');
assert.ok(engine.includes("if(data.url){window.open(data.url"), 'Terminal pages must open their corresponding Notion page');
assert.ok(!engine.includes("open.dataset.resourceOpen='true'"), 'The obsolete resource details panel must not be used for navigation');
assert.ok(engine.includes("data-camera=\"back\""), 'The scene must expose a direct previous-level control');
assert.ok(engine.includes("if(action==='out')zoomTargetDistance=Math.min(60,zoomTargetDistance*1.28)"), 'Zoom-out control must preserve the active hierarchy and allow continuous camera travel');
assert.ok(engine.includes('renderPath()'), 'The active folder path must remain visible in the scene');
assert.ok(engine.includes('window.enterSphere(id,false,true)'), 'Domain selection must synchronize the hidden Notion content source');
assert.ok(!html.includes("mainView.addEventListener('pointerdown',beginOrbit)"), 'Legacy orbit input must not compete with the clean engine');
assert.ok(!html.includes("openUniverse.addEventListener('click',toggleUniverse)"), 'Legacy hub navigation must not compete with the clean engine');
assert.ok(html.includes('if(!spatial3D&&mainView.classList.contains(\'universe-closed\'))toggleUniverse()'), 'The hidden content source must not change the new engine scene state');
assert.ok(engine.includes('window.__BALABS_3D_E2E__'), 'The browser smoke test must be able to inspect the live scene');

console.log('Clean 3D engine regression checks passed: eight domains, mycelial topology, animated signals, stable camera, desktop/mobile controls, hierarchical Notion branches and explicit page actions.');


for (const language of ['fr', 'ar', 'en', 'pt']) {
  const publicTree = JSON.parse(readFileSync('ecosystem/notion-tree.' + language + '.json', 'utf8'));
  const previewTree = JSON.parse(readFileSync('ecosystem-preview/notion-tree.' + language + '.json', 'utf8'));
  assert.deepEqual(
    previewTree.domains,
    publicTree.domains,
    language + ' preview hierarchy and Notion destinations must exactly match the public site',
  );
}
