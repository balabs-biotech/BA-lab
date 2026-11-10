import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseURL = process.env.BALABS_SITE_URL || 'http://127.0.0.1:8765/';
const outputDir = process.env.BALABS_BROWSER_ARTIFACT_DIR || 'artifacts/3d-browser-smoke';
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

async function tapSpatialTarget(page, name, x, y, selector) {
  // Prefer the real semantic hit target whenever one is supplied. Coordinate-only
  // canvas taps can select a neighbouring domain on narrow mobile viewports.
  if (selector) {
    const target = (typeof selector === 'string' ? page.locator(selector) : selector).first();
    await target.waitFor({ state: 'visible', timeout: 5000 });
    if (name === 'mobile') {
      await target.scrollIntoViewIfNeeded();
      const rect = await target.boundingBox();
      assert.ok(rect && rect.width >= 40 && rect.height >= 40, name + ': branch dock target must have a real touch area after scrolling it into view');
      return target.tap({ timeout: 5000 });
    }
    return target.click();
  }
  if (name !== 'mobile') return page.mouse.click(x, y);
  return page.touchscreen.tap(x, y);
}

async function checkTwoFingerPan(page, name) {
  if (name !== 'mobile') return;
  const before = await page.evaluate(() => window.__BALABS_3D_E2E__()?.cameraTarget);
  assert.ok(before, name + ': camera target probe is unavailable before the two-finger gesture');
  const rect = await page.locator('#mainView .webgl-stage canvas').boundingBox();
  assert.ok(rect, name + ': canvas bounds are unavailable for the two-finger gesture');
  const session = await page.context().newCDPSession(page);
  const x = Math.round(rect.x + rect.width * .5);
  const y = Math.round(rect.y + rect.height * .5);
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: x - 34, y, id: 1 }, { x: x + 34, y, id: 2 }],
  });
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: x + 26, y: y + 8, id: 1 }, { x: x + 94, y: y + 8, id: 2 }],
  });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await session.detach();
  await page.waitForTimeout(150);
  const after = await page.evaluate(() => window.__BALABS_3D_E2E__()?.cameraTarget);
  const moved = after && Math.hypot(after.x - before.x, after.y - before.y, after.z - before.z);
  assert.ok(moved > 0.02, name + ': dragging with two fingers must pan the complete 3D map without changing hierarchy');
  const state = await page.evaluate(() => window.__BALABS_3D_E2E__());
  assert.ok(state?.selected === 'bio', name + ': two-finger panning must not change the selected universe');
  // Restore the original camera target so subsequent visibility and tap tests
  // exercise the same centered scene rather than an intentionally panned empty area.
  const restore = await page.context().newCDPSession(page);
  await restore.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: x + 26, y: y + 8, id: 1 }, { x: x + 94, y: y + 8, id: 2 }],
  });
  await restore.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: x - 34, y, id: 1 }, { x: x + 34, y, id: 2 }],
  });
  await restore.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await restore.detach();
  await page.waitForFunction((origin) => {
    const target = window.__BALABS_3D_E2E__()?.cameraTarget;
    return target && Math.hypot(target.x-origin.x,target.y-origin.y,target.z-origin.z)<0.08;
  }, before, { timeout: 8000 });
  console.log(name + ': two-finger map pan moved and restored camera target', { before, after });
}

