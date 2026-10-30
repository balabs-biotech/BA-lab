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
  await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 30000 });

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
