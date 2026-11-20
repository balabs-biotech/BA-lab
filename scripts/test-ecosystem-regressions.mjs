import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const entryHtml = readFileSync('index.html', 'utf8');
const html = readFileSync('ecosystem/index.html', 'utf8');
const previewHtml = readFileSync('ecosystem-preview/legacy-3d-preview.html', 'utf8');
const previewExplorerHtml = readFileSync('ecosystem-preview/index.html', 'utf8');
const previewExplorerJs = readFileSync('ecosystem-preview/explorer-2d.js', 'utf8');
const previewPixiJs = readFileSync('ecosystem-preview/explorer-2d-pixi.js', 'utf8');
const publicExplorerJs = readFileSync('ecosystem/explorer-2d.js', 'utf8');
const publicPixiJs = readFileSync('ecosystem/explorer-2d-pixi.js', 'utf8');

assert.ok(publicExplorerJs.includes('selection-dock') && publicExplorerJs.includes('selection-open-link'), 'Selecting a 2D node must render a compact selection dock with its direct resource action');
assert.ok(publicExplorerJs.includes('selected.data.url') && publicExplorerJs.includes('https:'), 'The selection action must use the verified Notion URL carried by the selected manifest node');
assert.ok(!html.includes('#selection{position:absolute!important;width:1px!important'), 'The public explorer must not clip the selected-node dock out of view');

const engine = readFileSync('ecosystem/engine-v2.js', 'utf8');
const previewEngine = readFileSync('ecosystem-preview/engine-v2.js', 'utf8');
const expectedDomains = ['bio', 'myco', 'soil', 'lab', 'products', 'iot', 'work', 'learn'];
assert.ok(previewExplorerHtml.includes('id="field"') && previewExplorerHtml.includes('pixi.js@8.23.0'), 'Preview entry must mount the PixiJS 2D canvas, not the retired 3D scene');
assert.ok(previewExplorerHtml.includes('./explorer-2d.js?v=pixijs-2') && !previewExplorerHtml.includes('engine-v2.js'), 'Preview entry must load Vernpixi 2D and never load the 3D engine');
assert.ok(previewExplorerJs.includes('createPixiRenderer') && previewExplorerJs.includes('fetch("./notion-tree."+lang+".json"'), 'Preview Vernpixi must render from the active-language Notion tree');
assert.ok(previewPixiJs.includes('pixijs-webgl') && previewPixiJs.includes('filaments'), 'Preview Vernpixi renderer must draw the biological filament network');
assert.ok(html.includes('id="inlineExplorer"') && html.includes('id="field"') && html.includes('src="./explorer-2d.js?v=selection-dock-1"'), 'Public homepage must mount Vernpixi 2D directly inside the existing universe section');
assert.ok(publicExplorerJs.includes('createPixiRenderer') && publicExplorerJs.includes('balabs:focus-domain'), 'Embedded public Vernpixi must support in-page universe focus');
assert.ok(publicPixiJs.includes('pixijs-webgl') && publicPixiJs.includes('filaments'), 'Public Vernpixi renderer must draw the biological filament network');
assert.ok(!html.includes('id="open2DExplorer"') && !html.includes("location.href='./explorer-2d.html?domain='"), 'Public homepage must not require a separate click-through page to enter the 2D engine');


const expectedExplorerDomains = ['bio', 'myco', 'soil', 'lab', 'products', 'iot', 'work', 'evidence'];
const brandCss = readFileSync('ecosystem/brand-system.css', 'utf8');
const baseCss = readFileSync('ecosystem/site-base.css', 'utf8');
const overridesCss = readFileSync('ecosystem/site-overrides.css', 'utf8');
const editorialRefinementCss = readFileSync('ecosystem/editorial-refinement.css', 'utf8');
const pageCss = [baseCss, brandCss, overridesCss].join('\n');
assert.match(html, /<link rel="stylesheet" href="\.\/brand-system\.css\?v=\d+">/, 'Public homepage must load the BA Labs visual system');
assert.ok(html.includes('<div class="wrap balabs-ui" id="app"'), 'Public homepage must opt into the BA Labs visual system');
const chapterNavigationJs = readFileSync('ecosystem/chapter-navigation.js', 'utf8');
const chapterNavigationCss = readFileSync('ecosystem/chapter-navigation.css', 'utf8');
assert.match(html, /chapter-navigation\.css\?v=\d+/, 'Public homepage must load the chapter navigation stylesheet');
assert.match(html, /chapter-navigation\.js\?v=\d+/, 'Public homepage must load the chapter navigation script');
assert.ok(!chapterNavigationJs.includes('lang()') && chapterNavigationJs.includes('document.documentElement.lang'), 'Chapter navigation must read the document language without calling an undefined global function');
assert.ok(chapterNavigationJs.includes('rail.className=\'chapter-rail\'') && chapterNavigationJs.includes("document.body.append(rail)") && chapterNavigationJs.includes("b.addEventListener('click',()=>go(i))"), 'Chapter navigation must expose clickable side-point navigation');
assert.ok(chapterNavigationCss.includes('.chapter-rail{') && chapterNavigationCss.includes('position:fixed!important'), 'Side-point navigation must remain fixed above the horizontal chapter track');

for (const section of ['hero', 'editorial-feature', 'editorial-about', 'editorial-work', 'universe-index', 'editorial-method']) {
  assert.ok(brandCss.includes('#app.balabs-ui > main > .' + section), 'Visual system must target the actual main landmark child: ' + section);
  assert.ok(!brandCss.includes('#app.balabs-ui > .' + section), 'Visual system must not target ' + section + ' as a direct app child');
}
assert.ok(brandCss.includes('#app.balabs-ui > .top'), 'Header styling must remain scoped to the app header');
assert.ok(brandCss.includes('#app.balabs-ui > .foot'), 'Footer styling must remain scoped to the app footer');
const editorialSections = ['hero', 'editorial-feature', 'editorial-about', 'editorial-work', 'universe-index', 'editorial-method', 'universe-bridge', 'scene'];
for (const section of editorialSections) {
  assert.match(pageCss, new RegExp('#app\\s*>\\s*main\\s*>\\s*\\.' + section + '\\b'), 'Inline layout rules must target the nested main section: ' + section);
  assert.doesNotMatch(pageCss, new RegExp('#app\\s*>\\s*\\.' + section + '\\b'), 'No layout rule may target ' + section + ' as a direct app child');
}
assert.ok(!brandCss.includes('NOT imported by ecosystem/index.html'), 'Brand stylesheet integration note must reflect the live import');
for (const sectionId of ['chantiers', 'universe', 'universes']) {
  assert.match(pageCss, new RegExp('#app\\s*>\\s*main\\s*>\\s*#' + sectionId + '\\b'), 'Inline layout rules must target the nested main section ID: ' + sectionId);
  assert.doesNotMatch(pageCss, new RegExp('#app\\s*>\\s*#' + sectionId + '\\b'), 'No layout rule may target ' + sectionId + ' as a direct app child');
}
assert.ok(pageCss.includes('#app.balabs-ui[dir="rtl"] .site-nav a:after'), 'RTL navigation underline must mirror its animation direction');
assert.ok(pageCss.includes('#app.balabs-ui[dir="rtl"] .editorial-link span'), 'RTL editorial arrows must mirror their visual direction');
assert.ok(pageCss.includes('#app.balabs-ui[dir="rtl"] .site-nav{'), 'RTL mobile navigation must retain right-to-left reading order');