async function checkWorkingScene(name, viewport) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1, isMobile: name === 'mobile', hasTouch: name === 'mobile' });
  const pageErrors = [];
  const browserDiagnostics = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') browserDiagnostics.push('console: ' + message.text()); });
  page.on('requestfailed', (request) => browserDiagnostics.push('request failed: ' + request.url() + ' — ' + (request.failure()?.errorText || 'unknown')));
  await page.goto(baseURL + (baseURL.includes('?') ? '&' : '?') + 'e2e=1', { waitUntil: 'domcontentloaded', timeout: 30000 });

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

  const failureCount = await page.locator('.webgl-load-error-panel').count();
  assert.equal(
    failureCount,
    0,
    name + ': the 3D engine must start instead of showing the failure state. ' +
      JSON.stringify({ pageErrors, browserDiagnostics, failureText: failureCount ? await page.locator('.webgl-load-error-panel').innerText() : null }),
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
  await page.waitForFunction(() => !document.querySelector('#mainView .webgl-stage')?.classList.contains('is-transitioning'), undefined, { timeout: 8000 });

  await page.waitForFunction(() => !!window.__BALABS_3D_E2E__()?.domainTarget, undefined, { timeout: 8000 });
  const domainTarget = await page.evaluate(() => window.__BALABS_3D_E2E__().domainTarget);
  const hitSurface = await page.evaluate(({x,y}) => { const stage=document.querySelector('.webgl-stage'), canvas=stage?.querySelector('canvas'), rect=el=>{const r=el?.getBoundingClientRect();return r?{x:r.x,y:r.y,width:r.width,height:r.height}:null};return{stage:rect(stage),canvas:rect(canvas),stagePointer:stage&&getComputedStyle(stage).pointerEvents,canvasPointer:canvas&&getComputedStyle(canvas).pointerEvents,element:document.elementFromPoint(x,y)?.tagName,elementClass:document.elementFromPoint(x,y)?.className,main:rect(document.querySelector('#mainView'))}; }, domainTarget);
  await page.evaluate(() => document.addEventListener('click', event => { window.__BALABS_3D_DOCUMENT_CLICK__ = {tag:event.target?.tagName, id:event.target?.id, className:typeof event.target?.className==='string'?event.target.className:'', stage:!!event.target?.closest?.('.webgl-stage'), x:event.clientX, y:event.clientY}; }, true));
  await tapSpatialTarget(page, name, domainTarget.x, domainTarget.y, '.webgl-domain-target[data-domain-id="bio"]');
  assert.equal(await page.evaluate(() => [document.querySelector('#mainView .webgl-stage'), document.querySelector('#mainView .webgl-stage canvas')].includes(document.activeElement)),
    true, name + ': pointer interaction must focus the interactive 3D stage so keyboard navigation is immediately available');
  await page.waitForFunction(() => {
    const mini = document.querySelector('#miniView');
    return mini?.classList.contains('spatial-source-only') &&
      getComputedStyle(mini).display === 'none';
  }, undefined, { timeout: 8000 }).catch(async error => { throw new Error('3D domain tap did not enter its domain: ' + JSON.stringify(await page.evaluate((surface) => ({probe:window.__BALABS_3D_E2E__(),lastPick:window.__BALABS_3D_LAST_PICK__,pickTrace:window.__BALABS_3D_PICK_TRACE__,documentClick:window.__BALABS_3D_DOCUMENT_CLICK__,hitSurface:surface}), hitSurface)) + ' — ' + error.message); });
  assert.ok(await canvas.isVisible(), name + ': entering a 3D domain must keep the WebGL canvas visible');
  assert.equal(await page.locator('#miniView.spatial-source-only').count(), 1,
    name + ': the legacy index must remain a hidden data source during 3D navigation');
  assert.equal(await page.locator('#miniView.spatial-source-only .linknode:visible').count(), 0,
    name + ': no legacy 2D links may overlay the 3D scene');
  await page.waitForFunction(() => !document.querySelector('#mainView .webgl-stage')?.classList.contains('is-transitioning'), undefined, { timeout: 8000 });
  await page.waitForFunction(() => typeof window.__BALABS_3D_E2E__ === 'function', undefined, { timeout: 5000 });
  await checkTwoFingerPan(page, name);
  await page.locator('.webgl-controls [data-camera="out"]').evaluate(button => button.click());
  await page.waitForFunction(() => window.__BALABS_3D_E2E__()?.visibleLabelDepths?.includes(0), undefined, { timeout: 8000 });
  await page.waitForFunction(() => (window.__BALABS_3D_E2E__()?.visible || 0) > 0, undefined, { timeout: 15000 }).catch(async error => { throw new Error('No 3D branch is visible for a real tap: ' + JSON.stringify(await page.evaluate(() => window.__BALABS_3D_E2E__())) + ' — ' + error.message); });
  await page.waitForFunction(() => [...document.querySelectorAll('.webgl-resource-target[data-has-children="true"]')].some(button=>!button.hidden&&getComputedStyle(button).display!=='none'), undefined, { timeout: 8000 });
  assert.ok(await page.locator('.webgl-resource-target[data-has-children="true"]').count() > 0, name + ': current hierarchy level must expose directly selectable map labels');
  const dockState = await page.evaluate(() => ({hidden:document.querySelector('.webgl-branch-dock')?.hidden,items:document.querySelectorAll('.webgl-branch-dock .webgl-branch-item').length}));
  assert.ok(dockState.hidden && dockState.items===0, name + ': no branch index may cover the 3D map');
  await page.evaluate(() => { window.__BALABS_3D_TARGET_EVENTS__=[]; for (const type of ['pointerdown','pointerup','click','touchend']) document.addEventListener(type,event=>{if(event.target?.closest?.('.webgl-hit-target,.webgl-branch-item'))window.__BALABS_3D_TARGET_EVENTS__.push({type,target:event.target.title||event.target.tagName,pointerType:event.pointerType||null,x:event.clientX??null,y:event.clientY??null})},true); });
  await page.evaluate(() => { window.__BALABS_3D_TARGET_EVENTS__=[]; window.__BALABS_3D_DOCUMENT_CLICK__=null; });
  await page.evaluate(() => { window.__BALABS_3D_E2E_CLICKS=0; window.__BALABS_3D_LAST_OPEN__=null; window.__BALABS_3D_LAST_OPEN_ERROR__=null; });
  let navigated = false;
  let openedNotion = false;
  let zoomOutChecked = false;
  for (let level = 0; level < 8; level++) {
    await page.waitForFunction(() => {
      const probe = window.__BALABS_3D_E2E__?.();
      return probe && !document.querySelector('#mainView .webgl-stage')?.classList.contains('is-transitioning');
    }, undefined, { timeout: 12000 });
    let probe = await page.evaluate(() => window.__BALABS_3D_E2E__());
    if (!probe.visible) {
      await page.locator('.webgl-controls [data-camera="out"]').evaluate(button => button.click());
      await page.waitForFunction(() => (window.__BALABS_3D_E2E__()?.visible || 0) > 0, undefined, { timeout: 12000 });
      probe = await page.evaluate(() => window.__BALABS_3D_E2E__());
    }
    if (level === 0) assert.ok(probe.nestedAvailable, name + ': active folders must expose their nested Notion subfolders for the next selectable level');
    const branchTarget = probe.target;
    assert.ok(branchTarget, name + ': no spatial folder/page target was found');
    if (branchTarget.hasChildren) {
      const depthBefore = probe.depth;
      const branchButtonPoint = await page.evaluate(() => { const buttons=[...document.querySelectorAll('.webgl-resource-target[data-has-children="true"]')]; const button=buttons.find(item=>{const rect=item.getBoundingClientRect();return !item.hidden&&getComputedStyle(item).display!=='none'&&rect.width>=40&&rect.height>=40}); if(!button)return null; const rect=button.getBoundingClientRect(); return {x:rect.left+rect.width/2,y:rect.top+rect.height/2,title:button.title,index:buttons.indexOf(button)}; });
      assert.ok(branchButtonPoint, name + ': at least one folder must expose an unobstructed DOM hit target. ' + JSON.stringify(await page.evaluate(() => ({probe:window.__BALABS_3D_E2E__(),targets:[...document.querySelectorAll('.webgl-resource-target')].map(button=>({title:button.title,hasChildren:button.dataset.hasChildren,depth:button.dataset.depth,hidden:button.hidden,display:getComputedStyle(button).display,rect:(()=>{const r=button.getBoundingClientRect();return{w:r.width,h:r.height,x:r.x,y:r.y}})()}))}))));
      const beforeActivation = await page.evaluate(() => ({clicks:window.__BALABS_3D_E2E_CLICKS||0,picks:window.__BALABS_3D_E2E__()?.pickCalls||0}));
      const clicksBefore = beforeActivation.clicks;
      await tapSpatialTarget(page, name, branchButtonPoint.x, branchButtonPoint.y, page.locator('.webgl-resource-target[data-has-children="true"]').nth(branchButtonPoint.index));
      await page.waitForFunction(({title,before}) => { const probe=window.__BALABS_3D_E2E__?.(); return window.__BALABS_3D_LAST_OPEN__?.title===title && (window.__BALABS_3D_E2E_CLICKS||0)>before && probe?.currentTitle===title && probe.childCount>0; }, {title:branchButtonPoint.title,before:clicksBefore}, { timeout: 8000 }).catch(async error => { throw new Error(name + ': selecting a branch did not activate the intended folder. ' + JSON.stringify(await page.evaluate(() => ({probe:window.__BALABS_3D_E2E__(),lastOpen:window.__BALABS_3D_LAST_OPEN__,clicks:window.__BALABS_3D_E2E_CLICKS,trace:window.__BALABS_3D_NAV_TRACE__,events:window.__BALABS_3D_TARGET_EVENTS__})) ) + ' expected=' + JSON.stringify({title:branchButtonPoint.title,before:beforeActivation}) + ' — ' + error.message); });
      await page.waitForTimeout(250);
      const activation = await page.evaluate(() => ({clicks:window.__BALABS_3D_E2E_CLICKS||0,last:window.__BALABS_3D_LAST_OPEN__,events:window.__BALABS_3D_TARGET_EVENTS__||[]}));
      assert.equal(activation.clicks, clicksBefore+1, name + ': one finger tap must activate a branch exactly once');
      assert.equal(await page.evaluate(() => window.__BALABS_3D_E2E__()?.pickCalls||0), beforeActivation.picks, name + ': a branch tap must not also trigger a spatial canvas selection');
      if(name==='mobile')assert.ok(activation.events.some(event=>event.type==='pointerup'&&event.target===branchButtonPoint.title), name + ': mobile branch selection must be handled on touch pointer release');
      await page.waitForFunction(() => !document.querySelector('#mainView .webgl-stage')?.classList.contains('is-transitioning'), undefined, { timeout: 8000 });
      const childLabelState = await page.evaluate(() => { const probe=window.__BALABS_3D_E2E__(); const targets=[...document.querySelectorAll('.webgl-resource-target')]; return {childCount:probe?.childCount,created:targets.length,visible:targets.filter(button=>!button.hidden&&getComputedStyle(button).display!=='none').length,dockHidden:document.querySelector('.webgl-branch-dock')?.hidden}; });
      assert.ok(childLabelState && childLabelState.dockHidden && childLabelState.created>=childLabelState.childCount && childLabelState.visible>0,
        name + ': selecting a branch must expose its children directly on the map, without a dock. ' + JSON.stringify(childLabelState));
      navigated = true;
      await page.waitForFunction(() => !document.querySelector('#mainView .webgl-stage')?.classList.contains('is-transitioning'), undefined, { timeout: 8000 });
      // Children of the opened folder are depth 0; depth 1 is the next generation, not a prerequisite.
      const visibleLabelState = await page.evaluate(() => window.__BALABS_3D_E2E__());
      assert.deepEqual(visibleLabelState?.visibleLabelDepths || [], [0], name + ': branch navigation must show only its immediate children until the next zoom level');
      assert.equal(visibleLabelState?.visibleLabelCountsByDepth?.[0] || 0, childLabelState.childCount,
        name + ': every immediate child must have its own visible text label at the branch navigation zoom. ' + JSON.stringify({childCount:childLabelState.childCount,visibleCounts:visibleLabelState?.visibleLabelCountsByDepth}));
      const domLabelState = await page.evaluate(() => ({created:document.querySelectorAll('.webgl-resource-target').length,visible:[...document.querySelectorAll('.webgl-resource-target')].filter(button=>!button.hidden&&getComputedStyle(button).display!=='none').length}));
      assert.ok(domLabelState.created >= childLabelState.childCount && domLabelState.visible > 0,
        name + ': branch labels must have real, visible DOM text targets. ' + JSON.stringify(domLabelState));
      assert.ok(await page.locator('.webgl-branch-dock').evaluate(el=>el.hidden), name + ': branch dock must remain hidden so the map stays unobstructed');
      await page.screenshot({ path: outputDir + '/' + name + '-branch-labels-v75.png', fullPage: false });
      if (!zoomOutChecked) {
        const nestedDepth = await page.evaluate(() => window.__BALABS_3D_E2E__()?.depth || 0);
        const cameraDistance = await page.evaluate(() => window.__BALABS_3D_E2E__()?.cameraDistance || 0);
        const labelPixelsBeforeZoomOut = await page.evaluate(() => window.__BALABS_3D_E2E__()?.labelPixels?.domain || 0);
        assert.ok(nestedDepth > 0, name + ': nested depth must be available before testing zoom-out');
        assert.ok(labelPixelsBeforeZoomOut > 18, name + ': labels must retain a readable minimum size at nested levels');
        await page.locator('.webgl-controls [data-camera="out"]').evaluate((button) => button.click());
        await page.waitForFunction((previous) => (window.__BALABS_3D_E2E__()?.cameraDistance || 0) > previous,
          cameraDistance, { timeout: 8000 });
        await page.waitForFunction((previous) => (window.__BALABS_3D_E2E__()?.labelPixels?.domain || 0) > previous,
          labelPixelsBeforeZoomOut, { timeout: 8000 });
        const labelPixelsAfterZoomOut = await page.evaluate(() => window.__BALABS_3D_E2E__()?.labelPixels?.domain || 0);
        assert.ok(labelPixelsAfterZoomOut > labelPixelsBeforeZoomOut, name + ': labels must grow when zooming out');
        const depthAfterZoom = await page.evaluate(() => window.__BALABS_3D_E2E__()?.depth || 0);
        assert.equal(depthAfterZoom, nestedDepth,
          name + ': camera zoom-out must not change the selected hierarchy level');
        zoomOutChecked = true;
        const distanceAfterZoomOut = await page.evaluate(() => window.__BALABS_3D_E2E__()?.cameraDistance || 0);
        await page.locator('.webgl-controls [data-camera="in"]').evaluate((button) => button.click());
        await page.waitForFunction(({ previous, expectedDepth }) => {
          const state = window.__BALABS_3D_E2E__();
          return state && state.cameraDistance < previous && state.depth === expectedDepth;
        }, { previous: distanceAfterZoomOut, expectedDepth: nestedDepth }, { timeout: 8000 });
        await page.waitForFunction((previous) => (window.__BALABS_3D_E2E__()?.labelPixels?.domain || Infinity) < previous,
          labelPixelsAfterZoomOut, { timeout: 8000 });
        const labelPixelsAfterZoomIn = await page.evaluate(() => window.__BALABS_3D_E2E__()?.labelPixels?.domain || 0);
        assert.ok(labelPixelsAfterZoomIn < labelPixelsAfterZoomOut, name + ': labels must shrink when zooming in');
        await page.locator('.webgl-controls [data-camera="in"]').evaluate((button) => button.click());
        await page.waitForFunction(() => window.__BALABS_3D_E2E__()?.visibleLabelDepths?.includes(1), undefined, { timeout: 8000 });
        const nextGenerationLabels = await page.evaluate(() => window.__BALABS_3D_E2E__()?.visibleLabelCountsByDepth?.[1] || 0);
        assert.ok(nextGenerationLabels > 0, name + ': the next hierarchy generation must appear after one further zoom step');
        const nextGenerationState = await page.evaluate(() => window.__BALABS_3D_E2E__());
        assert.deepEqual(nextGenerationState?.visibleLabelDepths || [], [1], name + ': zooming into sub-branches must replace, not stack, the previous generation labels');
        assert.equal(nextGenerationState?.visibleLabelCountsByDepth?.[0] || 0, 0, name + ': parent-generation labels must clear when child labels appear');
        const depthAfterZoomIn = await page.evaluate(() => window.__BALABS_3D_E2E__()?.depth || 0);
        assert.equal(depthAfterZoomIn, nestedDepth,
          name + ': camera zoom-in must not change the selected hierarchy level');
        // Restore the navigation framing after checking the next generation; otherwise
        // the following hierarchy iteration starts zoomed into a layer with no descendants.
        // The first generation remains active until the camera clears the label-depth hysteresis band.
        for (let restore = 0; restore < 8 && (await page.evaluate(() => window.__BALABS_3D_E2E__()?.cameraDistance || 0)) < 6.2; restore++) {
          await page.locator('.webgl-controls [data-camera="out"]').evaluate(button => button.click());
          await page.waitForTimeout(180);
        }
        await page.waitForFunction(() => (window.__BALABS_3D_E2E__()?.cameraDistance || 0) >= 6.2 && window.__BALABS_3D_E2E__()?.visibleLabelDepths?.includes(0), undefined, { timeout: 10000 });
      }
      continue;
    }
    assert.ok(branchTarget.url, name + ': terminal branch must carry its Notion destination');
    const terminalPoint = await page.evaluate(() => { const buttons=[...document.querySelectorAll('.webgl-resource-target[data-has-children="false"][data-resource-url]')]; const button=buttons.find(item=>{const rect=item.getBoundingClientRect();if(item.hidden||getComputedStyle(item).display==='none'||rect.width<40||rect.height<40||rect.right<0||rect.bottom<0||rect.left>innerWidth||rect.top>innerHeight)return false;const x=rect.left+rect.width/2,y=rect.top+rect.height/2,hit=document.elementFromPoint(x,y);return hit===item||item.contains(hit)}); if(!button)return null; const rect=button.getBoundingClientRect(); return {x:rect.left+rect.width/2,y:rect.top+rect.height/2,title:button.title,index:buttons.indexOf(button)}; });
    assert.ok(terminalPoint, name + ': at least one page must expose an unobstructed DOM hit target');
    const popupPromise = page.waitForEvent('popup', { timeout: 10000 });
    const [popup] = await Promise.all([
      popupPromise,
      tapSpatialTarget(page, name, terminalPoint.x, terminalPoint.y, page.locator('.webgl-resource-target[data-has-children="false"][data-resource-url]').nth(terminalPoint.index)),
    ]);
    await popup.waitForLoadState('domcontentloaded', { timeout: 12000 }).catch(() => {});
    assert.match(popup.url(), /notion\.(so|site|com)/i, name + ': terminal branch must open its Notion page');
    await popup.close();
    openedNotion = true;
    break;
  }
  assert.ok(navigated, name + ': tapping a folder must reveal a deeper spatial level');
  assert.ok(openedNotion, name + ': tapping a terminal page must open Notion');
  assert.ok(zoomOutChecked, name + ': zoom-out control was not exercised at a nested level');
  const depthBeforeBack = await page.evaluate(() => window.__BALABS_3D_E2E__()?.depth || 0);
  for (let step = 0; step <= depthBeforeBack; step++) {
    const before = await page.evaluate(() => window.__BALABS_3D_E2E__()?.depth || 0);
    await page.locator('.webgl-controls [data-camera="back"]').evaluate((button) => button.click());
    await page.waitForFunction((previous) => {
      const probe = window.__BALABS_3D_E2E__();
      return probe?.selected === null || (probe?.depth || 0) < previous;
    }, before, { timeout: 8000 });
  }
  await page.waitForFunction(() => window.__BALABS_3D_E2E__()?.selected === null && document.querySelector('#miniView')?.hidden,
    undefined, { timeout: 8000 }).catch(async error => { throw new Error(name + ': returning through the hierarchy must reach the overview: ' + JSON.stringify(await page.evaluate(() => window.__BALABS_3D_E2E__())) + ' — ' + error.message); });
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
