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
      edges: Number(el.dataset.edgeCount || 0),
      verifiedRelations: Number(el.dataset.verifiedRelations || 0),
      crossUniverseConnections: Number(el.dataset.crossUniverseConnections || 0)
    }));
    assert.equal(topology.universes, 8, 'The graph must retain all eight universes');
    assert.ok(topology.verifiedRelations >= 10, 'Cross-universe filaments must come from documented Notion relationships, not spatial proximity');
    assert.ok(topology.crossUniverseConnections >= 8, 'The overview must expose a connected evidence-backed universe network');
    const mappedTree = await page.evaluate(async () => {
      const response = await fetch('./notion-tree.fr.json');
      const tree = await response.json();
      const nodes = [];
      const walk = list => (list || []).forEach(node => { nodes.push(node); walk(node.children); });
      walk(tree.domains);
      return {
        roots: tree.domains.map(node => ({ id: node.id, title: node.title, notionId: node.notionId, url: node.url })),
        nodes: nodes.length,
        unmapped: nodes.filter(node => node.kind !== 'label' && (!node.notionId || !node.url) && !(node.kind === 'section' && (node.children || []).length > 0)).map(node => node.title),
        uniquePages: new Set(nodes.filter(node => node.notionId && node.kind !== 'reference').map(node => node.notionId)).size,
        canonicalPages: nodes.filter(node => node.notionId && node.kind !== 'reference').length,
        mappedPages: nodes.filter(node => node.notionId && node.kind !== 'reference').length,
        nodeUrls: Object.fromEntries(nodes.filter(node => node.notionId && node.kind !== 'section' && node.kind !== 'label').map(node => [node.id, node.url]))
      };
    });
    assert.equal(mappedTree.roots.length, 8, 'Eight universes must be backed by actual Notion pages');
    assert.ok(mappedTree.roots.every(root => root.notionId && root.url), 'Every universe root must link to a real Notion page');
    assert.deepEqual(mappedTree.unmapped, [], 'No synthetic folders or unlinked placeholder nodes');
    assert.equal(mappedTree.uniquePages, mappedTree.canonicalPages, 'Canonical Notion pages must not be duplicated; explicit reference links are allowed');
    assert.ok(mappedTree.roots.every(root => root.url && root.notionId), 'All eight public Notion universe roots must be directly mapped');
    // Pick a real root -> branch -> leaf path. A leaf elsewhere in the tree
    // cannot be used to assert the Back behavior of this selected branch.
    const navigationFixture = await page.evaluate(async () => {
      const data = await (await fetch('./notion-tree.fr.json')).json();
      const flatten = items => (items || []).flatMap(item => item.kind === 'section' ? flatten(item.children) : [item]);
      const findLeaf = (items, parent) => {
        for (const node of flatten(items)) {
          if (node.notionId && node.url && node.kind !== 'reference' && !(node.children || []).length) {
            return { node, parent };
          }
          const nested = findLeaf(node.children, node);
          if (nested) return nested;
        }
        return null;
      };
      for (const root of data.domains || []) {
        for (const branch of flatten(root.children)) {
          const found = findLeaf(branch.children, branch);
          if (found) return {
            rootId: root.id, rootTitle: root.title,
            branchId: branch.id, branchTitle: branch.title,
            leafId: found.node.id, leafTitle: found.node.title,
            leafUrl: found.node.url, leafParentId: found.parent.id,
            leafParentTitle: found.parent.title
          };
        }
      }
      return null;
    });
    assert.ok(navigationFixture?.rootId && navigationFixture?.branchId && navigationFixture?.leafId,
      'The manifest must expose one complete canonical root -> branch -> leaf path');

    assert.ok(topology.nodes >= 100, 'Every language must expose the full verified Notion hierarchy, not a shallow subset');
    assert.ok(topology.nodes > topology.universes, 'The graph must expose nested branches, not only universe roots');
    assert.ok(topology.edges > topology.nodes / 2, 'The mycelium must include cross-links and branch connections');
    await page.waitForFunction(() => document.querySelector('#field')?.dataset.layout === 'eight-around-mycology');
    assert.equal(await page.locator('#field').getAttribute('data-layout'), 'eight-around-mycology',
      'The eight universes must orbit a distinct central Mycology hub');
    const maxBranchLength = Number(await page.locator('#field').getAttribute('data-max-branch-length') || 0);
    assert.ok(maxBranchLength <= 140, `Primary and nested hyphae must stay compact (max segment: ${maxBranchLength})`);
    const localAnastomoses = Number(await page.locator('#field').getAttribute('data-local-anastomoses') || 0);
    assert.ok(localAnastomoses > 0, 'The graph must create spatially local anastomoses between separate parent branches');
    const initialUrl = page.url();
    assert.equal(await page.locator('#field').getAttribute('data-radial-root'), '', 'The overview must begin as a clean eight-universe ring around Mycology');
    const nav = page.locator('#accessibleNodes button');
    await page.waitForFunction(() => document.querySelectorAll('#accessibleNodes button').length >= 8);
    const visibleNodes = await nav.count();
    assert.ok(visibleNodes >= 8, 'At least the eight universe roots must be available');
    // A real point activation must preserve the explorer and open the exact
    // canonical Notion page in a separate tab. Use trusted Playwright clicks.
    const rootButton = page.locator('#accessibleNodes button[data-node-id="' + navigationFixture.rootId + '"]');
    const rootNodeId = await rootButton.getAttribute('data-node-id');
    assert.equal(await rootButton.getAttribute('data-notion-title'), mappedTree.roots.find(root => root.id === rootNodeId).title, 'Browser navigation title must exactly match the canonical Notion manifest title');
    const rootExpectedUrl = mappedTree.nodeUrls[rootNodeId];
    await page.evaluate(() => {
      window.__openedNotionUrls = [];
      const nativeOpen = window.open.bind(window);
      window.open = (...args) => { window.__openedNotionUrls.push(args[0]); return nativeOpen(...args); };
    });
    await rootButton.focus();
    await rootButton.press('Enter');
    await page.waitForFunction(() => document.querySelector('#selection')?.textContent?.length > 0);
    assert.equal(await page.evaluate(() => window.__openedNotionUrls.length), 0, 'Single activation must select/focus only; it must not open Notion');
    await page.waitForFunction(() => document.querySelector('#selection')?.textContent?.length > 0);
    assert.equal(page.url(), initialUrl, 'Opening a Notion page must preserve the explorer in its original tab');
    const selectedRoot = await page.locator('#selection').innerText();
    assert.equal(await page.locator('#field').getAttribute('data-radial-root'), navigationFixture.rootId,
      'Selecting a universe must unfold its own radial hierarchy');
    const ringRadii = await page.locator('#field').evaluate(el => JSON.parse(el.dataset.radialRingRadii || '[]'));
    assert.ok(ringRadii.length >= 2, 'The selected universe must unfold at least secondary and tertiary rings');
    assert.ok(ringRadii[0] >= 400, `The first ring must leave room for long canonical Notion titles (got ${ringRadii[0]})`);
    assert.ok(ringRadii.every((radius, index) => index === 0 || radius > ringRadii[index - 1]),
      'Each hierarchy level must occupy a strictly larger concentric ring');
    const ringCounts = await page.locator('#field').evaluate(el => JSON.parse(el.dataset.radialLevelCounts || '{}'));
    assert.ok(Number(ringCounts[1]) > 0 && Number(ringCounts[2]) > 0,
      'The first and second radial rings must both contain real Notion descendants');
    const firstChild = page.locator('#accessibleNodes button[data-node-id="' + navigationFixture.branchId + '"]');
    await firstChild.waitFor({ state: 'attached' });
    const childNodeId = await firstChild.getAttribute('data-node-id');
    const childExpectedUrl = mappedTree.nodeUrls[childNodeId];
    await firstChild.focus();
    await firstChild.press('Enter');
    await page.waitForFunction(() => document.querySelector('#selection')?.textContent?.length > 0);
    assert.equal(await page.evaluate(() => window.__openedNotionUrls.length), 0, 'Keyboard selection must not open Notion on first activation');

    // Regression: clicking any verified leaf label must open its exact Notion destination.
    const leafFixture = {
      id: navigationFixture.leafId,
      parentId: navigationFixture.leafParentId,
      parentTitle: navigationFixture.leafParentTitle,
      url: navigationFixture.leafUrl,
      title: navigationFixture.leafTitle
    };
    const leafButton = page.locator('#accessibleNodes button[data-node-id="' + leafFixture.id + '"]');
    await leafButton.focus();
    await leafButton.press('Enter');
    await page.waitForFunction(title => document.querySelector('#selection .selection-title')?.textContent === title, leafFixture.title);
    assert.equal(await page.evaluate(() => window.__openedNotionUrls.length), 0, 'Selecting a leaf by keyboard must not open Notion');
    await page.waitForFunction(id => Boolean(JSON.parse(document.querySelector('#field')?.dataset.visibleNodeHitBoxes || '{}')[id]), leafFixture.id, { timeout: 15000 });
    const labelPoint = await page.locator('#field').evaluate((el,id) => {
      const box = JSON.parse(el.dataset.visibleNodeHitBoxes || '{}')[id];
      const rect = el.getBoundingClientRect();
      return { x: rect.left + (box.left + box.right) / 2, y: rect.top + (box.top + box.bottom) / 2 };
    }, leafFixture.id);
    // Start a clean history: overview -> universe -> branch -> leaf.
    // This makes Back assertions deterministic and tests each navigation level.
    await page.locator('#reset').click();
    await rootButton.focus();
    await rootButton.press('Enter');
    await page.waitForFunction(title => document.querySelector('#selection')?.textContent?.includes(title), mappedTree.roots[0].title);
    await firstChild.focus();
    await firstChild.press('Enter');
    await page.waitForFunction(title => document.querySelector('#selection .selection-title')?.textContent === title, await firstChild.innerText());
    // Focus the exact canonical leaf before reading its animated canvas hitbox.
    await leafButton.focus();
    await leafButton.press('Enter');
    await page.waitForFunction(title => document.querySelector('#selection')?.textContent?.includes(title), leafFixture.title);
    await page.waitForFunction(id => Boolean(JSON.parse(document.querySelector('#field')?.dataset.visibleNodeHitBoxes || '{}')[id]), leafFixture.id, { timeout: 15000 });
    const pointForLeaf = async () => page.locator('#field').evaluate((el,id) => {
      const box = JSON.parse(el.dataset.visibleNodeHitBoxes || '{}')[id];
      if (!box) return null;
      const rect = el.getBoundingClientRect();
      return { x: rect.left + (box.left + box.right) / 2, y: rect.top + (box.top + box.bottom) / 2 };
    }, leafFixture.id);
    const firstLeafPoint = await pointForLeaf();
    assert.ok(firstLeafPoint, 'Leaf label must be visible before pointer activation');
    // Send a trusted native double-click sequence, including click detail=2.
    await page.mouse.dblclick(firstLeafPoint.x, firstLeafPoint.y, { delay: 70 });
    await page.waitForFunction(() => window.__openedNotionUrls?.length === 1, undefined, { timeout: 5000 });
    assert.equal(await page.evaluate(() => window.__openedNotionUrls[0]), leafFixture.url, 'Double-clicking a visible leaf label must open its exact Notion page');
    await page.waitForFunction(title => document.querySelector('#selection .selection-title')?.textContent === title, leafFixture.title);
    assert.equal(page.url(), initialUrl, 'Opening a child Notion page must stay inside the explorer scene');
    assert.ok(await page.locator('#crumbs button').count() >= 2, 'Breadcrumbs must expose the current hierarchy');
    await page.locator('#back').click();
    assert.equal(await page.locator('#selection .selection-title').textContent(), leafFixture.parentTitle, 'Back must restore the visible parent branch of the selected leaf as well as the camera');
    assert.equal(await page.locator('#back').isDisabled(), false, 'Back must retain earlier selections in the navigation history');
    await page.locator('#back').click();
    assert.equal(await page.locator('#selection').innerText(), selectedRoot, 'A second Back must restore the selected universe root');
    await page.locator('#back').click();
    assert.equal(await page.locator('#selection').innerText(), '', 'A third Back must return to the overview');
    assert.equal(await page.locator('#back').isDisabled(), true, 'Back must disable only when the full history is exhausted');
    const domainUrl = new URL(base);
    domainUrl.searchParams.set('domain', 'microbiology');
    domainUrl.searchParams.set('lang', 'fr');
    await page.goto(domainUrl.toString(), { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('#loading')?.hidden === true, undefined, { timeout: 30000 });
    await page.waitForFunction(() => document.querySelector('#selection .selection-title')?.textContent === '🧫 Microbiologie & sciences cellulaires');
    assert.equal(await page.locator('#selection .selection-title').textContent(), '🧫 Microbiologie & sciences cellulaires', 'Direct domain URL must focus the requested universe');
    assert.equal(page.url(), domainUrl.toString(), 'Direct domain entry must remain inside the same explorer route');
    await page.locator('#zoomIn').click();
    assert.ok(await page.locator('#field').isVisible(), 'Canvas remains in the same scene after zoom');
    for (const language of ['en', 'ar', 'pt', 'fr']) {
      await page.locator('#language').selectOption(language);
      try { await page.waitForFunction(() => document.querySelector('#loading')?.hidden === true, undefined, { timeout: 30000 }); } catch (error) { throw new Error(`The ${language} tree did not finish loading: ${await page.locator('#loading p').innerText().catch(() => 'no diagnostic')}; ${JSON.stringify({ errors, consoleErrors, failedRequests })}; ${error.message}`); }
      assert.equal(await page.locator('#loading').isHidden(), true, `The ${language} tree must reload successfully: ${await page.locator('#loading p').innerText().catch(() => 'no diagnostic')}`);
      await page.waitForFunction(() => document.querySelectorAll('#accessibleNodes button').length >= 8);
      assert.equal(await page.locator('#language').inputValue(), language);
      const languageNodeCount = Number(await page.locator('#field').getAttribute('data-node-count') || 0);
      assert.ok(languageNodeCount >= 100, `The ${language} tree must retain at least 100 mapped Notion nodes (got ${languageNodeCount})`);
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
