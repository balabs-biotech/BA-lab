import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = process.env.BALABS_SITE_URL || 'http://127.0.0.1:8765/';
const outputDir = process.env.BALABS_BROWSER_ARTIFACT_DIR || 'artifacts/vernpixi-primary';
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const viewport of [
    { name: 'desktop', width: 1440, height: 1000 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    const page = await browser.newPage({
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: viewport.name === 'mobile',
      hasTouch: viewport.name === 'mobile',
    });
    const errors = [];
    const failed = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('requestfailed', request => { const reason = request.failure()?.errorText || 'unknown'; if (reason !== 'net::ERR_ABORTED') failed.push(request.url() + ' — ' + reason); });
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.locator('#app .editorial-method').waitFor({ state: 'visible', timeout: 15000 });
    assert.equal(await page.locator('script[src*="engine-v2.js"]').count(), 0, 'The legacy 3D engine must not load on the primary site');
    assert.equal(await page.locator('#mainView:visible,#miniView:visible').count(), 0, 'Legacy 3D scene must not remain visible');
    await page.locator('#inlineExplorer').waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.querySelector('#loading')?.hidden === true, undefined, { timeout: 30000 });
    await page.locator('#field').waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.querySelector('#field')?.dataset.renderer === 'pixijs-webgl', undefined, { timeout: 20000 });
    assert.equal(await page.locator('#field').getAttribute('data-universe-count'), '8');
    for (const language of ['fr', 'en', 'ar', 'pt']) {
      await page.locator('[data-lang="' + language + '"]').first().click();
      await page.waitForFunction((expected) => document.documentElement.lang === expected && document.querySelector('#loading')?.hidden === true, language, { timeout: 15000 });
    }
    await page.locator('[data-lang="fr"]').first().click();
    await page.waitForFunction(() => document.documentElement.lang === 'fr' && document.querySelector('#loading')?.hidden === true, undefined, { timeout: 15000 });
    const originalUrl = page.url();
    await page.locator('a[data-domain-page="myco"]').first().click();
    await page.waitForFunction(() => document.querySelector('#selection .card-title')?.textContent === 'MYCOLOGIE', undefined, { timeout: 15000 });
    assert.equal(page.url(), originalUrl, 'Selecting a universe must stay inside the normal BA Labs homepage');
    assert.ok((await page.locator('#selection .card-title').innerText()).length > 0, 'Direct domain selection must focus the requested universe in the embedded scene');
    assert.deepEqual(errors, [], 'No uncaught browser errors');
    assert.deepEqual(failed, [], 'No failed network requests');
    await page.screenshot({ path: outputDir + '/' + viewport.name + '-vernpixi-primary.png', fullPage: false });
    results.push({ viewport: viewport.name, renderer: 'PixiJS 2D embedded in homepage', universes: 8, directDomainEntry: true, staysOnHomepage: true, browserErrors: errors.length });
    await page.close();
  }
  const route = await browser.newPage();
  await route.goto(base + 'universe.html?domain=soil&lang=pt', { waitUntil: 'domcontentloaded' });
  await route.waitForURL(/explorer-2d\.html\?domain=soil&lang=pt|explorer-2d\.html\?lang=pt&domain=soil/, { timeout: 10000 });
  console.log(JSON.stringify({ vernpixiEmbeddedHomepage: 'PASS', results, universeRouteRedirect: true }, null, 2));
  await route.close();
} finally {
  await browser.close();
}