const homepageSequence = [
  '<section class="hero"',
  '<section class="editorial-work"',
  '<section class="scene"',
  '<section class="universe-index"',
  '<section class="editorial-feature"',
  '<section class="editorial-about"',
  '<section class="editorial-method"',
  '<section class="universe-bridge"',
  '<section class="under"',
].map((marker) => html.indexOf(marker));
assert.ok(homepageSequence.every((position) => position >= 0), 'Homepage must retain every primary editorial and explorer section');
assert.ok(homepageSequence.every((position, index) => index === 0 || position > homepageSequence[index - 1]), 'Homepage journey must prioritize the IoT-led work section, then the embedded 2D explorer, then the eight-universe directory');
for (const [before, after] of [
  ['01 / CHAMPS D’EXPLORATION', '02 / Univers BALabs'],
  ['01 / AREAS OF EXPLORATION', '02 / BALabs universe'],
  ['01 / مجالات الاستكشاف', '02 / عالم BALabs'],
  ['01 / ÁREAS DE EXPLORAÇÃO', '02 / Universo BALabs'],
]) {
  assert.ok(html.includes(before) && html.includes(after), 'Section numbering must reflect the new homepage journey: ' + before);
}


const languageTrees = Object.fromEntries(['fr', 'en', 'ar', 'pt'].map((language) => [
  language,
  JSON.parse(readFileSync('ecosystem/notion-tree.' + language + '.json', 'utf8')),
]));
for (const language of ['fr', 'en', 'ar', 'pt']) {
  const ids = languageTrees[language].domains.map((domain) => domain.id).sort();
  assert.deepEqual(ids, [...expectedExplorerDomains].sort(), language + ' Vernpixi manifest must expose exactly eight real Notion universes');
}
const englishAgrotechnology = languageTrees.en.domains.find((domain) => domain.id === 'soil');
for (const id of [
  '40173152f17181c0955ef6b706891bfa',
  '40173152f171818bbe4adc44550b7913',
  '40173152f171818daed1d22deb38a624',
  '40173152f171813da2e3dafa7265dc6a',
  '40173152f17181ce95cfcc669321cc1d',
]) assert.ok(englishAgrotechnology.children.some((node) => node.notionId === id), 'English agrotechnology must expose every verified public child page');
const arabicMycology = languageTrees.ar.domains.find((domain) => domain.id === 'myco');
function containsNotionPage(nodes, id) {
  return nodes.some((node) => node.notionId === id || (node.url || '').endsWith('/' + id) || containsNotionPage(node.children || [], id));
}
for (const id of ['40173152f1718101afcbdb364eb5d44a', '40173152f17181afb288feda1d2c3e5c']) {
  assert.ok(containsNotionPage(arabicMycology.children, id), 'Arabic mycology must expose its verified cultivation and applications pages at any valid hierarchy depth');
}
const portugueseAgrotechnology = languageTrees.pt.domains.find((domain) => domain.id === 'soil');
for (const id of [
  '40173152f171815692d6c55cd7032b94',
  '40173152f17181628dace7026da068a9',
  '40173152f1718136afe3fd533c629c64',
  '40173152f171819b8edfc928072a23a0',
]) assert.ok(portugueseAgrotechnology.children.some((node) => node.notionId === id), 'Portuguese agrotechnology must expose every verified public child page');

