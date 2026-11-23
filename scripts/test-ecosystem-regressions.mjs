import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const entryHtml = readFileSync('index.html', 'utf8');
const html = readFileSync('ecosystem/index.html', 'utf8');
const previewHtml = readFileSync('ecosystem-preview/legacy-3d-preview.html', 'utf8');
const previewExplorerHtml = readFileSync('ecosystem-preview/index.html', 'utf8');
const previewExplorerJs = readFileSync('ecosystem-preview/explorer-2d.js', 'utf8');
const sharedPixiJs = readFileSync('ecosystem-core/explorer-2d-pixi.js', 'utf8');
const publicPixiJs = readFileSync('ecosystem/explorer-2d-pixi.js', 'utf8');
const sharedNetworkJs = readFileSync('ecosystem-core/explorer-2d-network.js', 'utf8');
const publicExplorerJs = readFileSync('ecosystem/explorer-2d.js', 'utf8');

assert.ok(publicExplorerJs.includes('selection-dock') && publicExplorerJs.includes('selection-open-link'), 'Selecting a 2D node must render a compact selection dock with its direct resource action');
assert.ok(publicExplorerJs.includes('selected.data.url') && publicExplorerJs.includes('https:'), 'The selection action must use the verified Notion URL carried by the selected manifest node');
assert.ok(publicExplorerJs.includes('function activateNode(n){if(!n)return;focusNode(n);}'), 'Selecting a visible 2D point must focus it without navigating away');
assert.ok(publicExplorerJs.includes('function pointerUp(e)') && publicExplorerJs.includes('canvas.addEventListener("pointerup",pointerUp)') && publicExplorerJs.includes('if(n)activateNode(n)'), 'Canvas navigation must open the selected canonical Notion destination on a single click');
assert.ok(!html.includes('#selection{position:absolute!important;width:1px!important'), 'The public explorer must not clip the selected-node dock out of view');

const engine = readFileSync('ecosystem/engine-v2.js', 'utf8');
const previewEngine = readFileSync('ecosystem-preview/engine-v2.js', 'utf8');
const expectedDomains = ['bio', 'myco', 'soil', 'lab', 'products', 'iot', 'work', 'learn'];
assert.ok(previewExplorerHtml.includes('id="field"') && previewExplorerHtml.includes('pixi.js@8.23.0'), 'Preview entry must mount the PixiJS 2D canvas, not the retired 3D scene');
assert.ok(previewExplorerHtml.includes('./explorer-2d.js?v=pixijs-2') && !previewExplorerHtml.includes('engine-v2.js'), 'Preview entry must load Vernpixi 2D and never load the 3D engine');
assert.ok(previewExplorerJs.includes('createPixiRenderer') && previewExplorerJs.includes('fetch("./notion-tree."+lang+".json"'), 'Preview Vernpixi must render from the active-language Notion tree');
assert.ok(previewExplorerJs.includes('../ecosystem-core/explorer-2d-pixi.js') && previewExplorerJs.includes('../ecosystem-core/explorer-2d-network.js'), 'Academy must import the common renderer and graph geometry');
assert.ok(sharedPixiJs.includes('pixijs-webgl') && sharedPixiJs.includes('filaments'), 'Shared Vernpixi renderer must draw the biological filament network');
assert.ok(sharedNetworkJs.includes('createVernpixiNetwork') && sharedNetworkJs.includes('const anchors='), 'Shared Vernpixi graph builder must own the eight organic anchors and branching geometry');
assert.ok(html.includes('id="inlineExplorer"') && html.includes('id="field"') && /src="\.\/explorer-2d\.js\?v=[^"]+"/.test(html), 'Public homepage must mount a versioned Vernpixi 2D script directly inside the existing universe section');
assert.ok(publicExplorerJs.includes('createPixiRenderer') && publicExplorerJs.includes('balabs:focus-domain'), 'Embedded public Vernpixi must support in-page universe focus');
assert.ok(publicExplorerJs.includes('./explorer-2d-pixi.js') && publicExplorerJs.includes('./explorer-2d-graph.js'), 'Public explorer must use its independent Pixi renderer and mycology-centered graph');
assert.ok(publicPixiJs.includes('primaryHypha') && publicPixiJs.includes('generation'), 'Public renderer must distinguish primary, secondary and tertiary biological filaments');
assert.doesNotMatch(publicPixiJs, /branchPoint|drawnArms|upper-left|upper-right/, 'Public renderer must not retain legacy three-arm geometry');
assert.equal(publicPixiJs.includes('const count=depth===1?4:depth===2?3:2'), false, 'Public renderer must not draw synthetic branches without graph data');
assert.ok(publicExplorerJs.includes('createPublicMycologyNetwork(tree,HUB[lang])'), 'Public explorer must build the mycology hub and eight independent universes from the localized manifest');
assert.ok(!html.includes('id="open2DExplorer"') && !html.includes("location.href='./explorer-2d.html?domain='"), 'Public homepage must not require a separate click-through page to enter the 2D engine');


