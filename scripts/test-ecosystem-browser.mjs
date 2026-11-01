import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseURL = process.env.BALABS_SITE_URL || 'http://127.0.0.1:8765/';
const outputDir = 'artifacts/3d-browser-smoke';
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: [
    '--enable-webgl',
    '--ignore-gpu-blocklist',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
  ],
});

async function checkWorkingScene(name, viewport) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  const pageErrors = [];
  const browserDiagnostics = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') browserDiagnostics.push('console: ' + message.text()); });
  page.on('requestfailed', (request) => browserDiagnostics.push('request failed: ' + request.url() + ' — ' + (request.failure()?.errorText || 'unknown')));
  const testURL = new URL(baseURL);
  testURL.searchParams.set('test3d', '1');
  await page.goto(testURL.toString(), { waitUntil: 'domcontentloaded', timeout: 30000 });

  try {
    await page.waitForFunction(() => {
      const root = document.querySelector('#mainView');
      return root?.classList.contains('webgl-ready') ||
        !!document.querySelector('.webgl-load-error-panel');
    }, undefined, { timeout: 35000 });
  } catch (error) {
    const state = await page.evaluate(() => ({
      readyState: document.readyState,
      rootClass: document.querySelector('#mainView')?.className || null,
      moduleScripts: [...document.querySelectorAll('script[type="module"]')].map((item) => item.src),
      stageCount: document.querySelectorAll('#mainView .webgl-stage').length,
      canvasCount: document.querySelectorAll('#mainView canvas').length,
      failurePanelCount: document.querySelectorAll('.webgl-load-error-panel').length,
    }));
    throw new Error(name + ': 3D engine did not reach ready or failure state. ' +
      JSON.stringify({ state, pageErrors, browserDiagnostics, cause: error.message }));
  }

  assert.equal(
    await page.locator('.webgl-load-error-panel').count(),
    0,
    name + ': the 3D engine must start instead of showing the failure state',
  );
  const root = page.locator('#mainView');
  await root.waitFor({ state: 'visible' });
  assert.ok(await root.evaluate((el) => el.classList.contains('webgl-ready')), name + ': WebGL-ready state missing');
  assert.ok(await root.evaluate((el) => el.classList.contains('universe-closed')), name + ': gateway must be the initial state');

  const canvas = page.locator('#mainView .webgl-stage canvas');
  await canvas.waitFor({ state: 'visible', timeout: 15000 });
  const canvasState = await canvas.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const gl = el.getContext('webgl2') || el.getContext('webgl');
    return {
      width: el.width,
      height: el.height,
      visibleWidth: rect.width,
      visibleHeight: rect.height,
      webglContext: !!gl,
      display: getComputedStyle(el).display,
    };
  });
  assert.ok(canvasState.webglContext, name + ': browser did not create a WebGL context');
  assert.ok(canvasState.width > 0 && canvasState.height > 0, name + ': canvas has zero drawing dimensions');
  assert.ok(canvasState.visibleWidth > 250 && canvasState.visibleHeight > 300, name + ': 3D canvas is clipped or collapsed');

  const legacyVisible = await page.locator('#mainView .sphere').evaluateAll((items) =>
    items.filter((el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    }).length,
  );
  assert.equal(legacyVisible, 0, name + ': old HTML spheres must not appear over the WebGL scene');

  await page.screenshot({ path: outputDir + '/' + name + '-gateway.png', fullPage: false });
  const intro = page.locator('#mainView .webgl-intro');
  await intro.waitFor({ state: 'visible' });
  await intro.click();
  await page.waitForFunction(() => document.querySelector('#mainView')?.classList.contains('universe-open'), undefined, { timeout: 5000 });
  assert.equal(await intro.isVisible(), false, name + ': gateway overlay must leave the scene after entry');
  assert.ok(await canvas.isVisible(), name + ': the 3D canvas must remain visible after entering');
  await page.waitForTimeout(700);
  await page.screenshot({ path: outputDir + '/' + name + '-universe.png', fullPage: false });

  // Click the projected center of every 3D cell on the real canvas.
  // The test probe only supplies screen coordinates; picking remains the production raycaster.
  const worldIds = ['bio', 'myco', 'soil', 'lab', 'products', 'iot', 'work', 'learn'];
  const visited = new Set();
  const activeWorld = page.locator('#mainView .webgl-focus-kicker');
  for (const id of worldIds) {
    await page.waitForFunction(() => !document.querySelector('#mainView .webgl-stage')?.classList.contains('is-transitioning'),
      undefined, { timeout: 8000 });
    const point = await page.evaluate((worldId) => window.__BALABS_3D_TEST__?.screenPoint(worldId), id);
    assert.ok(point && Number.isFinite(point.x) && Number.isFinite(point.y),
      name + ': missing projected screen coordinate for ' + id);
    let selectedId = null;
    for (const [dx, dy] of [[0, 0], [0, -18], [18, 0], [-18, 0], [0, 18]]) {
      await page.mouse.click(point.x + dx, point.y + dy);
      await page.waitForTimeout(180);
      selectedId = await activeWorld.getAttribute('data-world-id');
      if (selectedId === id) break;
    }
    assert.equal(selectedId, id, name + ': real WebGL canvas click did not select ' + id + ' (selected ' + selectedId + ')');
    visited.add(id);
    const connectionCount = await page.locator('#mainView .webgl-focus-link[data-world]').count();
    assert.ok(connectionCount > 0, name + ': selected world ' + id + ' has no visible navigation connections');
  }
  assert.equal(visited.size, 8, name + ': all eight 3D cells must be selectable by pointer');

  // Verify a connection-panel transition also changes the selected world.
  const connection = page.locator('#mainView .webgl-focus-link[data-world]').first();
  const connectionTarget = await connection.getAttribute('data-world');
  assert.ok(connectionTarget, name + ': selected world has no clickable related domain');
  await connection.click();
  await page.waitForFunction((id) => document.querySelector('#mainView .webgl-focus-kicker')?.dataset.worldId === id,
    connectionTarget, { timeout: 8000 });

  const zoomOut = page.locator('#mainView .webgl-controls button[data-camera="out"]');
  await zoomOut.click();
  await page.waitForFunction(() => {
    const el = document.querySelector('#mainView .webgl-focus-kicker');
    return !!el && !el.dataset.worldId && /INDEX SPATIAL/i.test(el.textContent || '');
  }, undefined, { timeout: 8000 });
  assert.ok(await canvas.isVisible(), name + ': return to network overview must preserve the 3D canvas');

  assert.deepEqual(pageErrors, [], name + ': uncaught browser errors detected');
  console.log(name + ': WebGL started, legacy spheres hidden, gateway entered successfully', JSON.stringify(canvasState));
  await page.close();
}

