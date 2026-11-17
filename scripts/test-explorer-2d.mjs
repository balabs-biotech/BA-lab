import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

await mkdir('artifacts', { recursive: true });

const base = process.env.BALABS_EXPLORER_URL || 'http://127.0.0.1:8766/explorer-2d.html?lang=fr';
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const viewport of [{ name: 'desktop', width: 1440, height: 960 }, { name: 'mobile', width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height }, isMobile: viewport.name === 'mobile', hasTouch: viewport.name === 'mobile' });
    const errors = [];
    const consoleErrors = [];
    const failedRequests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('requestfailed', request => failedRequests.push(request.url() + ' — ' + (request.failure()?.errorText || 'unknown')));
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    try { await page.waitForFunction(() => document.querySelector('#loading')?.hidden === true, undefined, { timeout: 30000 }); } catch (error) { throw new Error('Explorer did not finish loading. ' + JSON.stringify({ errors, consoleErrors, failedRequests, loadingText: await page.locator('#loading').innerText().catch(() => '') }) + ' ' + error.message); }
    await page.locator('#field').waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.querySelector('#field')?.dataset.renderer === 'pixijs-webgl', undefined, { timeout: 20000 });
    const canvasSize = await page.locator('#field').evaluate(el => ({ width: el.width, height: el.height, rect: el.getBoundingClientRect().toJSON(), stage: el.parentElement.getBoundingClientRect().toJSON() }));
    assert.ok(canvasSize.width > 0 && canvasSize.height > 0, 'Canvas must have a real drawing surface');
    assert.ok(canvasSize.rect.width >= canvasSize.stage.width * .98 && canvasSize.rect.height >= canvasSize.stage.height * .98, 'Pixi canvas must fill the actual stage instead of its intrinsic default size');
    assert.equal(await page.locator('#field').getAttribute('data-renderer'), 'pixijs-webgl', 'PixiJS WebGL renderer must initialize');
    const topology = await page.locator('#field').evaluate(el => ({
      universes: Number(el.dataset.universeCount || 0),
      nodes: Number(el.dataset.nodeCount || 0),
      edges: Number(el.dataset.edgeCount || 0)
    }));
    assert.equal(topology.universes, 8, 'The graph must retain all eight universes');
    const rootTitles = JSON.parse(await page.locator('#field').getAttribute('data-root-titles') || '[]');
    assert.ok(rootTitles.includes('LE LABORATOIRE') && rootTitles.includes('R&D'), 'The French explorer must use the actual Notion root titles, not invented abbreviations');
    const accessibleRootTitles = await page.locator('#accessibleNodes button').allTextContents();
    assert.ok(accessibleRootTitles.includes('LE LABORATOIRE') && accessibleRootTitles.includes('R&D'), 'Full Notion root titles must remain available in the explorer labels');
    const auditedTrees = await page.evaluate(async () => {
      const load = async lang => (await fetch('./notion-tree.' + lang + '.json')).json();
      const [en, pt, fr, ar] = await Promise.all(['en', 'pt', 'fr', 'ar'].map(load));
      const find = (tree, notionId) => {
        const visit = nodes => { for (const node of nodes || []) { if (node.notionId === notionId) return node; const found = visit(node.children); if (found) return found; } return null; };
        return visit(tree.domains);
      };
      return {
        enFungal: find(en, '40173152f1718111a73ced2825985454')?.children?.length || 0,
        enPleurotus: find(en, '40273152f17181eba1bbcaf1b1d491d6')?.children?.length || 0,
        enMycorrhizae: find(en, '40173152f1718101965cc766e3d7e27f')?.children?.length || 0,
        enMicrobes: find(en, '40173152f171817e918cc9c278aeca0d')?.children?.length || 0,
        enMicrobesUnderSoil: (find(en, '40173152f1718100b468f740dbb40647')?.children || []).some(n => n.notionId === '40173152f171817e918cc9c278aeca0d'),
        ptFungal: find(pt, '40173152f171812fb8d5de62178f6aef')?.children?.length || 0,
        ptMycorrhizae: find(pt, '40173152f1718134a778d4c8d405ca62')?.children?.length || 0,
        ptMicrobes: find(pt, '40173152f171814ca1cae513ca2f0427')?.children?.length || 0,
        ptWorkTitle: pt.domains.find(n => n.id === 'work')?.title,
        enWorkTitle: en.domains.find(n => n.id === 'work')?.title,
        arMicrobesUnderBio: (find(ar, '40173152f17181bc87b1c17830686007')?.children || []).some(n => n.notionId === '40173152f17181f18a55d7ba9a90a713'),
        arMicrobesUnderSoil: (find(ar, '40173152f17181488cf8ec1851cddb56')?.children || []).some(n => n.notionId === '40173152f17181f18a55d7ba9a90a713'),
        frLabTitle: fr.domains.find(n => n.id === 'lab')?.title
      };
    });
    assert.ok(auditedTrees.enFungal >= 2 && auditedTrees.enPleurotus >= 10 && auditedTrees.enMycorrhizae >= 2, 'English mycology tree must include the verified species and mycorrhizae branches');
    assert.ok(auditedTrees.enMicrobes >= 7 && !auditedTrees.enMicrobesUnderSoil, 'Agricultural microorganisms must be under Biotechnology, not Agrotechnology');
    assert.ok(auditedTrees.ptFungal >= 2 && auditedTrees.ptMycorrhizae >= 2 && auditedTrees.ptMicrobes >= 7, 'Portuguese mycology and microbiology branches must expose their verified subfolders');
    assert.equal(auditedTrees.ptWorkTitle, 'Trabalho documentado e projetos', 'Portuguese R&D universe must use the actual Notion page title');
    assert.equal(auditedTrees.enWorkTitle, 'Documented work & projects', 'English R&D universe must use the actual Notion page title');
    assert.ok(auditedTrees.arMicrobesUnderBio && !auditedTrees.arMicrobesUnderSoil, 'Arabic agricultural microorganisms must be mapped under Biotechnology, matching the Notion page links');
    assert.equal(auditedTrees.frLabTitle, 'LE LABORATOIRE', 'French laboratory universe must use the actual Notion page title');
    assert.ok(topology.nodes > topology.universes, 'The graph must expose nested branches, not only universe roots');
    assert.ok(topology.edges > topology.nodes / 2, 'The mycelium must include cross-links and branch connections');
    const localAnastomoses = Number(await page.locator('#field').getAttribute('data-local-anastomoses') || 0);
    assert.ok(localAnastomoses > 0, 'The graph must create spatially local anastomoses between separate parent branches');
    const initialUrl = page.url();
    const nav = page.locator('#accessibleNodes button');
    await page.waitForFunction(() => document.querySelectorAll('#accessibleNodes button').length >= 8);
    const visibleNodes = await nav.count();
    assert.ok(visibleNodes >= 8, 'At least the eight universe roots must be available');
    // Select the first universe through the explorer's keyboard-accessible
    // node list. This exercises the same in-scene focus path without relying
    // on a guessed canvas coordinate that varies with viewport and layout.
    await nav.first().evaluate(button => button.click());
    await page.locator('#selection .card').waitFor({ state: 'visible' });
    assert.equal(page.url(), initialUrl, 'Selecting a branch must not navigate to another page');
    const childBranches = page.locator('#selection .child-branches button');
    await childBranches.first().waitFor({ state: 'visible' });
    const selectedRoot = await page.locator('#selection .card-title').innerText();
    await childBranches.first().click();
    await page.waitForFunction(root => document.querySelector('#selection .card-title')?.textContent !== root, selectedRoot);
    assert.equal(page.url(), initialUrl, 'Opening a child branch must stay inside the explorer scene');
    assert.ok(await page.locator('#crumbs button').count() >= 2, 'Breadcrumbs must expose the current hierarchy');
    await page.locator('#back').click();
    assert.equal(await page.locator('#selection .card-title').innerText(), selectedRoot, 'Back must restore the selected branch as well as the camera');
    assert.equal(await page.locator('#back').isDisabled(), true, 'Back control must return to a stable state after restoring the previous view');
    const domainUrl = new URL(base);
    domainUrl.searchParams.set('domain', 'myco');
    domainUrl.searchParams.set('lang', 'fr');
    await page.goto(domainUrl.toString(), { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('#loading')?.hidden === true, undefined, { timeout: 30000 });
    await page.locator('#selection .card-title').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#selection .card-title').innerText(), 'MYCOLOGIE', 'Direct domain URL must focus the requested universe');
    assert.equal(page.url(), domainUrl.toString(), 'Direct domain entry must remain inside the same explorer route');
    await page.locator('#zoomIn').click();
    assert.ok(await page.locator('#field').isVisible(), 'Canvas remains in the same scene after zoom');
    for (const language of ['en', 'ar', 'pt', 'fr']) {
      await page.locator('#language').selectOption(language);
      await page.waitForFunction(() => document.querySelector('#loading')?.hidden === true, undefined, { timeout: 15000 });
      await page.waitForFunction(() => document.querySelectorAll('#accessibleNodes button').length >= 8);
      assert.equal(await page.locator('#language').inputValue(), language);
    }
    assert.deepEqual(errors, [], 'No uncaught browser errors');
    assert.deepEqual(consoleErrors, [], 'No browser console errors');
    assert.deepEqual(failedRequests, [], 'No failed network requests');
    await page.screenshot({ path: `artifacts/explorer-2d-${viewport.name}.png`, fullPage: false });
    results.push({ viewport: viewport.name, canvas: [canvasSize.width, canvasSize.height], accessibleNodes: visibleNodes, languages: 'FR/EN/AR/PT', selectionStaysInScene: true, renderer: 'PixiJS WebGL', browserErrors: errors.length });
    await page.close();
  }
  console.log(JSON.stringify({ explorer2d: 'PASS', results }, null, 2));
} finally {
  await browser.close();
}