const englishBiotechnology = languageTrees.en.domains.find((domain) => domain.id === 'bio');
const englishWork = languageTrees.en.domains.find((domain) => domain.id === 'work');
assert.ok(englishBiotechnology.children.some((node) => node.notionId === '40173152f17181e1aa6eebe9f6c26c46'), 'English biotechnology universe must include the verified Plant micropropagation page linked from its public landing page');
assert.equal(englishWork.notionId, '40173152f1718173ae6bc8cce9f0ba52', 'English R&D universe must point to the actual Research and development root page');
assert.equal(englishWork.url, 'https://app.notion.com/p/40173152f1718173ae6bc8cce9f0ba52');
for (const id of ['40273152f17181299be1d95c37976d9d', '40273152f171811684d1ccce5374a6c3', '40273152f17181f896c7c040f4402212', '40273152f17181a7be0add6fe6b35581', '40273152f17181bb8f9ff2c94524c6e2']) assert.ok(englishWork.children.some((node) => node.notionId === id), 'English R&D must expose each direct child page from the actual Notion root');
const portugueseWork = languageTrees.pt.domains.find((domain) => domain.id === 'work');
assert.equal(portugueseWork.notionId, '40173152f171810f95b9d36ac1b04533', 'Portuguese R&D universe must point to the actual Investigação e desenvolvimento root page');
for (const id of ['40273152f1718113a306fa764c01b62b', '40273152f17181ed8c23f8efa76a2587', '40273152f1718150b2beccb7c12d0792', '40273152f1718144ac4ddd7a46c410d8', '40273152f17181ee8b40f19e198d8ffc']) assert.ok(portugueseWork.children.some((node) => node.notionId === id), 'Portuguese R&D must expose each direct child page from the actual Notion root');

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
      } else if (node.kind === 'section') {
        assert.ok(!node.notionId, language + ' ' + node.id + ' heading-derived section must not invent a Notion page ID');
        assert.ok((node.children || []).length > 0, language + ' ' + node.id + ' section must contain verified Notion pages');
      } else if (node.kind === 'label') {
        assert.ok(!node.notionId && !(node.children || []).length, language + ' ' + node.id + ' label must be a non-navigable heading without a fabricated Notion page');
      } else {
        assert.equal(node, domain, language + ' only a universe root or explicit section may omit its own Notion URL');
        assert.ok((node.children || []).length > 0, language + ' an unlinked universe root must still expose real child pages');
      }
    }
  }
}
// Catalogue labels and supply claims must match the verified public Notion records.
const frenchProducts = languageTrees.fr.domains.find((domain) => domain.id === 'products');
const frenchWa = frenchProducts.children.find((node) => node.id === 'products-wa-agar');
assert.equal(frenchWa.url, 'https://app.notion.com/p/3f473152f171812a814dd7b951786313', 'French WA must link to the canonical public catalogue record, not its internal working record');
for (const [language, unavailablePhrase] of [['fr', 'non disponible à la vente'], ['en', 'not available for sale'], ['ar', 'غير متاح للبيع'], ['pt', 'não disponível para venda']]) {
  const products = languageTrees[language].domains.find((domain) => domain.id === 'products');
  const prototypes = products.children.filter((node) => /myco-(start|plate)/i.test(node.id));
  assert.equal(prototypes.length, 2, language + ' must expose both Myco kit prototypes');
  for (const prototype of prototypes) assert.ok((prototype.description || '').toLowerCase().includes(unavailablePhrase.toLowerCase()), language + ' ' + prototype.id + ' must clearly state that the prototype is not for sale');
}
const publicCatalogueLabels = {
  fr: 'Catalogue public — Ressources publiables',
  en: 'Public catalogue — publishable resources',
  ar: 'الكتالوج العام — الموارد القابلة للنشر',
  pt: 'Catálogo público — recursos publicáveis',
};
for (const language of ['fr', 'en', 'ar', 'pt']) {
  const products = languageTrees[language].domains.find((domain) => domain.id === 'products');
  const catalogue = (products?.children || []).find((node) => node.url === 'https://app.notion.com/p/d0fbe1d779344eb58bc240fe7876ae0e');
  assert.ok(catalogue, language + ' products universe must expose the shared public catalogue directly');
  assert.equal(catalogue.notionId, 'd0fbe1d779344eb58bc240fe7876ae0e', language + ' public catalogue must use the verified shared database page');
  assert.equal(catalogue.title, publicCatalogueLabels[language], language + ' public catalogue entry must be localised');
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
      if (domain.id === 'evidence') continue; // Vernpixi-only universe; legacy 3D entry pages are retired.
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
  const stylesForPage = label === 'public' ? pageCss : source;
  assert.ok(source.includes("document.documentElement.dir=direction") && source.includes("app.dir=direction"), label + ' Arabic mode must set document-level and app-level reading direction');
  assert.ok(source.includes("localStorage.setItem('balabs-language',l)") && source.includes("localStorage.getItem('balabs-language')"), label + ' language preference must persist and restore safely');
  if (label === 'public') {
    assert.ok(source.includes("const routeParams=new URLSearchParams(location.search)") && source.includes("let initialLanguage=routeParams.get('lang')") && source.includes("setLanguage(initialLanguage)"), label + ' must prioritize an explicit supported URL language and render with that language');
  } else {
    assert.ok(source.includes("let initialLanguage='fr'") && source.includes("localStorage.getItem('balabs-language')") && source.includes("setLanguage(initialLanguage)"), label + ' must safely restore the saved language and render with that language');
  }
  assert.ok(source.includes('role="group" aria-label="Choisir la langue"') && source.includes('aria-label="العربية"'), label + ' language controls must have a named semantic group and explicit language names');
  assert.ok(source.includes('<small id="brandSubtitle">Applied biotechnology · Sétif</small>') && !source.includes('<div class="mark" aria-hidden="true">Y</div>'), label + ' header must use the text wordmark rather than a substitute Y glyph');
  assert.ok(source.includes("brandSubtitles={fr:'Biotechnologie appliquée · Sétif'") && source.includes('brandSubtitle.textContent=brandSubtitles[l]'), label + ' brand descriptor must follow the selected language');
  assert.ok(source.includes('id="siteNavigation"') && source.includes("setAttribute('aria-label',navigationLabels[l])"), label + ' primary navigation accessible name must follow the active language');
  assert.ok(source.includes("document.title=({fr:'BALabs — Réseau vivant'"), label + ' document title must follow the selected language');
  assert.ok(source.includes('id="pageDescription"') && source.includes("description.content=descriptions[l]"), label + ' SEO description must follow the selected language');
  assert.ok(source.includes('<main id="main-content" tabindex="-1">') && source.includes('class="skip-link" href="#main-content"') && stylesForPage.includes('.skip-link:focus'), label + ' keyboard users must have a visible skip link targeting the complete semantic main landmark');
  assert.ok(stylesForPage.includes('.top{flex-wrap:wrap;align-items:center;row-gap:12px}') && stylesForPage.includes('.lang{min-width:44px;min-height:44px;'), label + ' mobile language controls must wrap cleanly and meet a 44px touch target');
  assert.ok(!source.includes('<section class="hero" id="accueil" role="main">'), label + ' hero must not incorrectly represent the entire main landmark');
  assert.equal(source.split('<main').length - 1, 1, label + ' page must contain exactly one main landmark');
  assert.ok(source.includes("skipLabels={fr:'Aller au contenu principal'") && source.includes('skip.textContent=skipLabels[l]'), label + ' skip navigation text must be localised in all four languages');
}

