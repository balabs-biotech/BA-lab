import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.BALABS_ACADEMY_EXPLORER_URL || 'http://127.0.0.1:8768/ecosystem-preview/explorer-2d.html?lang=fr';
const browser = await chromium.launch({ headless: true, args: ['--enable-webgl'] });
try {
  const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#loading')?.hidden === true, undefined, { timeout: 30000 });
  await page.waitForFunction(() => document.querySelector('#field')?.dataset.renderer === 'pixijs-webgl', undefined, { timeout: 20000 });
  const graph = await page.locator('#field').evaluate(el => ({ universes: Number(el.dataset.universeCount), nodes: Number(el.dataset.nodeCount), edges: Number(el.dataset.edgeCount) }));
  assert.equal(graph.universes, 8, 'Academy must display all eight universes');
  assert.ok(graph.nodes > 8 && graph.edges >= graph.nodes - 8, 'Academy graph must render the hierarchical network');
  const root = page.locator('#accessibleNodes button[data-level="0"]').first();
  await root.focus();
  await root.press('Enter');
  await page.waitForFunction(() => Boolean(document.querySelector('#selection')?.textContent?.trim()));
  assert.deepEqual(errors, [], 'Academy shared engine must not throw browser errors');
  await page.screenshot({ path: 'artifacts/vernpixi-academy-shared-engine.png', fullPage: false });
  console.log(JSON.stringify({ academyVernpixi: 'PASS', ...graph }, null, 2));
} finally {
  await browser.close();
}
