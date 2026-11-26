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
      crossUniverseConnections: Number(el.dataset.crossUniverseConnections || 0),
      visualInterUniverseAnastomoses: Number(el.dataset.interUniverseAnastomoses || 0)
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

    assert.ok(topology.nodes >= 85, 'Every language must expose the full canonical Notion hierarchy without inflating the count with duplicate cross-universe references');
    assert.ok(topology.nodes > topology.universes, 'The graph must expose nested branches, not only universe roots');
    assert.ok(topology.edges > topology.nodes / 2, 'The mycelium must include cross-links and branch connections');
    assert.equal(await page.locator('#field').getAttribute('data-engine'), 'public-mycology-constellation',
      'The public explorer must use its dedicated mycology-centered graph');
    const hubConnections = Number(await page.locator('#field').getAttribute('data-hub-connections') || 0);
    assert.equal(hubConnections, 8, 'The mycology hub must connect directly to all eight scientific universes');
    const initialUrl = page.url();
    const overviewMetrics = await page.locator('#field').evaluate(el => ({count:JSON.parse(el.dataset.visibleNodeIds || '[]').length,scale:Number(el.dataset.scale||0)}));
    const overviewVisibleCount = overviewMetrics.count;
    const overviewGeometry = await page.locator('#field').evaluate(el => {
      const boxes = JSON.parse(el.dataset.visibleNodeHitBoxes || '{}');
      const rect = el.getBoundingClientRect();
      return { boxes:Object.keys(boxes), viewport:{width:rect.width,height:rect.height} };
    });
    assert.ok(!overviewGeometry.boxes.includes('balabs-identity'), 'The global overview must not include a separate BA Labs identity node');
    assert.ok(overviewGeometry.boxes.includes('mycology-center'), 'The global overview must visibly include the sole mycology core');
    assert.ok(['microbiology','plants','ecology','bioprocesses','biomaterials','instrumentation','digital','physical'].every(id => overviewGeometry.boxes.includes(id)), 'All eight autonomous territories must be visible in the global overview');
    const overviewBounds = await page.locator('#field').evaluate(el => {
      const boxes = JSON.parse(el.dataset.visibleNodeHitBoxes || '{}');
      const rect = el.getBoundingClientRect();
      return Object.entries(boxes).filter(([id]) => ['mycology-center','microbiology','plants','ecology','bioprocesses','biomaterials','instrumentation','digital','physical'].includes(id)).map(([id,b]) => ({id,...b,inside:b.left>=0&&b.top>=0&&b.right<=rect.width&&b.bottom<=rect.height}));
    });
    assert.equal(overviewBounds.length,9,'The global overview must expose the mycology core and eight universe labels');
    assert.ok(overviewBounds.every(item=>item.inside), 'All nine central labels must fit inside the viewport without clipping: '+JSON.stringify(overviewBounds));
    const overviewCamera = await page.locator('#field').evaluate(el => ({scale:Number(el.dataset.targetScale||0),width:Number(el.dataset.viewportWidth||0),height:Number(el.dataset.viewportHeight||0)}));
    if(viewport.name==='mobile')assert.ok(overviewCamera.scale < .62, 'Mobile overview camera must fit the eight outer inoculation territories, not only the central identity nodes: '+JSON.stringify(overviewCamera));
    await page.screenshot({ path: `artifacts/explorer-2d-${viewport.name}-overview.png`, fullPage: false });
    await page.locator('#zoomIn').click(); await page.locator('#zoomIn').click(); await page.locator('#zoomIn').click(); await page.locator('#zoomIn').click();
    await page.waitForTimeout(600);
    const zoomDebug = await page.locator('#field').evaluate(el => ({ scale:el.dataset.scale,targetScale:el.dataset.targetScale,width:el.dataset.viewportWidth,height:el.dataset.viewportHeight,candidates:el.dataset.labelCandidateCount,live:el.dataset.labelLiveCount,roots:el.dataset.rootCandidateCount,visible:JSON.parse(el.dataset.visibleNodeIds||'[]').length,labels:JSON.parse(el.dataset.visibleNodeIds||'[]').slice(0,20) }));
    console.log('progressive zoom diagnostic', JSON.stringify({overviewVisibleCount,zoomDebug}));
    await page.waitForFunction(initialScale => Number(document.querySelector('#field')?.dataset.scale||0) > initialScale + .03, overviewMetrics.scale, { timeout: 12000 });
    const zoomedMetrics = await page.locator('#field').evaluate(el => ({count:JSON.parse(el.dataset.visibleNodeIds || '[]').length,scale:Number(el.dataset.scale||0)}));
    assert.ok(zoomedMetrics.scale > overviewMetrics.scale, `Zoom controls must increase the camera scale (${overviewMetrics.scale} -> ${zoomedMetrics.scale})`);
    await page.locator('#reset').click();
    const nav = page.locator('#accessibleNodes button');
    await page.waitForFunction(() => document.querySelectorAll('#accessibleNodes button').length >= 8);
    const visibleNodes = await nav.count();
    assert.ok(visibleNodes >= 8, 'At least the eight universe roots must be available');
    // Selecting a node must keep the user inside the explorer. Notion opens
    // only through the explicit resource link in the selection panel.
    const rootButton = page.locator('#accessibleNodes button[data-node-id="' + navigationFixture.rootId + '"]');
    const rootNodeId = await rootButton.getAttribute('data-node-id');
    assert.equal(await rootButton.getAttribute('data-notion-title'), mappedTree.roots.find(root => root.id === rootNodeId).title, 'Browser navigation title must exactly match the canonical Notion manifest title');
    const rootExpectedUrl = mappedTree.nodeUrls[rootNodeId];
    await page.evaluate(() => {
      window.__openedNotionUrls = [];
      window.open = (...args) => { window.__openedNotionUrls.push(args[0]); return null; };
    });
    await rootButton.focus();
    await rootButton.press('Enter');
    await page.waitForFunction(() => document.querySelector('#selection')?.textContent?.length > 0);
    assert.equal(await page.evaluate(() => window.__openedNotionUrls.length), 0, 'Selecting a universe must not automatically open Notion');
    assert.equal(await page.locator('#selection .selection-open-link').getAttribute('href'), rootExpectedUrl, 'The selected universe must expose its exact Notion destination');
    assert.equal(page.url(), initialUrl, 'Selecting a universe must preserve the explorer URL');
    const selectedRoot = await page.locator('#selection').innerText();
    assert.ok(await page.locator('#selection .child-branches button').count() > 0, 'Selecting a node must expose direct child navigation controls');
    assert.equal(await page.locator('#field').getAttribute('data-engine'), 'public-mycology-constellation',
      'Selecting a public universe must keep the dedicated public graph active');
    const firstChild = page.locator('#accessibleNodes button[data-node-id="' + navigationFixture.branchId + '"]');
    await firstChild.waitFor({ state: 'attached' });
    const childNodeId = await firstChild.getAttribute('data-node-id');
    const childExpectedUrl = mappedTree.nodeUrls[childNodeId];
    await firstChild.focus();
    await firstChild.press('Enter');
    await page.waitForFunction(() => document.querySelector('#selection')?.textContent?.length > 0);
    assert.equal(await page.evaluate(() => window.__openedNotionUrls.length), 0, 'Selecting a branch must not automatically open Notion');
    assert.equal(await page.locator('#selection .selection-open-link').getAttribute('href'), childExpectedUrl, 'The selected branch must expose its exact Notion destination');
    assert.ok(await page.locator('#selection .selection-path').count(), 'The selection panel must preserve the full parent path for deep navigation, including mobile');

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
    assert.equal(await page.evaluate(() => window.__openedNotionUrls.length), 0, 'Selecting a leaf must not automatically open Notion');
    assert.equal(await page.locator('#selection .selection-open-link').getAttribute('href'), leafFixture.url, 'The selected leaf must expose its exact Notion destination');
    const selectedCamera = await page.locator('#field').evaluate(el => ({
      focusY: Number(el.dataset.targetFocusY || 0),
      height: Number(el.dataset.viewportHeight || 0),
      scale: Number(el.dataset.targetScale || 0)
    }));
    if (viewport.name === 'mobile') {
      assert.ok(selectedCamera.focusY > 0 && selectedCamera.focusY < selectedCamera.height * .46,
        'Mobile selection camera must place the focused node above the bottom selection dock: ' + JSON.stringify(selectedCamera));
      assert.ok(selectedCamera.scale <= 1.2,
        'Mobile deep selection must preserve a readable surrounding territory instead of magnifying one isolated node: ' + JSON.stringify(selectedCamera));
    } else {
      assert.ok(selectedCamera.scale <= 3.8,
        'Desktop deep selection must preserve adjacent branches and avoid clipping the selected territory: ' + JSON.stringify(selectedCamera));
    }
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
    await page.waitForFunction(title => document.querySelector('#selection .selection-title')?.textContent === title, leafFixture.title);
    // Wait for the camera animation to settle before reading canvas-space hitboxes.
    // Otherwise the pointer can target a stale position from the preceding frame.
    await page.waitForFunction(() => {
      const field = document.querySelector('#field');
      return Math.abs(Number(field?.dataset.scale || 0) - Number(field?.dataset.targetScale || 0)) < .01;
    }, undefined, { timeout: 15000 });
    await page.waitForFunction(id => Boolean(JSON.parse(document.querySelector('#field')?.dataset.visibleNodeHitBoxes || '{}')[id]), leafFixture.id, { timeout: 15000 });
    const pointForLeaf = async () => page.locator('#field').evaluate((el,id) => {
      const box = JSON.parse(el.dataset.visibleNodeHitBoxes || '{}')[id];
      if (!box) return null;
      const rect = el.getBoundingClientRect();
      return { x: rect.left + (box.left + box.right) / 2, y: rect.top + (box.top + box.bottom) / 2 };
    }, leafFixture.id);
    const firstLeafPoint = await pointForLeaf();
    assert.ok(firstLeafPoint, 'Leaf label must be visible before pointer activation');
    // A trusted pointer click selects the visible leaf but does not navigate.
    await page.evaluate(() => { window.__openedNotionUrls = []; });
    await page.mouse.click(firstLeafPoint.x, firstLeafPoint.y);
    await page.waitForFunction(title => document.querySelector('#selection .selection-title')?.textContent === title, leafFixture.title);
    assert.equal(await page.evaluate(() => window.__openedNotionUrls.length), 0, 'A pointer selection must not automatically open Notion');
    assert.equal(await page.locator('#selection .selection-open-link').getAttribute('href'), leafFixture.url, 'The selected leaf must expose its exact Notion destination');
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
      // Verify that the in-panel hierarchy path is generated from the active
      // language's canonical tree, not only from the French fixture.
      const localizedBranch = page.locator('#accessibleNodes button[data-level="1"]').first();
      await localizedBranch.focus();
      await localizedBranch.press('Enter');
      await page.waitForFunction(() => Boolean(document.querySelector('#selection .selection-path')));
      const localizedPath = await page.locator('#selection .selection-path').innerText();
      assert.ok(localizedPath.includes(await localizedBranch.getAttribute('data-notion-title')),
        `The ${language} selection path must include the canonical selected branch title`);
    }
    assert.deepEqual(errors, [], 'No uncaught browser errors');
    assert.deepEqual(consoleErrors, [], 'No browser console errors');
    assert.deepEqual(failedRequests, [], 'No failed network requests');
    await page.screenshot({ path: `artifacts/explorer-2d-${viewport.name}-selected.png`, fullPage: false });
    results.push({ viewport: viewport.name, canvas: [canvasSize.width, canvasSize.height], accessibleNodes: visibleNodes, languages: 'FR/EN/AR/PT', selectionStaysInScene: true, renderer: 'PixiJS WebGL', browserErrors: errors.length });
    await page.close();
  }
  console.log(JSON.stringify({ explorer2d: 'PASS', results }, null, 2));
} finally {
  await browser.close();
}
