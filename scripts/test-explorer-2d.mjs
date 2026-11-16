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
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('#loading')?.hidden === true, undefined, { timeout: 15000 });
    await page.locator('#field').waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.querySelector('#field')?.dataset.renderer === 'pixijs-webgl', undefined, { timeout: 20000 });
    const canvasSize = await page.locator('#field').evaluate(el => ({ width: el.width, height: el.height, rect: el.getBoundingClientRect().toJSON() }));
    assert.ok(canvasSize.width > 0 && canvasSize.height > 0, 'Canvas must have a real drawing surface');
    assert.equal(await page.locator('#field').getAttribute('data-renderer'), 'pixijs-webgl', 'PixiJS WebGL renderer must initialize');
    const initialUrl = page.url();
    const nav = page.locator('#accessibleNodes button');
    await page.waitForFunction(() => document.querySelectorAll('#accessibleNodes button').length >= 8);
    const visibleNodes = await nav.count();
    assert.ok(visibleNodes >= 8, 'At least the eight universe roots must be available');
    const target = await page.locator('#field').evaluate((canvas) => {
      const rect = canvas.getBoundingClientRect();
      const pad = Math.min(150, Math.max(78, rect.width * .16));
      const overviewScale = Math.max(.26, Math.min(.62,
        (rect.width - pad * 2) / 850,
        (rect.height - pad * 2) / 1110,
      ));
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 - 300 * overviewScale };
    });
    await page.mouse.click(target.x, target.y);
    await page.locator('#selection .card').waitFor({ state: 'visible' });
    assert.equal(page.url(), initialUrl, 'Selecting a branch must not navigate to another page');
    await page.locator('#zoomIn').click();
    assert.ok(await page.locator('#field').isVisible(), 'Canvas remains in the same scene after zoom');
    for (const language of ['en', 'ar', 'pt', 'fr']) {
      await page.locator('#language').selectOption(language);
      await page.waitForFunction(() => document.querySelector('#loading')?.hidden === true, undefined, { timeout: 15000 });
      await page.waitForFunction(() => document.querySelectorAll('#accessibleNodes button').length >= 8);
      assert.equal(await page.locator('#language').inputValue(), language);
    }
    assert.deepEqual(errors, [], 'No uncaught browser errors');
    await page.screenshot({ path: `artifacts/explorer-2d-${viewport.name}.png`, fullPage: false });
    results.push({ viewport: viewport.name, canvas: [canvasSize.width, canvasSize.height], accessibleNodes: visibleNodes, languages: 'FR/EN/AR/PT', selectionStaysInScene: true, renderer: 'PixiJS WebGL', browserErrors: errors.length });
    await page.close();
  }
  console.log(JSON.stringify({ explorer2d: 'PASS', results }, null, 2));
} finally {
  await browser.close();
}