async function checkPrimaryCdnFallback() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.route('https://cdn.jsdelivr.net/**', (route) => route.abort());
  await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => {
    const root = document.querySelector('#mainView');
    return root?.classList.contains('webgl-ready') ||
      !!document.querySelector('.webgl-load-error-panel');
  }, undefined, { timeout: 35000 });
  assert.equal(await page.locator('.webgl-load-error-panel').count(), 0,
    'The pinned secondary CDN must start the 3D scene when jsDelivr is unavailable');
  assert.ok(await page.locator('#mainView .webgl-stage canvas').isVisible(),
    'The secondary CDN must create a visible 3D canvas');
  console.log('CDN fallback: 3D scene started after jsDelivr was blocked');
  await page.close();
}

async function checkFailureState() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  for (const host of ['cdn.jsdelivr.net', 'unpkg.com', 'esm.sh']) {
    await page.route('https://' + host + '/**', (route) => route.abort());
  }
  await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.locator('.webgl-load-error-panel').waitFor({ state: 'visible', timeout: 60000 });
  const visibleLegacy = await page.locator('#mainView .sphere').evaluateAll((items) =>
    items.filter((el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    }).length,
  );
  assert.equal(visibleLegacy, 0, 'WebGL failure must not revive the legacy sphere interface');
  assert.ok(await page.locator('.webgl-load-error-panel button').isVisible(), 'Failure state must offer a retry action');
  await page.screenshot({ path: outputDir + '/webgl-failure-state.png', fullPage: false });
  console.log('Failure path: legacy spheres remain suppressed and retry state is visible');
  await page.close();
}

try {
  await checkWorkingScene('desktop', { width: 1440, height: 1000 });
  await checkWorkingScene('mobile', { width: 390, height: 844 });
  await checkPrimaryCdnFallback();
  await checkFailureState();
} finally {
  await browser.close();
}