const publicFooter = html.slice(html.lastIndexOf('<footer'), html.indexOf('</footer>', html.lastIndexOf('<footer')) + 9);
const previewFooter = previewHtml.slice(previewHtml.lastIndexOf('<footer'), previewHtml.indexOf('</footer>', previewHtml.lastIndexOf('<footer')) + 9);
assert.ok(publicFooter.includes('data-domain-page="products" data-i18n="navCatalogue"') && previewFooter.includes('data-domain-page="products" data-i18n="navCatalogue"'), 'The public and preview footers must both link directly to the products universe');
assert.ok(html.includes('data-domain-page="products" data-i18n="navCatalogue"') && previewHtml.includes('data-domain-page="products" data-i18n="navCatalogue"'), 'The footer must provide a direct route into the public products catalogue universe');
for (const [language, label] of Object.entries({ fr: 'Catalogue', en: 'Catalogue', ar: 'الكتالوج', pt: 'Catálogo' })) {
  const languageStart = html.indexOf(language + ':{');
  assert.ok(languageStart >= 0 && html.slice(languageStart, languageStart + 1800).includes('navCatalogue:"' + label + '"'), language + ' footer catalogue label must be localised');
}
assert.ok(html.includes("a[data-domain-page],a[data-work-page]") && previewHtml.includes("a[data-domain-page],a[data-work-page]") && html.includes("balabs:focus-domain") && html.includes("scrollIntoView({behavior:'smooth',block:'center'})") && previewHtml.includes("enterSphere(id,true,false)"), 'Public homepage links must focus the embedded Vernpixi network while the isolated preview retains its legacy navigation');
const featuredOrder = (source) => [...source.matchAll(/<a class="work-card-link" data-work-page="([^"]+)"/g)].map((match) => match[1]);
assert.deepEqual(featuredOrder(html), ['iot', 'myco', 'soil'], 'Public featured work must present IoT, cultures, then materials');
assert.deepEqual(featuredOrder(previewHtml), ['iot', 'myco', 'soil'], 'Preview featured work must match the public homepage order');
assert.ok(html.includes('04 / LES HUIT UNIVERS') && previewHtml.includes('04 / LES HUIT UNIVERS'), 'Both homepages must label the eight-universe directory as the fourth discovery stage');
assert.ok(!/<a class="(?:editorial-link|work-card-link)" data-(?:domain|work)-page="[^"]+" href="#">/.test(html) && !/<a class="(?:editorial-link|work-card-link)" data-(?:domain|work)-page="[^"]+" href="#">/.test(previewHtml), 'Featured-work and domain shortcuts must have a useful in-page fallback destination');
assert.ok(!html.includes('engine-v2.js?v=20261116-domain-hit-targets-4'), 'Public homepage must no longer load the legacy 3D engine');
assert.ok(readFileSync('ecosystem/universe.html', 'utf8').includes("new URL('./explorer-2d.html',location.href)"), 'Legacy universe URLs must redirect into Vernpixi while preserving domain and language');
assert.ok(html.includes('Customer journey: featured work → Vernpixi 2D explorer → eight domains') && previewHtml.includes('Customer journey: featured work → live 3D explorer → eight domains') && html.includes('domains.parentNode.insertBefore(scene,domains);') && previewHtml.includes('domains.parentNode.insertBefore(scene,domains);') && !html.includes('app.insertBefore(scene,domains);') && !previewHtml.includes('app.insertBefore(scene,domains);') && !html.includes('app.insertBefore(method,work);') && !previewHtml.includes('app.insertBefore(method,work);') && !html.includes('app.insertBefore(bridge,work);') && !previewHtml.includes('app.insertBefore(bridge,work);'), 'The public discovery path must flow from featured projects to Vernpixi and then the eight-universe directory, with method content after it');
assert.ok(previewHtml.includes('engine-v2.js?v=20261116-domain-hit-targets-4'), 'Preview must load the matching cache-busted label engine');
assert.ok(engine.includes('function syncLabelScales()') && engine.includes('Math.pow(cameraDistance/referenceDistance,.55)') && engine.includes('THREE.MathUtils.clamp(basePixels*zoomFactor,compact?7:7,compact?15:17)'), 'Public 3D labels must shrink as the camera zooms in and stay capped at a discreet screen size');
assert.ok(engine.includes('// Stay inside the primary Three.js scene: the manifest is the sole content source.') && !engine.includes("window.enterSphere(id,false,true)"), 'Public universe navigation must remain inside the primary Three.js scene without invoking the legacy renderer');
assert.ok(engine.includes('const meshColor=baseColor.clone().lerp(accent,.38)') && engine.includes('Organic axial growth'), 'Selected universe branches must form a connected axial mycelial field rather than a radial ring');
assert.ok(engine.includes('resourceHitTargets.set(label,element)'), 'Public branch labels must have real DOM hit targets');
assert.ok(engine.includes('domainHitTargets.set(id,{object:hit,button:domainButton})'), 'Public universes must have real clickable hit targets');
assert.ok(engine.includes('button.style.left=') && engine.includes('function syncResourceHitTargets()'), 'Public hit targets must follow projected 3D positions during camera motion');
assert.ok(previewEngine.includes('resourceHitTargets.set(label,element)') && previewEngine.includes('domainHitTargets.set(id,{object:hit,button:domainButton})'), 'Preview universes and branches must use the same real DOM hit targets');
assert.ok(engine.includes('function addResourceHitTarget(label)') && engine.includes('openResource(data)') && !engine.includes('webgl-branch-dock') && !engine.includes('renderBranchDock'), 'Public engine must navigate through spatial 3D branch targets without rendering the legacy HTML subpage dock');
assert.ok(engine.includes('window.__BALABS_3D_NAV_TRACE__=trace') && previewEngine.includes('window.__BALABS_3D_NAV_TRACE__=trace') && engine.includes('lastOpenError:window.__BALABS_3D_LAST_OPEN_ERROR__||null,navTrace:window.__BALABS_3D_NAV_TRACE__||null') && previewEngine.includes('lastOpenError:window.__BALABS_3D_LAST_OPEN_ERROR__||null,navTrace:window.__BALABS_3D_NAV_TRACE__||null'), 'Browser probe must expose recursive navigation state and runtime errors for branch clicks');
assert.ok(engine.includes(".webgl-hit-target" ) && previewEngine.includes(".webgl-hit-target,.webgl-branch-dock"), 'Document-level canvas picking must ignore interactive hit targets to prevent duplicate or incorrect navigation');
assert.ok(engine.includes("element.addEventListener('click',e=>") && engine.includes('openResource(data)') && previewEngine.includes("el.addEventListener('pointerup'") && previewEngine.includes("activate(event,'touch-pointerup')") && previewEngine.includes('openResource(item)') && engine.includes('sourceItem===data||object.userData===data') && previewEngine.includes('sourceItem===data||object.userData===data'), 'Public spatial hit targets and preview branch controls must resolve the exact Notion node to its positioned spatial counterpart');
assert.ok(engine.includes('sourceItem:item') && previewEngine.includes('sourceItem:item') && engine.includes('raw=data,spatial=resourceObjects.find(') && previewEngine.includes('raw=data,spatial=resourceObjects.find(') && engine.includes('if(spatial)data=spatial') && previewEngine.includes('if(spatial)data=spatial'), '3D branch targets must resolve by exact Notion identity to canonical positioned spatial nodes before camera navigation');
assert.ok(previewEngine.includes('function renderBranchDock()') && previewEngine.includes('webgl-branch-dock') && previewEngine.includes('openResource(item)'), 'Preview engine must expose visible, recursively navigable branch and sub-branch controls');
assert.ok(engine.includes('let distance = 13.5, zoomTargetDistance = 13.5') && engine.includes('const blend=1-Math.exp(-dt*13)'), 'Public camera zoom must ease smoothly toward its target instead of stepping instantly');
assert.ok(previewEngine.includes('let distance = 13.5, zoomTargetDistance = 13.5') && previewEngine.includes('const blend=1-Math.exp(-dt*13)'), 'Preview camera zoom must use the same smooth easing');
assert.ok(previewEngine.includes('function syncLabelScales()') && previewEngine.includes('Math.pow(cameraDistance/referenceDistance,.55)') && previewEngine.includes('THREE.MathUtils.clamp(basePixels*zoomFactor,compact?7:7,compact?15:17)') && previewEngine.includes('syncLabelScales();'), 'Preview labels must shrink with zoom and remain capped at a discreet screen size');
assert.ok(engine.includes('function panCameraByPixels(dx,dy)') && previewEngine.includes('function panCameraByPixels(dx,dy)'), 'Both 3D engines must translate the complete camera view when a two-finger gesture moves the map');
assert.ok(previewEngine.includes("lastBranchTouchActivationAt=performance.now()") && previewEngine.includes("e.stopImmediatePropagation();return"), 'Preview touch branch activation must suppress its synthetic follow-up canvas click');
assert.ok(!html.includes('constellation-3d.js?v='), 'Legacy monolithic engine must no longer be loaded');
assert.ok(engine.includes("const IDS = ['bio','myco','soil','lab','products','iot','work','learn']"), 'The clean engine must own the complete eight-domain registry');
const htmlDomains = [...html.matchAll(/<button[^>]*data-sphere="([^"]+)"/g)].map(match => match[1]);
assert.deepEqual(htmlDomains, expectedDomains, 'Public HTML must preserve all eight domains');

