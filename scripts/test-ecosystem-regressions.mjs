import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync('ecosystem/index.html', 'utf8');
const previewHtml = readFileSync('ecosystem-preview/index.html', 'utf8');
const engine = readFileSync('ecosystem/engine-v2.js', 'utf8');
const previewEngine = readFileSync('ecosystem-preview/engine-v2.js', 'utf8');
const expectedDomains = ['bio', 'myco', 'soil', 'lab', 'products', 'iot', 'work', 'learn'];

assert.ok(engine.includes('multiplyScalar(1.62)') && previewEngine.includes('multiplyScalar(1.62)') && engine.includes('19.5,850') && previewEngine.includes('19.5,850'), 'Overview universes must be spaced farther apart and framed with enough camera distance');
assert.ok(engine.includes('Anastomoses: neighboring hyphae reconnect into a mesh') && previewEngine.includes('Anastomoses: neighboring hyphae reconnect into a mesh') && engine.includes('for(let j=0;j<12;j++)') && previewEngine.includes('for(let j=0;j<12;j++)') && engine.includes('branchCurves[j%branches].getPoint') && previewEngine.includes('branchCurves[j%branches].getPoint'), 'Each domain must contain cross-linked hyphae rather than only isolated radial branches');
assert.ok(engine.includes('const thresholds=[5.9,5.1,4.5]') && previewEngine.includes('const thresholds=[5.9,5.1,4.5]') && engine.includes('2.05+Math.min(.7,kids.length*.065)') && previewEngine.includes('2.05+Math.min(.7,kids.length*.065)'), 'Sub-branch labels must reveal earlier and child nodes must have more breathing room');
assert.ok(html.includes('engine-v2.js?v=20261111-spaced-subbranches-v92'), 'Public explorer must load the cache-busted screen-space label engine');
assert.ok(previewHtml.includes('engine-v2.js?v=20261111-spaced-subbranches-v92'), 'Preview must load the matching cache-busted label engine');
assert.ok(engine.includes('function labelTargetPixels(label)') && previewEngine.includes('function labelTargetPixels(label)') && engine.includes('Math.max(0,(13.5-distance)/13.5)*.12') && previewEngine.includes('Math.max(0,(13.5-distance)/13.5)*.12') && engine.includes('return base*zoomScale') && previewEngine.includes('return base*zoomScale'), '3D labels must retain screen-space readability and receive restrained emphasis as the camera zooms in');
assert.ok(engine.includes('resourceHitTargets.set(label,element)'), 'Public branch labels must have real DOM hit targets');
assert.ok(engine.includes("const displayTitle=[item.title,item.name,item.label,item.id].map(value=>String(value??'').trim()).find(Boolean)||('Branche '+(index+1));") && previewEngine.includes("const displayTitle=[item.title,item.name,item.label,item.id].map(value=>String(value??'').trim()).find(Boolean)||('Branche '+(index+1));") && engine.includes('title:displayTitle,sourceItem:item') && previewEngine.includes('title:displayTitle,sourceItem:item'), 'Every branch must expose a stable visible fallback label in both 3D engines');
assert.ok(engine.includes('visibleLabelCountsByDepth:Object.fromEntries') && previewEngine.includes('visibleLabelCountsByDepth:Object.fromEntries'), 'Both engines must expose visible immediate-branch label counts for browser verification');
assert.ok(engine.includes('resourceHitTargetStates:[...resourceHitTargets.entries()]') && previewEngine.includes('resourceHitTargetStates:[...resourceHitTargets.entries()]'), 'Browser diagnostics must expose each map label hit target visibility and folder state');
assert.ok(engine.includes('if(item.label)item.label.visible=!selected;apply(item.label);') && previewEngine.includes('if(item.label)item.label.visible=!selected;apply(item.label);'), 'Overview domain labels must disappear while navigating inside a selected domain');
assert.ok(engine.includes('if(status)status.hidden=true;selectedBranch=null;') && previewEngine.includes('if(status)status.hidden=true;selectedBranch=null;'), 'The bottom status overlay must not duplicate the active breadcrumb while navigating');
assert.ok(engine.includes("if(!opened||!!selected){button.hidden=true;button.style.display='none';continue;}project(object,button)") && previewEngine.includes("if(!opened||!!selected){button.hidden=true;button.style.display='none';continue;}project(object,button)"), 'Hidden domain targets must not reserve space in the branch-label collision layout');
assert.ok(engine.includes("projected.sort((a,b)=>Number(b.button.dataset.hasChildren==='true')-Number(a.button.dataset.hasChildren==='true')||a.p.z-b.p.z)") && previewEngine.includes("projected.sort((a,b)=>Number(b.button.dataset.hasChildren==='true')-Number(a.button.dataset.hasChildren==='true')||a.p.z-b.p.z)"), 'Navigable folders must receive label placement priority over leaf pages');
assert.ok(engine.includes('for(let ring=1;ring<=6;ring++)') && previewEngine.includes('for(let ring=1;ring<=6;ring++)') && engine.includes('Never discard a branch label solely because the viewport is crowded') && previewEngine.includes('Never discard a branch label solely because the viewport is crowded'), 'Branch labels must stay anchored and hide when no collision-free nearby position exists');
assert.ok(engine.includes('label.material.opacity=0;') && previewEngine.includes('label.material.opacity=0;'), '3D resource sprites must not duplicate the visible HTML branch labels');
assert.ok(engine.includes("WebkitLineClamp:'4'") && previewEngine.includes("WebkitLineClamp:'4'") && engine.includes("compact?'11px':'12px'") && previewEngine.includes("compact?'11px':'12px'") && engine.includes("maxHeight:'58px'") && previewEngine.includes("maxHeight:'58px'"), 'Spatial branch labels must use compact four-line typography with a measured collision box');
assert.ok(engine.includes("button.style.display=visible?'-webkit-box':'none'") && previewEngine.includes("button.style.display=visible?'-webkit-box':'none'") && engine.includes('for(let ring=1;ring<=6;ring++)') && previewEngine.includes('for(let ring=1;ring<=6;ring++)') && engine.includes('stepY=h/2+22') && previewEngine.includes('stepY=h/2+22'), 'Visible labels must honor four-line clamping and wider non-overlap placement');
assert.ok(engine.includes("function renderBranchDock() {\n  // Spatial branch labels are the only visible navigator; keep the legacy dock inert.\n  if(!branchDock)return;branchDock.replaceChildren();branchDock.hidden=true;\n}") && previewEngine.includes("function renderBranchDock() {\n  // Spatial branch labels are the only visible navigator; keep the legacy dock inert.\n  if(!branchDock)return;branchDock.replaceChildren();branchDock.hidden=true;\n}"), 'The branch dock must remain hidden; map labels are the direct navigation controls');
assert.ok(engine.includes("window.__BALABS_3D_E2E_CLICKS=(window.__BALABS_3D_E2E_CLICKS||0)+1;window.__BALABS_3D_LAST_OPEN__={title:data.title||data.name||'',source:'resource-label'") && previewEngine.includes("window.__BALABS_3D_E2E_CLICKS=(window.__BALABS_3D_E2E_CLICKS||0)+1;window.__BALABS_3D_LAST_OPEN__={title:data.title||data.name||'',source:'resource-label'"), 'Direct branch-label taps must drive real folder navigation');
assert.ok(engine.includes('white-space:nowrap;overflow:hidden;text-overflow:ellipsis') && previewEngine.includes('white-space:nowrap;overflow:hidden;text-overflow:ellipsis'), 'The branch dock must keep long titles on one line');
assert.ok(engine.includes('max-width:190px;min-height:44px;padding:7px 9px') && previewEngine.includes('max-width:190px;min-height:44px;padding:7px 9px'), 'Mobile branch dock items must retain a 44px touch target');
assert.ok(engine.includes('.webgl-branch-dock') && previewEngine.includes('.webgl-branch-dock') && engine.includes('.webgl-intro,.webgl-branch-dock') && previewEngine.includes('.webgl-intro,.webgl-branch-dock'), 'The branch dock must reserve its space in the map label layout');
assert.ok(engine.includes('ROOT.querySelectorAll(\'.webgl-controls,.webgl-status,.webgl-path,.webgl-focus,.webgl-intro,.webgl-branch-dock\')') && previewEngine.includes('ROOT.querySelectorAll(\'.webgl-controls,.webgl-status,.webgl-path,.webgl-focus,.webgl-intro,.webgl-branch-dock\')'), 'The label collision layout must include the branch dock outside the canvas stage');
assert.ok(engine.includes('label.visible=depth===visibleResourceLabelDepth()') && previewEngine.includes('label.visible=depth===visibleResourceLabelDepth()') && engine.includes('depth===visibleResourceLabelDepth()&&p.z>-1') && previewEngine.includes('depth===visibleResourceLabelDepth()&&p.z>-1'), 'Only the active hierarchy generation may be labelled at each zoom level');
assert.ok(engine.includes('zoomTargetDistance*.86') && previewEngine.includes('zoomTargetDistance*.86'), 'Zoom controls must step finely enough to reveal hierarchy generations progressively');
assert.ok(engine.includes('domainHitTargets.set(id,{object:hit,button:domainButton})'), 'Public universes must have real clickable hit targets');
assert.ok(engine.includes('button.style.left=') && engine.includes('function syncResourceHitTargets()'), 'Public hit targets must follow projected 3D positions during camera motion');
assert.ok(previewEngine.includes('resourceHitTargets.set(label,element)') && previewEngine.includes('domainHitTargets.set(id,{object:hit,button:domainButton})'), 'Preview universes and branches must use the same real DOM hit targets');
assert.ok(engine.includes('resourceHitTargets.set(label,element)') && engine.includes("source:'resource-label'") && engine.includes('openResource(data)'), 'Public engine must make each spatial branch label directly navigable');
assert.ok(engine.includes('window.__BALABS_3D_NAV_TRACE__=trace') && previewEngine.includes('window.__BALABS_3D_NAV_TRACE__=trace') && engine.includes('lastOpenError:window.__BALABS_3D_LAST_OPEN_ERROR__||null,navTrace:window.__BALABS_3D_NAV_TRACE__||null') && previewEngine.includes('lastOpenError:window.__BALABS_3D_LAST_OPEN_ERROR__||null,navTrace:window.__BALABS_3D_NAV_TRACE__||null'), 'Browser probe must expose recursive navigation state and runtime errors for branch clicks');
assert.ok(engine.includes(".webgl-hit-target,.webgl-branch-dock") && previewEngine.includes(".webgl-hit-target,.webgl-branch-dock"), 'Document-level canvas picking must ignore branch dock clicks to prevent duplicate or incorrect navigation');
assert.ok(engine.includes("element.addEventListener('click'") && previewEngine.includes("element.addEventListener('click'") && engine.includes("source:'resource-label'") && previewEngine.includes("source:'resource-label'") && engine.includes('const raw=data,source=data?.sourceItem||data,spatial=') && previewEngine.includes('const raw=data,source=data?.sourceItem||data,spatial='), 'Map label taps must resolve the exact Notion source to its positioned spatial counterpart');
assert.ok(engine.includes('sourceItem:item') && previewEngine.includes('sourceItem:item') && engine.includes('raw=data,source=data?.sourceItem||data,spatial=resourceObjects.find(') && previewEngine.includes('raw=data,source=data?.sourceItem||data,spatial=resourceObjects.find(') && engine.includes('if(spatial)data=spatial') && previewEngine.includes('if(spatial)data=spatial'), 'Map labels must always resolve by exact Notion identity to canonical positioned spatial nodes before camera navigation');
assert.ok(engine.includes('branchDock.hidden=true;ROOT.append(branchDock)') && previewEngine.includes('branchDock.hidden=true;ROOT.append(branchDock)') && engine.includes('.webgl-branch-dock[hidden]{display:none!important}') && previewEngine.includes('.webgl-branch-dock[hidden]{display:none!important}'), 'The redundant branch dock must remain hidden so the 3D map is unobstructed');
assert.ok(engine.includes('z-index:24!important') && previewEngine.includes('z-index:24!important'), 'Branch dock must stack above projected 3D hit targets so actual pointer events reach its controls');
assert.ok(engine.includes('z-index:24!important') && previewEngine.includes('z-index:24!important'), 'Branch dock must be above the high-z-index projected spatial hit targets');
assert.ok(engine.includes(".webgl-hit-target,.webgl-branch-dock'))return") && previewEngine.includes(".webgl-branch-dock'))return") && engine.includes(".webgl-hit-target,.webgl-branch-dock')){touchFallback=null;return}") && previewEngine.includes(".webgl-branch-dock')){touchFallback=null;return}"), 'Stage pointer capture and touch fallback must leave map-label taps to native controls');
assert.ok(previewEngine.includes('resourceHitTargets.set(label,element)') && previewEngine.includes("source:'resource-label'") && previewEngine.includes('openResource(data)'), 'Preview engine must make each spatial branch label directly navigable');
assert.ok(engine.includes('let distance = 19.5, zoomTargetDistance = 19.5') && engine.includes('const blend=1-Math.exp(-dt*13)'), 'Public camera zoom must ease smoothly toward its target instead of stepping instantly');
assert.ok(previewEngine.includes('let distance = 19.5, zoomTargetDistance = 19.5') && previewEngine.includes('const blend=1-Math.exp(-dt*13)'), 'Preview camera zoom must use the same smooth easing');
assert.ok(previewEngine.includes('function syncLabelScales()') && previewEngine.includes('cameraDistance*projection*targetPixels') && previewEngine.includes('syncLabelScales();') && previewEngine.includes('labelPixels:{domain:domainLabelPixels}'), 'Preview labels must use zoom-responsive sizing and expose their measured scale to browser tests');
assert.ok(engine.includes('function visibleResourceLabelDepth()') && previewEngine.includes('function visibleResourceLabelDepth()') && engine.includes('depth===visibleResourceLabelDepth()') && previewEngine.includes('depth===visibleResourceLabelDepth()'), 'Every branch and sub-branch label must appear progressively at the appropriate zoom level in both engines');
assert.ok(engine.includes("resourceObjects.filter(o=>o.userData?.kind==='resource-label'&&o.visible&&!resourceHitTargets.get(o)?.hidden&&(o.userData.depth||0)===activeDepth)") && previewEngine.includes("resourceObjects.filter(o=>o.userData?.kind==='resource-label'&&o.visible&&!resourceHitTargets.get(o)?.hidden&&(o.userData.depth||0)===activeDepth)") && engine.includes("o.userData.depth===activeDepth") && previewEngine.includes("o.userData.depth===activeDepth"), '3D picking must ignore hidden labels and nodes from other hierarchy depths');
assert.ok(engine.includes('visibleLabelDepths:') && previewEngine.includes('visibleLabelDepths:'), 'Both engines must expose the actually visible hierarchy-label depths for browser verification');
assert.ok(engine.includes("resourceObjects.filter(o=>o.userData?.kind==='resource-label'&&o.visible)") && previewEngine.includes("resourceObjects.filter(o=>o.userData?.kind==='resource-label'&&o.visible)"), 'Browser targeting must use the active visible hierarchy generation only');
assert.ok(engine.includes('button.dataset.labelCrowded=String((chosen.conflicts||0)>0)') && previewEngine.includes('button.dataset.labelCrowded=String((chosen.conflicts||0)>0)') && engine.includes('Never discard a branch label solely because the viewport is crowded') && previewEngine.includes('Never discard a branch label solely because the viewport is crowded'), 'Crowded 3D branch labels must remain visible using the least-conflicting nearby position');
assert.ok(engine.includes('labelPixels:{domain:domainLabelPixels}') && previewEngine.includes('labelPixels:{domain:domainLabelPixels}'), 'Public and preview engines must expose the same zoom-responsive label measurement');
assert.ok(engine.includes('function panCameraByPixels(dx,dy)') && previewEngine.includes('function panCameraByPixels(dx,dy)'), 'Both 3D engines must translate the complete camera view when a two-finger gesture moves the map');
assert.ok(engine.includes("element.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();") && previewEngine.includes("element.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();") && engine.includes(".webgl-hit-target,.webgl-branch-dock'))return") && previewEngine.includes(".webgl-hit-target,.webgl-branch-dock'))return"), 'A touch map-label activation must suppress its synthetic follow-up canvas click');
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
assert.ok(engine.includes("button.style.display=visible?'-webkit-box':'none'"), 'Public offscreen hit targets must not intercept branch clicks');
assert.ok(previewEngine.includes("button.style.display=visible?'-webkit-box':'none'"), 'Preview offscreen hit targets must not intercept branch clicks');
assert.ok(engine.includes("const soma=new THREE.Group();soma.userData={id,kind:'domain'};group.add(soma);"), 'Domain centres must remain open mycelial junctions rather than solid cell bodies');
assert.ok(engine.includes('Sparse background hyphae connect the field'), 'The overview must contain fine background mycelial connections');
assert.ok(engine.includes('const branches=14,branchTips=[],branchCurves=[];') && previewEngine.includes('const branches=14,branchTips=[],branchCurves=[];') && engine.includes('for(let j=0;j<branches;j++)') && previewEngine.includes('for(let j=0;j<branches;j++)') && engine.includes('branchCurves[j%branches].getPoint(') && previewEngine.includes('branchCurves[j%branches].getPoint('), 'Domain branches must retain dense radial connectivity and mid-branch anastomoses');
assert.ok(engine.includes("background:'transparent'") && engine.includes("boxShadow:'none'") && previewEngine.includes("background:'transparent'") && previewEngine.includes("boxShadow:'none'"), 'Floating branch labels must stay frameless instead of covering the mycelium with popup cards');
assert.ok(engine.includes('flex-wrap:nowrap') && previewEngine.includes('flex-wrap:nowrap') && engine.includes('overflow-x:auto') && previewEngine.includes('overflow-x:auto'), 'Branch navigation must stay in a compact horizontal strip instead of a large popup grid');
assert.ok(engine.includes("background:'transparent',border:'0',borderRadius:'0',boxShadow:'none'") && previewEngine.includes("background:'transparent',border:'0',borderRadius:'0',boxShadow:'none'"), 'Floating branch labels must remain frameless');
assert.ok(html.includes('balabs-minimal-3d-overlays') && previewHtml.includes('balabs-minimal-3d-overlays'), 'Public and preview interfaces must suppress stacked popup frames consistently');
assert.ok(html.includes('.webgl-focus .webgl-focus-actions button') && html.includes('.webgl-controls button') && previewHtml.includes('.webgl-intro-cta'), 'Focus actions, zoom controls and intro CTA must not render as framed tiles');

