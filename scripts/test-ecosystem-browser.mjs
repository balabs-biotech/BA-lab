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
  const stage = page.locator('#mainView .webgl-stage');
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

  if (viewport.width <= 760) {
    const hintRect = await page.locator('#mainView .webgl-stage .webgl-hint').evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const stageRect = el.parentElement.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, stageTop: stageRect.top, stageHeight: stageRect.height };
    });
    assert.ok(hintRect.top - hintRect.stageTop < hintRect.stageHeight * 0.35,
      name + ': mobile navigation hint must stay above the lower network branches');
  }

  await page.screenshot({ path: outputDir + '/' + name + '-gateway.png', fullPage: false });
  const intro = page.locator('#mainView .webgl-intro');
  await intro.waitFor({ state: 'visible' });
  await intro.click();
  await page.waitForFunction(() => document.querySelector('#mainView')?.classList.contains('universe-open'), undefined, { timeout: 5000 });
  assert.equal(await intro.isVisible(), false, name + ': gateway overlay must leave the scene after entry');
  assert.ok(await canvas.isVisible(), name + ': the 3D canvas must remain visible after entering');
  // Let the longest camera transition finish before judging the rendered overview.
  await page.waitForTimeout(2200);
  const renderState = await canvas.evaluate((el) => ({
    frames: Number(el.dataset.renderFrame || 0),
    worldVisible: el.dataset.worldVisible,
    worldChildren: Number(el.dataset.worldChildren || 0),
    cameraDistance: Number(el.dataset.cameraDistance || 0),
    cameraAspect: Number(el.dataset.cameraAspect || 0),
    drawCalls: Number(el.dataset.drawCalls || 0),
    triangles: Number(el.dataset.triangles || 0),
    glError: Number(el.dataset.glError || 0),
    projectedRoots: JSON.parse(el.dataset.projectedRoots || '[]'),
    pixelProbe: JSON.parse(el.dataset.pixelProbe || '{}'),
    canvasRect: (() => { const r=el.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height,bufferWidth:el.width,bufferHeight:el.height}; })(),
    stageRect: (() => { const r=el.parentElement.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height}; })(),
    position: getComputedStyle(el).position,
    zIndex: getComputedStyle(el).zIndex,
    opacity: getComputedStyle(el).opacity,
  }));
  assert.ok(renderState.frames > 0, name + ': WebGL animation loop did not render any frames');
  assert.equal(renderState.worldVisible, 'true', name + ': 3D network group must be visible after entering the universe');
  assert.ok(renderState.worldChildren > 0, name + ': 3D network group must contain rendered objects');
  assert.ok(renderState.cameraDistance > 0 && renderState.cameraAspect > 0, name + ': camera dimensions must be valid');
  assert.ok(renderState.drawCalls > 0 && renderState.triangles > 0, name + ': WebGL must submit visible mesh geometry');
  assert.equal(renderState.glError, 0, name + ': WebGL context reported a graphics error');
  assert.ok(renderState.pixelProbe.sampled > 0, name + ': WebGL canvas pixel probe did not run');
  if (viewport.width <= 760) console.log(name + ': mobile render diagnostics', JSON.stringify(renderState));
  // Precision picking contract: every root domain must be independently selectable
  // from its projected screen position, not merely visible in the overview.
  const rootNames = {
    bio: /bio|biolog|biology|biologia|الأحياء/i,
    myco: /myco|champignon|fung|micolog|فطر/i,
    soil: /soil|sol|substrat|التربة/i,
    lab: /lab|laboratoire|laboratory|laboratório|مختبر/i,
    products: /product|produit|kit|produção|منتج/i,
    iot: /iot|automatis|automation|automação|إنترنت/i,
    work: /work|projet|project|trabalho|عمل/i,
    learn: /learn|formation|education|apprentissage|aprendizagem|تعلم/i,
  };
  for (const id of ['bio','myco','soil','lab','products','iot','work','learn']) {
    if (await root.locator('.webgl-focus.has-world').count()) {
      await page.locator('#mainView .webgl-controls button[data-camera="reset"]').click();
      await page.waitForTimeout(1500);
    }
    const projected = await canvas.evaluate((el, targetId) => {
      const roots = JSON.parse(el.dataset.projectedRoots || '[]');
      const root = roots.find(item => item.id === targetId);
      const rect = el.getBoundingClientRect();
      return root ? { x: rect.left + (root.x + 1) * .5 * rect.width, y: rect.top + (1 - root.y) * .5 * rect.height, ndc: root } : null;
    }, id);
    assert.ok(projected && Math.abs(projected.ndc.x) < .92 && Math.abs(projected.ndc.y) < .92,
      name + ': ' + id + ' must remain inside the selectable viewport');
    await page.mouse.move(projected.x, projected.y);
    try {
      await page.waitForFunction((targetId) => document.querySelector('#mainView .webgl-stage')?.dataset.hoverWorld === targetId, id, { timeout: 5000 });
    } catch (error) {
      const hitState = await stage.evaluate(el => ({ hoverWorld: el.dataset.hoverWorld, lastHitKind: el.dataset.lastHitKind, lastHitId: el.dataset.lastHitId, lastPointer: el.dataset.lastPointer, rect: (() => { const r=el.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height}; })() }));
      throw new Error(name + ': precise hover failed for ' + id + ': ' + JSON.stringify({ projected, hitState }) + '; ' + error.message);
    }
    await page.mouse.click(projected.x, projected.y);
    try { await page.waitForFunction((targetId) => document.querySelector('#mainView .webgl-stage')?.dataset.selectedWorld === targetId, id, { timeout: 5000 }); } catch (error) { const clickState = await stage.evaluate(el => ({ selectedWorld:el.dataset.selectedWorld, stagePointerDownTarget:el.dataset.stagePointerDownTarget, stagePointerDownClass:el.dataset.stagePointerDownClass, stagePointerDownAt:el.dataset.stagePointerDownAt, stagePointerDownPath:el.dataset.stagePointerDownPath, clickMoved:el.dataset.clickMoved, clickTarget:el.dataset.clickTarget, clickSelected:el.dataset.clickSelected, pointerUpTarget:el.dataset.pointerUpTarget, pointerUpTracked:el.dataset.pointerUpTracked, pointerUpMoved:el.dataset.pointerUpMoved, pointerUpPicked:el.dataset.pointerUpPicked, documentClickTarget:el.dataset.documentClickTarget, documentClickClass:el.dataset.documentClickClass, documentClickBlocked:el.dataset.documentClickBlocked, documentClickPicked:el.dataset.documentClickPicked, introState:(()=>{const n=document.querySelector('#mainView .webgl-intro');if(!n)return null;const s=getComputedStyle(n);return {display:s.display,visibility:s.visibility,pointerEvents:s.pointerEvents,inlineDisplay:n.style.display,inert:n.inert,ariaHidden:n.getAttribute('aria-hidden'),parentClass:n.parentElement?.className,rootClass:document.querySelector('#mainView')?.className,elementAtPoint:(document.elementFromPoint(Number(el.dataset.lastPointer?.split(',')[0]||0),Number(el.dataset.lastPointer?.split(',')[1]||0))?.className||document.elementFromPoint(Number(el.dataset.lastPointer?.split(',')[0]||0),Number(el.dataset.lastPointer?.split(',')[1]||0))?.tagName)};})(), lastHitKind:el.dataset.lastHitKind, lastHitId:el.dataset.lastHitId, lastPointer:el.dataset.lastPointer })); throw new Error(name + ': click selection failed for ' + id + ': ' + JSON.stringify({ projected, clickState }) + '; ' + error.message); }
    await page.waitForFunction(() => {
      const panel = document.querySelector('#mainView .webgl-focus');
      return panel && !panel.hidden && panel.classList.contains('has-world') &&
        panel.querySelector('strong')?.textContent?.trim().length > 0;
    }, undefined, { timeout: 5000 });
    const selectedTitle = await page.locator('#mainView .webgl-focus strong').first().textContent();
    assert.ok(selectedTitle && selectedTitle.trim().length > 0,
      name + ': ' + id + ' must resolve to a readable domain detail');
    console.log(name + ': precision root selection', id, selectedTitle.trim());
  }
  await canvas.screenshot({ path: outputDir + '/' + name + '-canvas.png' });
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
