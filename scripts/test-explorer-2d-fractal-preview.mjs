import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

await mkdir('artifacts', { recursive: true });
const base = process.env.BALABS_FRACTAL_PREVIEW_URL || 'http://127.0.0.1:8766/explorer-2d-fractal-preview.html';
const browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader'] });
const results = [];
try {
  for (const viewport of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height }, isMobile: viewport.name === 'mobile', hasTouch: viewport.name === 'mobile' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => {
      const note = document.querySelector('#note')?.textContent || '';
      return note.includes('ramifications') && document.querySelector('#view canvas');
    }, undefined, { timeout: 30000 });
    const details = await page.locator('#note').innerText();
    assert.match(details, /\d+ ramifications/);
    assert.match(details, /\d+ jonctions/);
    assert.match(details, /\d+ terminaisons/);
    const status = await page.locator('#status').innerText();
    assert.match(status, /ESPACE RÉSERVÉ AVANT DESSIN/);
    const canvas = await page.locator('#view canvas').evaluate(el => ({ width: el.width, height: el.height, rect: el.getBoundingClientRect().toJSON() }));
    assert.ok(canvas.width > 0 && canvas.height > 0, 'PixiJS must create a non-empty drawing surface');
    assert.ok(canvas.rect.width >= viewport.width * .95 && canvas.rect.height > viewport.height * .8, 'Canvas must occupy the preview viewport');
    await page.mouse.move(viewport.width / 2, viewport.height / 2);
    await page.mouse.wheel(0, -320);
    await page.waitForTimeout(150);
    assert.deepEqual(errors, [], 'Preview must not throw browser errors');
    await page.screenshot({ path: `artifacts/explorer-2d-fractal-${viewport.name}.png` });
    results.push({ viewport: viewport.name, canvas: [canvas.width, canvas.height], branch: details, status, browserErrors: errors.length });
    await page.close();
  }
  console.log(JSON.stringify({ fractalPreview: 'PASS', results }, null, 2));
} finally {
  await browser.close();
}