assert.ok(engine.includes('const LINKS ='), 'The network must define explicit cross-domain connections');
for (const [a,b] of [['bio','myco'],['myco','soil'],['soil','lab'],['lab','iot'],['lab','products'],['products','work'],['work','iot'],['products','learn']]) {
  assert.ok(engine.includes("['" + a + "','" + b + "']"), 'Missing cross-domain link ' + a + ' → ' + b);
}
assert.ok(engine.includes('signalPoints'), 'Cross-domain links must carry animated signal points');
assert.ok(engine.includes('new THREE.TubeGeometry'), 'Organic connections must be rendered as continuous neurites');
assert.ok(engine.includes('Represent each folder/page as a living hyphal junction') && engine.includes('junction.add(filamentArm)'), 'Public branch nodes must be rendered as branching hyphal junctions, not bead-like solids');
assert.ok(previewEngine.includes('Represent each folder/page as a living hyphal junction') && previewEngine.includes('junction.add(filamentArm)'), 'Preview branch nodes must use the same hyphal-junction visual language');

assert.ok(engine.includes('stage.addEventListener(\'pointerdown\',onPointerDown)'), 'Pointer input must be attached to the new stage');
assert.ok(!engine.includes("document.addEventListener('pointerup',onPointerUp,true)") && engine.includes('stage.addEventListener(\'pointerup\',onPointerUp)'), 'Tap selection must be handled once on the stage to preserve hit-testing');
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
assert.ok((engine.includes('label?.userData?.denseRoot?(compact?38:44)') || engine.includes('label.userData.denseRoot?(compact?38:44)')) && engine.includes("ctx.font='700 '+(size*14)+'px") && engine.includes("element.dataset.depth=String(data.depth||0)") && engine.includes('const occupied=[]') && engine.includes('const obstacles=') && engine.includes('12000+Math.round((1-item.p.z)*100)'), 'Dense root labels must use a readable compact screen-space size');
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
assert.ok(engine.includes("if(action==='out')zoomTargetDistance=Math.min(60,zoomTargetDistance*1.16)"), 'Zoom-out control must preserve the active hierarchy and allow continuous camera travel');
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