const expectedExplorerDomains = ['microbiology','plants','ecology','bioprocesses','biomaterials','instrumentation','digital','physical'];
const languageTrees = Object.fromEntries(['fr','en','ar','pt'].map(language => [
  language,
  JSON.parse(readFileSync('ecosystem/notion-tree.' + language + '.json', 'utf8')),
]));
const expectedRootIds = {
  fr: ['41f73152f171818ea68cf2ed99aa3706','41f73152f1718161af13d1fbe52250de','41f73152f171819f9b7acbd64ccf4a3e','41f73152f1718108ac67e06204a60c7f','41f73152f1718117a38df4afe2d4fb9d','41f73152f1718170ba14e91650b0c806','41f73152f171816e8f0ed9e629fb70fe','41f73152f1718142aaf0d01bba51ecfb'],
  en: ['41f73152f17181129686ced284bc5de8','41f73152f17181d99104ca04dd66d0b5','41f73152f17181edaa7fe423fe6efa68','41f73152f1718104a3d5e5863fd10a58','41f73152f1718122992cc99b0609aab3','41f73152f17181b1a27ce32ef73cb66b','41f73152f1718127a894c85bc7af01af','41f73152f17181358e32ce72c1846326'],
  ar: ['41f73152f1718186b79bdea4ce892562','41f73152f171815fa5a1f577763e545d','41f73152f171819bb147da5152914bf2','41f73152f171815db156c978c9e23179','41f73152f1718192b9aedbaa5e027402','41f73152f17181dd81c9cfe38d9845d6','41f73152f17181418684e3445718a489','41f73152f171812aad13dc593fa7ba60'],
  pt: ['41f73152f17181edb2cee71226bc9b95','41f73152f1718151b56bf6ad98617c22','41f73152f17181658b77c14bcbff5940','41f73152f17181488f9eff06d48d9379','41f73152f17181babafbd221031866b4','41f73152f17181049050c327f2b0df92','41f73152f17181a1aba9d5b91d32a153','41f73152f1718146a959f08cd87ea17b'],
};
for (const language of ['fr','en','ar','pt']) {
  const tree = languageTrees[language];
  assert.deepEqual(tree.domains.map(domain => domain.id), expectedExplorerDomains, language + ' manifest must expose the eight scientific universes in canonical order');
  assert.deepEqual(tree.domains.map(domain => domain.notionId), expectedRootIds[language], language + ' roots must point to the actual public Notion universe portals');
  const allNodes = [];
  const visit = nodes => (nodes || []).forEach(node => { allNodes.push(node); visit(node.children); });
  visit(tree.domains);
  assert.ok(allNodes.length >= 100, language + ' manifest must preserve the deep public Notion hierarchy');
  const ids = new Set();
  const canonicalPages = new Set();
  for (const node of allNodes) {
    assert.ok(node.id && !ids.has(node.id), language + ' manifest node IDs must be unique');
    ids.add(node.id);
    if (node.kind === 'section') {
      assert.ok(!node.url && !node.notionId && (node.children || []).length > 0, language + ' section nodes must group real pages without inventing URLs');
    } else if (node.kind === 'label') {
      assert.ok(!node.url && !node.notionId && !(node.children || []).length, language + ' labels must remain non-navigable');
    } else {
      assert.match(node.url || '', /^https:\/\/app\.notion\.com\/p\/[a-f0-9]{32}$/, language + ' every navigable point must have a valid Notion URL');
      assert.equal(node.url, 'https://app.notion.com/p/' + node.notionId, language + ' Notion IDs and URLs must match');
      if (node.kind !== 'reference') {
        assert.ok(!canonicalPages.has(node.notionId), language + ' canonical Notion pages must not be duplicated');
        canonicalPages.add(node.notionId);
      }
    }
  }
  const rootIds = new Set(tree.domains.map(domain => domain.id));
  const relations = tree.domains.flatMap(domain => domain.relations || []);
  assert.ok(relations.length >= 8, language + ' public universe network must contain verified cross-universe links');
  for (const domain of tree.domains) {
    assert.ok((domain.children || []).length > 0, language + ' every universe must expose its linked public pages');
    for (const relation of domain.relations || []) {
      assert.ok(rootIds.has(relation.target), language + ' cross-universe links must target a real universe');
      assert.ok(relation.evidence && relation.basis === 'notion-link', language + ' cross-universe links must carry public Notion evidence');
    }
  }
}
const explorer = readFileSync('ecosystem/explorer-2d.js', 'utf8');
assert.ok(explorer.includes('createPixiRenderer') && explorer.includes('fetch("./notion-tree."+lang+".json"'), 'The existing PixiJS 2D engine must load the active language manifest');
assert.ok(explorer.includes('Expected 8 scientific universes') && explorer.includes('function buildNetwork()') && explorer.includes('createPublicMycologyNetwork'), 'The public 2D engine must build the mycology hub and eight universes through its dedicated graph module');
assert.ok(explorer.includes('microbiology:') && explorer.includes('instrumentation:') && explorer.includes('physical:'), 'The public 2D engine must retain its canonical Notion universe identifiers');
assert.ok(explorer.includes('function activateNode(n){if(!n)return;focusNode(n);}'), 'Selecting a point must focus it without automatic external navigation');
assert.ok(explorer.includes('function pointerUp(e)') && explorer.includes('if(n)activateNode(n)') && explorer.includes('selection-open-link'), 'Point activation must select the node and expose an explicit Notion action');
const universeEntry = readFileSync('ecosystem/universe.html', 'utf8');
for (const id of expectedExplorerDomains) assert.ok(universeEntry.includes("'" + id + "'"), 'Direct universe routing must allow ' + id);
for (const id of expectedExplorerDomains) {
  assert.ok(html.includes('data-domain-page="' + id + '"'), 'Homepage universe card must route to ' + id);
  assert.ok(html.includes("data-universe=\"" + id + "\""), 'Homepage quick navigation must expose ' + id);
  assert.ok(html.includes(id + ":{fr:'https://app.notion.com/p/"), 'Homepage language routing must map ' + id + ' to Notion');
}
assert.ok(html.includes('explorer-2d.js?v=mycology-constellation-1'), 'Homepage must invalidate cached 2D engine code after the mycology-centered rebuild');


assert.ok(publicExplorerJs.includes('hovered=null') && publicExplorerJs.includes('canvas.addEventListener("pointerleave",pointerLeave)'), 'The embedded explorer must expose a lightweight pointer-hover state and clear it when the pointer leaves');
assert.ok(sharedPixiJs.includes('hovered=null') && sharedPixiJs.includes('hovered?.id===n.id'), 'The PixiJS renderer must visibly highlight the hovered biological node');
assert.ok(publicExplorerJs.includes('IntersectionObserver') && publicExplorerJs.includes('document.hidden') && publicExplorerJs.includes('function startAnimation()'), 'The animated explorer must pause rendering when off-screen or when the browser tab is hidden');