for (const language of ['fr', 'ar', 'en', 'pt']) {
  const tree = JSON.parse(readFileSync('ecosystem/notion-tree.' + language + '.json', 'utf8'));
  assert.deepEqual(tree.domains.map(domain => domain.id).sort(), [...expectedExplorerDomains].sort(), language + ' manifest must expose eight real Notion universes');
  const evidence = tree.domains.find(domain => domain.id === 'evidence');
  assert.ok(evidence?.notionId && evidence.url === 'https://app.notion.com/p/' + evidence.notionId, language + ' evidence universe must link to its real Notion page');
  for (const domain of tree.domains) assert.ok(domain.notionId && domain.url === 'https://app.notion.com/p/' + domain.notionId, language + ' domain ' + domain.id + ' must point to its matching Notion page');
  const seen = new Set();
  const walk = nodes => nodes.forEach(node => {
    if (node.notionId && node.kind !== 'reference') {
      assert.ok(!seen.has(node.notionId), language + ' manifest must not duplicate canonical Notion page ' + node.notionId);
      seen.add(node.notionId);
    }
    walk(node.children || []);
  });
  walk(tree.domains);
}
for (const language of ['fr', 'en', 'ar', 'pt']) {
  const products = languageTrees[language].domains.find((domain) => domain.id === 'products');
  assert.equal(products.children.length, 9, language + ' product branch must retain five public entry points and four mapped Notion sections');
}
const arabicProducts = JSON.parse(readFileSync('ecosystem/notion-tree.ar.json', 'utf8')).domains.find((domain) => domain.id === 'products');
assert.equal(arabicProducts.children.filter((node) => /WA/i.test(node.id)).length, 1, 'Arabic catalogue must expose one canonical WA entry, not a duplicate cross-language record');
for (const id of ['ar-product-myco-start', 'ar-product-myco-plate']) {
  const prototype = arabicProducts.children.find((node) => node.id === id);
  assert.ok(prototype && prototype.description.includes('غير متاح للبيع'), 'Arabic ' + id + ' must clearly state that the prototype is not for sale');
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
assert.ok(engine.includes("ctx.font='700 '+(size*14)+'px Inter,system-ui,sans-serif'"), '3D labels must use crisp high-resolution glyph textures');
assert.ok(engine.includes('lineHeight=210'), 'Multi-line 3D labels must retain sufficient vertical spacing at the larger font size');
assert.ok(previewEngine.includes("ctx.font='700 '+(size*14)+'px Inter,system-ui,sans-serif'"), 'Preview 3D labels must use crisp high-resolution glyph textures');
assert.ok(previewEngine.includes('lineHeight=210'), 'Preview multiline labels must use matching vertical spacing');
assert.ok(engine.includes("e.target.closest?.('.webgl-controls,.webgl-focus,.webgl-intro,.webgl-hit-target')") && !engine.includes('webgl-branch-dock'), 'Public spatial hit targets must keep native click dispatch outside stage pointer capture without a legacy branch dock');
assert.ok(previewEngine.includes("e.target.closest('.webgl-controls,.webgl-focus,.webgl-intro,.webgl-hit-target,.webgl-branch-dock')"), 'Preview branch controls must keep native click dispatch outside stage pointer capture');
assert.ok(engine.includes("button.style.display=visible?'block':'none'"), 'Public offscreen hit targets must not intercept branch clicks');
assert.ok(previewEngine.includes("button.style.display=visible?'block':'none'"), 'Preview offscreen hit targets must not intercept branch clicks');
assert.ok(engine.includes("const soma=new THREE.Group();soma.userData={id,kind:'domain'};group.add(soma);"), 'Domain centres must remain open mycelial junctions rather than solid cell bodies');
assert.ok(engine.includes('Sparse background hyphae connect the field'), 'The overview must contain fine background mycelial connections');
assert.ok(engine.includes('for(let j=0;j<9;j++)'), 'Domain branches must retain dense radial connectivity');
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
assert.ok(engine.includes('Organic axial growth') && engine.includes('Anastomoses') && engine.includes('const mobile=window.innerWidth<760,span=mobile?2.25:3.15'), 'The active universe engine must grow branches organically along the same spatial axis, not as a second radial map');
assert.ok(engine.includes('label.userData.denseRoot?(compact?10:11)') && engine.includes('THREE.MathUtils.clamp(basePixels*zoomFactor,compact?7:7,compact?15:17)') && engine.includes("ctx.font='700 '+(size*14)+'px") && engine.includes("element.dataset.depth=String(data.depth||0)") && engine.includes('const occupied=[]') && engine.includes('const obstacles=') && engine.includes('12000+Math.round((1-item.p.z)*100)'), 'Dense root labels must scale down with camera zoom and use compact screen-space sizing');
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
assert.ok(engine.includes("const loadManifest=()=>fetch('./notion-tree.'+LANG()+'.json'") && engine.includes('currentNode=manifest?.domains?.find(d=>d.id===id)||null'), 'The active 3D engine must load the selected language Notion manifest as its sole content source');
assert.ok(!html.includes("mainView.addEventListener('pointerdown',beginOrbit)"), 'Legacy orbit input must not compete with the clean engine');
assert.ok(!html.includes("openUniverse.addEventListener('click',toggleUniverse)"), 'Legacy hub navigation must not compete with the clean engine');
assert.ok(html.includes('if(!spatial3D&&mainView.classList.contains(\'universe-closed\'))toggleUniverse()'), 'The hidden content source must not change the new engine scene state');
assert.ok(engine.includes('window.__BALABS_3D_E2E__'), 'The browser smoke test must be able to inspect the live scene');


// Public catalogue exclusions: these five Trichoderma records are explicitly inactive in Notion and must not leak into either Arabic tree.
const inactiveArabicProducts = ['ar-lc-tricho-harzianum', 'ar-lc-tricho-hamatum', 'ar-lc-tricho-koningii', 'ar-lc-tricho-longibrachiatum', 'ar-lc-tricho-reesei'];
for (const [label, tree] of [['public', JSON.parse(readFileSync('ecosystem/notion-tree.ar.json', 'utf8'))], ['preview', JSON.parse(readFileSync('ecosystem-preview/notion-tree.ar.json', 'utf8'))]]) {
  assert.equal(tree.domains.find((domain) => domain.id === 'products')?.children?.[0]?.id, 'ar-public-catalogue', label + ' Arabic products universe must lead with the public catalogue');
  const ids = new Set(flattenManifest({ children: tree.domains }).map((node) => node.id));
  for (const id of inactiveArabicProducts) assert.ok(!ids.has(id), label + ' Arabic tree must not expose inactive catalogue item ' + id);
}



// Phase 3 visual-system contract: responsive editorial cards, touch targets,
// logical RTL spacing and visible keyboard focus. No explorer selectors.
for (const selector of [
  '#app.balabs-ui > main > .editorial-work .work-grid',
  '#app.balabs-ui > main > .editorial-work .work-card',
  '#app.balabs-ui > main > .universe-index .universe-index-card',
  '#app.balabs-ui > .site-nav a',
  '#app.balabs-ui[dir="rtl"] > main > .hero .aside',
]) assert.ok(brandCss.includes(selector), 'Phase 3 must include the responsive editorial selector: ' + selector);
assert.ok(brandCss.includes('min-height: 44px !important'), 'Language and navigation controls must retain accessible touch targets');
assert.ok(brandCss.includes('aspect-ratio: 16 / 10 !important'), 'Editorial project imagery must use a consistent landscape ratio');
assert.ok(brandCss.includes('grid-template-columns: repeat(2, minmax(0, 1fr)) !important'), 'Editorial work cards must collapse to two columns on tablet');
assert.ok(brandCss.includes('grid-template-columns: minmax(0, 1fr) !important'), 'Editorial work cards must collapse to one column on mobile');
assert.ok(brandCss.includes('outline: 3px solid var(--balabs-copper) !important'), 'Editorial links and controls must have a visible keyboard focus state');
const phase3Start = brandCss.indexOf('Site-wide visual refinement — phase 3');
const phase4Start = brandCss.indexOf('PHASE 4 — visible homepage art direction', phase3Start);
const phase3Css = brandCss.slice(phase3Start, phase4Start > phase3Start ? phase4Start : undefined);
assert.ok(!/\.(?:sphere|webgl-[\w-]*|branch-dock|camera)\b|#mainView|canvas/i.test(phase3Css), 'Phase 3 must not target the 3D explorer or Batch Tracker');




 // Phase 5 homepage-wide editorial system. Scope excludes the 3D scene.
assert.ok(brandCss.includes('PHASE 5 — editorial system across the full homepage'), 'Phase 5 must style the full editorial homepage');
for (const selector of ['.editorial-work .work-grid', '.editorial-about .about-copy', '.editorial-method .method-steps', '.universe-bridge .bridge-network']) {
  assert.ok(brandCss.includes(selector), 'Phase 5 must include the next homepage section: ' + selector);
}
assert.ok(brandCss.includes('grid-template-columns: repeat(4, minmax(0, 1fr)) !important'), 'Scientific method must present four distinct steps on desktop');
assert.ok(brandCss.includes('@media (max-width: 760px)'), 'Homepage editorial sections must retain mobile layouts');
assert.ok(!/\\.(?:sphere|webgl-[\\w-]*|branch-dock|camera)\\b|#mainView|canvas/i.test(brandCss.slice(brandCss.indexOf('PHASE 5 — editorial system across the full homepage'), brandCss.indexOf('PHASE 6 — internal universe navigation'))), 'Phase 5 must not target the 3D explorer');

// Phase 4 visible art-direction contract: major homepage composition, not micro-adjustments.
assert.ok(brandCss.includes('PHASE 4 — visible homepage art direction'), 'Phase 4 homepage art direction must be present');
assert.ok(brandCss.includes('#app.balabs-ui > .site-nav'), 'Phase 4 navigation must target its actual direct-child location');
assert.ok(!brandCss.includes('#app.balabs-ui > main > .site-nav'), 'Phase 4 navigation must not target a nonexistent main child');
assert.ok(brandCss.includes('min-height: max(760px, calc(100svh - 145px))'), 'Desktop hero must provide enough vertical room for its full editorial content');
assert.ok(brandCss.includes('align-items: center !important;'), 'Desktop hero content must remain vertically composed without clipping the primary actions');
assert.ok(brandCss.includes('flex-wrap: wrap !important;') && brandCss.includes('overflow: visible !important;'), 'Mobile navigation must wrap rather than clip its destinations');
assert.ok(brandCss.includes('font: 400 clamp(58px, 6.6vw, 94px)/.94 Georgia'), 'Hero typography must use the refined editorial scale without pushing actions below the composition');
assert.ok(brandCss.includes('grid-template-columns: minmax(0, 1.08fr) minmax(0, .92fr)'), 'Featured project must use the new asymmetric image-led split');
assert.ok(brandCss.includes('min-height: 740px !important'), 'Mobile hero must have its own image-led composition');
assert.match(html, /brand-system\.css\?v=\d+/, 'Public page must request a versioned visual system');
assert.match(previewHtml, /brand-system\.css\?v=\d+/, 'Preview must request a versioned visual system');

// Featured section metadata must remain legible against its light mineral background.
assert.ok(brandCss.includes('#app.balabs-ui > main > .editorial-feature .feature-status'), 'Featured status metadata must use a scoped high-contrast treatment');
assert.ok(brandCss.includes('color: #70402F !important'), 'Featured status text must use a dark copper foreground on the light section');
assert.ok(brandCss.includes('#app.balabs-ui > main > .editorial-feature .art-caption'), 'Featured image credit must retain a readable overlay treatment');

// Shared design-system contract: preview consumes the same maintained editorial layer as public.
assert.ok(previewHtml.includes('class="wrap balabs-ui" id="app"'), 'Preview root must opt into the shared BA Labs visual system');
assert.ok(previewHtml.includes('../ecosystem/brand-system.css?v='), 'Preview must load the shared visual system after its local styles');

// Preview parity contract: retain the preview's independent light theme while
// matching editorial hierarchy, responsive grids, touch targets and RTL focus.
for (const selector of [
  '.wrap > main > .editorial-work .work-grid',
  '.wrap > main > .universe-index .universe-index-card',
  '.wrap[dir="rtl"] > main > .hero .aside',
]) assert.ok(previewHtml.includes(selector), 'Preview must implement phase 3 editorial parity: ' + selector);
assert.ok(previewHtml.includes('aspect-ratio:16/10!important'), 'Preview project imagery must use the same landscape ratio');
assert.ok(previewHtml.includes('min-height:44px!important'), 'Preview language controls must retain accessible touch targets');
assert.ok(previewHtml.includes('grid-template-columns:repeat(2,minmax(0,1fr))!important'), 'Preview must use a two-column tablet work grid');
assert.ok(previewHtml.includes('grid-template-columns:minmax(0,1fr)!important'), 'Preview must use a one-column mobile work grid');

console.log('BA Labs site-wide visual refinement checks passed.');
console.log('Clean 2D homepage integration and legacy-engine regression checks passed: eight domains, mycelial topology, animated signals, stable camera, desktop/mobile controls, hierarchical Notion branches and explicit page actions.');


for (const language of ['fr', 'ar', 'en', 'pt']) {
  const publicTree = JSON.parse(readFileSync('ecosystem/notion-tree.' + language + '.json', 'utf8'));
  const previewTree = JSON.parse(readFileSync('ecosystem-preview/notion-tree.' + language + '.json', 'utf8'));
  assert.deepEqual(
    publicTree.domains.map(domain => domain.id).sort(),
    [...expectedExplorerDomains].sort(),
    language + ' Vernpixi public explorer must use the evidence universe',
  );
  assert.deepEqual(
    previewTree.domains.map(domain => domain.id).sort(),
    [...expectedDomains].sort(),
    language + ' legacy 3D preview must retain its own compatible universe registry',
  );
}


// Phase 6 internal universe navigation: editorial styling only, preserving engine behavior.
for (const selector of [
  '#mainView.webgl-ready .webgl-path',
  '#mainView.webgl-ready .webgl-branch-dock',
  '#mainView.webgl-ready .webgl-branch-dock .webgl-branch-item::before',
  '#mainView.webgl-ready .webgl-controls button',
  '#mainView.webgl-ready[dir="rtl"] .webgl-branch-dock',
]) assert.ok(brandCss.includes(selector), 'Phase 6 must style existing internal navigation: ' + selector);
assert.ok(brandCss.includes('PHASE 6 — internal universe navigation'), 'Internal universe navigation art direction must be present');
assert.ok(brandCss.includes('counter-increment: branch-index'), 'Nested branch links must receive a consistent editorial index');
assert.ok(brandCss.includes('grid-template-columns: repeat(4, minmax(0, 1fr)) !important'), 'Homepage scientific method section remains intact after phase 6');
assert.ok( html.includes('brand-system.css?v='), 'Public page must request phase 6 visual system');
assert.ok( previewHtml.includes('brand-system.css?v='), 'Preview must request phase 6 visual system');


// Phase 7 selected branch dossier: presentation-only, no engine logic changes.
for (const selector of [
  '#mainView.webgl-ready .webgl-focus',
  '#mainView.webgl-ready .webgl-focus-kicker',
  '#mainView.webgl-ready .webgl-focus .webgl-focus-actions',
  '#mainView.webgl-ready[dir="rtl"] .webgl-focus',
]) assert.ok(brandCss.includes(selector), 'Phase 7 must style the selected branch dossier: ' + selector);
assert.ok(brandCss.includes('PHASE 7 — selected branch dossier'), 'Phase 7 dossier art direction must be present');
assert.ok(brandCss.includes('width: min(360px, calc(100% - 108px)) !important'), 'Dossier must reserve room for explorer controls');
assert.ok(brandCss.includes('max-height: calc(100% - 112px) !important'), 'Mobile dossier must remain inside the explorer viewport');
assert.ok( html.includes('brand-system.css?v='), 'Public site must request phase 7 visual system');
assert.ok( previewHtml.includes('brand-system.css?v='), 'Preview must request phase 7 visual system');


// Root entry page: deliberate art-direction change, not another rounded-card skin.
assert.ok(entryHtml.includes('FIELD NOTE / 001'), 'Entry page must carry the field-research editorial identity');
assert.ok(!entryHtml.includes('BRANCHED BIOLOGICAL NETWORK') && !entryHtml.includes('hyphae-figure'), 'Entry page must not ship the rejected vermicelli illustration');
assert.ok(entryHtml.includes('hero-image-stack') && entryHtml.includes('Mycélium dans une boîte de Petri'), 'Entry page must use real sector-specific scientific imagery');
assert.ok(entryHtml.includes('plants.jpg') && entryHtml.includes('fermentation-services-1.jpg'), 'Entry page must show greenhouse and bioreactor imagery');
assert.ok(entryHtml.includes('--paper:#111B1D') && entryHtml.includes('--copper:#B96B4D'), 'Entry page must use the BA Labs graphite/copper palette');
assert.ok(entryHtml.includes('font:400 clamp(29px,3.1vw,43px)/1 Georgia,serif'), 'Workspace links must use the editorial list composition');
assert.ok(!entryHtml.includes('border-radius:16px'), 'Entry page must not fall back to generic rounded cards');
assert.ok(entryHtml.includes('intro-note-copy'), 'The intro note must remain translatable in all four languages');

assert.ok(brandCss.includes('PHASE 8 — editorial research atlas'), 'Phase 8 editorial research art direction must exist');
assert.ok(brandCss.includes('grid-template-areas: "image index" "image title" "image copy"'), 'Work areas must become image-led editorial spreads, not generic cards');
assert.ok(brandCss.includes('filter: grayscale(.72) contrast(1.08)'), 'Research imagery must use the monochrome field-documentation treatment');
assert.ok(brandCss.includes('grid-template-columns: repeat(4,minmax(0,1fr))'), 'Method section must use a four-column research sequence on desktop');
assert.ok(brandCss.includes('grid-template-columns: repeat(2,minmax(0,1fr)) !important;'), 'Editorial method must adapt to a two-column mobile sequence');
assert.ok( html.includes('brand-system.css?v='), 'Public site must request phase 11 art direction');
assert.ok( previewHtml.includes('brand-system.css?v='), 'Preview must request phase 8 art direction');

assert.ok(brandCss.includes('PHASE 10 — field-report project index'), 'Phase 10 field-report art direction must exist');
assert.ok(brandCss.includes('grid-template-areas: "image index" "image title" "image copy" "image topics" "image tag" "image link"'), 'Project tracks must render as an alternating editorial field-report sequence');
assert.ok(brandCss.includes('.work-card:nth-child(2)') && brandCss.includes('clip-path:polygon(0 0,100% 0,100% 94%,94% 100%,0 100%)'), 'Project imagery must use the asymmetric specimen treatment');
assert.ok(brandCss.includes('filter:grayscale(.78) contrast(1.12) brightness(.82)'), 'Project imagery must use the monochrome research-publication treatment');

assert.ok(brandCss.includes('PHASE 11 — institutional identity and research protocol'), 'Phase 11 about and method redesign must exist');
assert.ok(brandCss.includes('min-height:660px') && brandCss.includes('background:#263B38'), 'About section must use the full mineral-green field composition');
assert.ok(brandCss.includes('grid-template-columns:repeat(4,minmax(0,1fr))'), 'Research protocol must use four editorial stages on desktop');
assert.ok(brandCss.includes('PROTOCOL / 04 STAGES'), 'Research method must be marked as a protocol dossier');
assert.ok(brandCss.includes('grid-template-columns:1fr !important;') && brandCss.includes('.universe-bridge'), 'Bridge composition must collapse for mobile');


assert.ok(brandCss.includes('PHASE 12 — navigation and closing imprint'), 'Phase 12 editorial navigation and footer must exist');
assert.ok(brandCss.includes('.foot .foot-nav') && brandCss.includes('grid-template-columns:minmax(0,1fr) auto'), 'Footer must use a deliberate editorial two-column composition');
assert.ok(brandCss.includes('.site-nav a::after') && brandCss.includes('transform:scaleX(1)'), 'Primary navigation must have a restrained copper active/hover rule');
assert.ok(brandCss.includes('@media(max-width:760px)') && brandCss.includes('.foot { grid-template-columns:1fr'), 'Navigation and footer must collapse cleanly on mobile');
assert.ok( html.includes('brand-system.css?v='), 'Public site must request phase 12 visual system');
assert.ok( previewHtml.includes('brand-system.css?v='), 'Preview must request phase 12 visual system');


// Phase 13: close the homepage with an editorial principles colophon, not generic cards.
assert.ok(brandCss.includes('PHASE 13 — research principles as an editorial colophon'), 'Closing principles must use the shared research publication art direction');
assert.ok(html.includes('class="value-grid"') && html.includes('class="value-item"'), 'Closing principles must use the active semantic value-grid markup');
assert.ok(overridesCss.includes('.value-grid{display:grid') && overridesCss.includes('.value-item{'), 'Closing principles must use the active value-item styles');
assert.ok(overridesCss.includes('grid-template-columns:repeat(3,minmax(0,1fr))'), 'Closing principles must use the current three-column desktop layout');
assert.ok( html.includes('brand-system.css?v=') &&  previewHtml.includes('brand-system.css?v='), 'Public and preview must use the same Phase 13 stylesheet');


// Phase 14: browser-capture fixes for the responsive gateway header and hero.
assert.ok(brandCss.includes('PHASE 14 — browser-capture fixes'), 'Phase 14 browser-capture corrections must be present');
assert.ok(brandCss.includes('flex-wrap:nowrap !important') && brandCss.includes('white-space:nowrap !important'), 'Language and navigation controls must remain on a single horizontal rail');
assert.ok(brandCss.includes('#app.balabs-ui > .top .tools::-webkit-scrollbar'), 'Mobile language rail must scroll without visible scrollbar');
assert.ok(brandCss.includes('padding:42px 22px 44px !important'), 'Mobile gateway hero must have safe horizontal breathing room');
assert.ok( html.includes('brand-system.css?v=') &&  previewHtml.includes('brand-system.css?v='), 'Public and preview must share Phase 14 stylesheet');


// Phase 15: the non-engine editorial chapters receive a dedicated refinement layer.
assert.ok(/editorial-refinement\.css\?v=\d+/.test(html), 'Public site must load a versioned editorial refinement layer');
for (const selector of [
  '[data-chapter="research"]',
  '[data-chapter="network"]',
  '[data-chapter="catalogue"]',
  '[data-chapter="about"]',
  '.product-catalogue-card:before',
  '.method-trigger[aria-expanded="true"]',
  '.value-item h3',
]) assert.ok(editorialRefinementCss.includes(selector), 'Phase 15 must refine the public editorial experience: ' + selector);
assert.ok(editorialRefinementCss.includes('prefers-reduced-motion:reduce'), 'Phase 15 must respect reduced-motion preferences');


// PASS80: mobile chapter links stay fully visible while improving reading and touch comfort.
// Reuse chapterNavigationCss loaded by the navigation regression checks above.
assert.ok(chapterNavigationCss.includes('PASS 80 — keep every mobile destination visible without sacrificing legibility'), 'Mobile navigation must preserve its complete wrapped layout');
assert.ok(chapterNavigationCss.includes('flex-wrap:wrap!important') && chapterNavigationCss.includes('overflow:visible!important'), 'Mobile navigation must wrap instead of clipping its final destinations');
assert.ok(chapterNavigationCss.includes('min-height:26px!important') && chapterNavigationCss.includes('font-size:9px!important'), 'Wrapped mobile navigation links must have legible text and comfortable touch targets');
assert.match(html, /chapter-navigation\.css\?v=28/, 'Public homepage must request the legible wrapped mobile navigation stylesheet');

// PASS75: chapter photography must be ready when horizontal navigation reveals it.
const chapterAtmosphereJs = readFileSync('ecosystem/chapter-atmosphere.js', 'utf8');
const chapterAtmosphereCss = readFileSync('ecosystem/chapter-atmosphere.css', 'utf8');
assert.ok(chapterAtmosphereJs.includes("img.loading='eager'"), 'All five horizontal chapter atmosphere images must preload before their chapter is revealed');
assert.ok(chapterAtmosphereJs.includes("img.fetchPriority=key==='home'?'high':'auto'"), 'The opening chapter image must receive priority without starving the other chapter covers');
assert.ok(!chapterAtmosphereJs.includes("img.loading=key==='home'?'eager':'lazy'"), 'Chapter covers must not defer off-screen horizontal panels');
assert.ok(chapterAtmosphereCss.includes('.experience-page>.chapter-atmosphere.is-unavailable{') && chapterAtmosphereCss.includes('background:'), 'A failed chapter image must retain its mineral fallback visual');
assert.ok(chapterAtmosphereCss.includes('data-chapter="about"') && chapterAtmosphereCss.includes('grayscale(.58)'), 'The scientific chart cover must remain visually subordinate to editorial content');
assert.match(html, /chapter-atmosphere\.js\?v=15/, 'Public homepage must request the preloading chapter atmosphere script');


// PASS78: restore mobile network framing within the narrower chapter content column.
// This is a presentation-only viewport adjustment; the WebGL engine and camera remain untouched.
assert.ok(overridesCss.includes('PASS78 — widen the mobile WebGL viewport without touching scene or camera logic'), 'Mobile network framing must be corrected in the site presentation layer');
assert.ok(overridesCss.includes('width:122%!important') && overridesCss.includes('left:-11%!important'), 'Mobile WebGL stage must widen symmetrically to compensate for the chapter rail');
assert.ok(overridesCss.includes('.webgl-stage .webgl-focus{left:9.5%!important}') && overridesCss.includes('.webgl-stage .webgl-controls{right:9.5%!important}'), 'Mobile overlays must stay aligned inside the visible viewport');
assert.match(html, /site-overrides\.css\?v=9/, 'Public homepage must request the corrected mobile network viewport stylesheet');


// PASS79: the public 2D explorer must size its mobile canvas to the chapter reading frame.
assert.ok(editorialRefinementCss.includes('PASS79 — constrain the embedded mycelial explorer to the mobile reading column'), 'Mobile network framing must target the active public explorer, not the retired 3D container');
assert.ok(editorialRefinementCss.includes('width:min(100%,calc(100vw - 84px))!important') && editorialRefinementCss.includes('>.inline-explorer-stage'), 'Mobile explorer and stage must stay within the chapter reading column');
assert.ok(editorialRefinementCss.includes('#inlineExplorer #field') && editorialRefinementCss.includes('max-width:100%!important'), 'The live canvas must inherit the constrained stage width');
assert.match(html, /editorial-refinement\.css\?v=36/, 'Public homepage must request the mobile network viewport refinement');
const ecosystemBrowserTestSource = readFileSync('scripts/test-ecosystem-browser.mjs', 'utf8');
assert.ok(ecosystemBrowserTestSource.includes('MOBILE_NETWORK_FRAME') && ecosystemBrowserTestSource.includes('Mobile network canvas must use the actual stage width'), 'Browser smoke must measure the mobile network frame and canvas bounds');
