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
    page.on('requestfailed', request => failed.push(request.url() + ' — ' + (request.failure()?.errorText || 'unknown')));
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.locator('#app .editorial-method').waitFor({ state: 'visible', timeout: 15000 });
    assert.equal(await page.locator('script[src*="engine-v2.js"]').count(), 0, 'The legacy 3D engine must not load on the primary site');
    assert.equal(await page.locator('#mainView:visible,#miniView:visible').count(), 0, 'Legacy 3D scene must not remain visible');
    const explorerLink = page.locator('#open2DExplorer');
    await explorerLink.waitFor({ state: 'visible' });
    assert.match(await explorerLink.getAttribute('href'), /explorer-2d\.html/, 'Primary explorer CTA must point to Vernpixi');
    for (const language of ['fr', 'en', 'ar', 'pt']) {
      const button = page.locator('[data-lang="' + language + '"]');
      if (await button.count()) await button.first().click();
    }
    await page.locator('[data-lang="fr"]').first().click();
    await page.locator('a[data-domain-page="myco"]').first().click();
    await page.waitForURL(/explorer-2d\.html\?domain=myco&lang=fr|explorer-2d\.html\?lang=fr&domain=myco/, { timeout: 10000 });
    await page.waitForFunction(() => document.querySelector('#loading')?.hidden === true, undefined, { timeout: 30000 });
    await page.locator('#field').waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.querySelector('#field')?.dataset.renderer === 'pixijs-webgl', undefined, { timeout: 20000 });
    assert.equal(await page.locator('#field').getAttribute('data-universe-count'), '8');
    await page.locator('#selection .card-title').waitFor({ state: 'visible' });
    assert.ok((await page.locator('#selection .card-title').innerText()).length > 0, 'Direct domain entry must focus the requested universe');
    assert.deepEqual(errors, [], 'No uncaught browser errors');
    assert.deepEqual(failed, [], 'No failed network requests');
    await page.screenshot({ path: outputDir + '/' + viewport.name + '-vernpixi-primary.png', fullPage: false });
    results.push({ viewport: viewport.name, renderer: 'PixiJS 2D', universes: 8, directDomainEntry: true, browserErrors: errors.length });
    await page.close();
  }
  const route = await browser.newPage();
  await route.goto(base + 'universe.html?domain=soil&lang=pt', { waitUntil: 'domcontentloaded' });
  await route.waitForURL(/explorer-2d\.html\?domain=soil&lang=pt|explorer-2d\.html\?lang=pt&domain=soil/, { timeout: 10000 });
  console.log(JSON.stringify({ vernpixiPrimary: 'PASS', results, universeRouteRedirect: true }, null, 2));
  await route.close();
} finally {
  await browser.close();
}
