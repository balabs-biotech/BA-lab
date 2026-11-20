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
    const badImageResponses = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('requestfailed', request => { const reason = request.failure()?.errorText || 'unknown'; if (reason !== 'net::ERR_ABORTED') failed.push(request.url() + ' — ' + reason); });
    page.on('response', response => {
      if (/\.(?:jpe?g|png|webp)(?:[?#]|$)/i.test(response.url()) && response.status() >= 400) {
        badImageResponses.push(response.url() + ' — HTTP ' + response.status());
      }
    });
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.locator('#app .editorial-method').waitFor({ state: 'visible', timeout: 15000 });
    // Verify the current organic mycelial hero field (the legacy Vanta renderer was removed).
    const motionEligibility = await page.evaluate(() => ({
      reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
      saveData: navigator.connection?.saveData === true,
      lowPower: /Android|iPhone|iPad/i.test(navigator.userAgent) && (navigator.hardwareConcurrency || 4) <= 4
    }));
    let heroMotion = { ...motionEligibility, active: false, width: 0, height: 0 };
    if (viewport.name === 'desktop') {
      await page.waitForFunction(() => {
        const canvas = document.querySelector('#accueil canvas.balabs-organic-field');
        return !!canvas && canvas.width > 0 && canvas.height > 0;
      }, undefined, { timeout: 15000 });
      heroMotion = await page.locator('#accueil canvas.balabs-organic-field').evaluate((canvas, eligibility) => ({
        ...eligibility,
        active: canvas.width > 0 && canvas.height > 0,
        width: canvas.width,
        height: canvas.height
      }), motionEligibility);
      assert.ok(heroMotion.active, 'The desktop hero must initialize its organic mycelial canvas');
    }
    // Test the actual packaged image files, not merely whether the page JS starts.
    const imageAudit = await page.evaluate(async () => {
      const images = [...document.images];
      images.forEach(image => { image.loading = 'eager'; });
      await Promise.all(images.map(image => image.decode().catch(() => null)));
      return images.map(image => ({
        src: image.currentSrc || image.src,
        loaded: image.complete && image.naturalWidth > 0,
        width: image.naturalWidth
      }));
    });
    const brokenImages = imageAudit.filter(image => !image.loaded);
    assert.deepEqual(badImageResponses, [], 'No image asset may return an HTTP error');
    assert.deepEqual(brokenImages, [], 'Every rendered site image must decode successfully');
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
      const visibleCatalogueLanguages = await page.locator('#chapter-catalogue .product-catalogue-intro p[data-cat-lang]').evaluateAll(nodes => nodes.filter(node => getComputedStyle(node).display !== 'none').map(node => node.dataset.catLang));
      assert.deepEqual(visibleCatalogueLanguages, [language], 'Catalogue page 5 must show only the selected language (' + language + ')');
    }
    await page.locator('[data-lang="fr"]').first().click();
    await page.waitForFunction(() => document.documentElement.lang === 'fr' && document.querySelector('#loading')?.hidden === true, undefined, { timeout: 15000 });

    // Audit real image decoding on every editorial chapter after navigation.
    const chapterImageAudits = [];
    for (const [index, chapter] of ['home','research','network','catalogue','about'].entries()) {
      if (viewport.name === 'mobile') await page.locator('.chapter-rail-node').nth(index).tap();
      else await page.locator('.chapter-rail-node').nth(index).click();
      await page.waitForFunction((id) => document.querySelector('#chapter-' + id)?.getAttribute('aria-current') === 'page', chapter, { timeout: 10000 });
      await page.waitForFunction((index) => { const track=document.querySelector('#experienceTrack'); return !!track && Math.abs(track.scrollLeft-index*track.clientWidth)<3; }, index, { timeout: 10000 });
      assert.equal(await page.locator('.chapter-rail-node').nth(index).getAttribute('aria-current'),'step','The tapped chapter dot must remain the active navigation point');
      await page.waitForTimeout(650);
      if (viewport.name === 'mobile' && chapter === 'network') {
        const frame = await page.locator('#inlineExplorer').evaluate(root => {
          const stage = root.querySelector('.inline-explorer-stage');
          const canvas = root.querySelector('#field');
          const rect = el => { const r=el.getBoundingClientRect(); return {left:r.left,right:r.right,width:r.width}; };
          return {viewportWidth:document.documentElement.clientWidth,documentWidth:document.documentElement.scrollWidth,root:rect(root),stage:rect(stage),canvas:rect(canvas)};
        });
        console.log('MOBILE_NETWORK_FRAME '+JSON.stringify(frame));
        assert.ok(frame.root.left >= -1 && frame.root.right <= frame.viewportWidth + 1, 'Mobile network explorer must fit inside the visible reading viewport: '+JSON.stringify(frame));
        assert.ok(frame.stage.left >= frame.root.left - 1 && frame.stage.right <= frame.root.right + 1, 'Mobile network stage must not exceed its frame: '+JSON.stringify(frame));
        assert.ok(frame.canvas.left >= frame.stage.left - 1 && frame.canvas.right <= frame.stage.right + 1, 'Mobile network canvas must use the actual stage width: '+JSON.stringify(frame));
      }
      const audit = await page.evaluate(async (chapterId) => {
        const root = document.querySelector('#app .experience-page[data-chapter="' + chapterId + '"]') || document.querySelector('#app .experience-page');
        if (!root) return { chapter: chapterId, images: [], missing: ['chapter root not found'] };
        const images = [...root.querySelectorAll('img')];
        images.forEach(image => { image.loading = 'eager'; image.fetchPriority = 'high'; });
        await Promise.all(images.map(image => image.decode().catch(() => null)));
        const records = images.map(image => ({
          src: image.currentSrc || image.src,
          loaded: image.complete && image.naturalWidth > 0,
          width: image.naturalWidth,
          alt: image.alt || ''
        }));
        const backgroundUrls = [...new Set([root, ...root.querySelectorAll('*')].flatMap(el => {
          const value = getComputedStyle(el).backgroundImage || '';
          return [...value.matchAll(/url\(["']?(.*?)["']?\)/g)].map(match => match[1]).filter(url => url && !url.startsWith('data:') && !url.startsWith('blob:'));
        }))];
        const backgrounds = await Promise.all(backgroundUrls.map(url => new Promise(resolve => {
          const image = new Image();
          image.onload = () => resolve({src:url,loaded:true,width:image.naturalWidth});
          image.onerror = () => resolve({src:url,loaded:false,width:0});
          image.src = url;
        })));
        return {
          chapter: chapterId,
          images: records,
          missing: records.filter(image => !image.loaded).map(image => image.src),
          backgrounds,
          missingBackgrounds: backgrounds.filter(image => !image.loaded).map(image => image.src)
        };
      }, chapter);
      chapterImageAudits.push(audit);
      assert.deepEqual(audit.missing, [], 'All img elements in chapter ' + chapter + ' must decode');
      assert.deepEqual(audit.missingBackgrounds, [], 'All CSS background images in chapter ' + chapter + ' must decode');
      const presentation = await page.evaluate((chapterId) => {
        const root = document.querySelector('#chapter-' + chapterId);
        const headings = [...root.querySelectorAll('.rb-heading-armed')];
        const hiddenHeadings = headings.filter(el => { const s=getComputedStyle(el); return Number(s.opacity)<.98 || s.filter!=='none' || s.transform!=='none'; });
        const images = [...root.querySelectorAll('.rb-image-armed')];
        const hiddenImages = images.filter(el => { const s=getComputedStyle(el); return s.visibility==='hidden' || s.display==='none' || s.clipPath!=='none' || Number(s.opacity)<.1; });
        return {hiddenHeadings:hiddenHeadings.length,hiddenImages:hiddenImages.length};
      }, chapter);
      assert.equal(presentation.hiddenHeadings, 0, 'No editorial heading may remain blurred or faded in ' + chapter);
      assert.equal(presentation.hiddenImages, 0, 'No editorial image may remain clipped or hidden in ' + chapter);
      if (viewport.name === 'mobile' && chapter === 'about') {
        await page.screenshot({ path: outputDir + '/mobile-about-top-diagnostic.png', fullPage: false });
        await page.locator('#demarche').scrollIntoViewIfNeeded();
        await page.waitForTimeout(500);
        await page.screenshot({ path: outputDir + '/mobile-method-heading-diagnostic.png', fullPage: false });
        const methodLayout = await page.locator('#demarche .method-top h2').evaluate(el => {
          const r=el.getBoundingClientRect(),s=getComputedStyle(el);
          return {text:el.innerText,width:r.width,height:r.height,fontSize:s.fontSize,lineHeight:s.lineHeight,letterSpacing:s.letterSpacing,display:s.display,writingMode:s.writingMode,wordBreak:s.wordBreak,html:el.innerHTML};
        });
        console.log('MOBILE_METHOD_HEADING_DIAGNOSTIC '+JSON.stringify(methodLayout));
        const aboutLayout = await page.locator('#chapter-about .editorial-about').evaluate(root => {
          const copy=root.querySelector('.about-copy'), art=root.querySelector('.editorial-art'), atmosphere=root.querySelector('.chapter-atmosphere');
          const rect=el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
          return {viewportWidth:document.documentElement.clientWidth,copy:rect(copy),art:rect(art),paragraphs:[...copy.querySelectorAll('p')].map(rect),atmosphereDisplay:atmosphere?getComputedStyle(atmosphere).display:'absent'};
        });
        console.log('MOBILE_ABOUT_LAYOUT_DIAGNOSTIC '+JSON.stringify({...aboutLayout,chain:await page.locator('#chapter-about .editorial-about').evaluate(root=>{const out=[];let n=root;for(let i=0;n&&i<5;i++,n=n.parentElement){const r=n.getBoundingClientRect(),s=getComputedStyle(n);out.push({tag:n.tagName,id:n.id,cls:n.className,width:r.width,left:r.left,right:r.right,display:s.display,grid:s.gridTemplateColumns,padding:s.padding});}return out;})}));
        assert.ok(aboutLayout.copy.width > aboutLayout.viewportWidth*.62, 'Mobile BA Labs final chapter copy must use the available reading width');
        assert.ok(aboutLayout.paragraphs.length>0 && aboutLayout.paragraphs.every(p=>p.width>aboutLayout.viewportWidth*.65), 'Mobile BA Labs copy must not collapse into a narrow column');
        assert.ok(aboutLayout.art.top >= aboutLayout.copy.bottom-2, 'BA Labs documentary image must follow the text on mobile');
        assert.ok(['none','absent'].includes(aboutLayout.atmosphereDisplay),'Remove duplicate decorative chapter artwork from the mobile BA Labs reading flow');
      }
      await page.screenshot({ path: outputDir + '/' + viewport.name + '-chapter-' + chapter + '.png', fullPage: false });
    }
    // Absolute same-page links in the primary navigation must synchronize with the reading section.
    for (const sectionId of ['a-la-une', 'chantiers']) {
      await page.locator('.site-nav a[href*="#' + sectionId + '"]').first().click();
      await page.waitForFunction((id) => {
        const active = [...document.querySelectorAll('.site-nav a.chapter-active')];
        return active.length === 1 && active[0].getAttribute('aria-current') === 'location' && new URL(active[0].href).hash === '#' + id;
      }, sectionId, { timeout: 10000 });
      assert.equal(await page.locator('.site-nav a[aria-current="location"]').count(), 1, 'Exactly one primary navigation link must be active while reading ' + sectionId);
    }

    // Scroll the track independently of the rail and verify that the active point follows it.
    await page.evaluate(() => {
      const track = document.querySelector('#experienceTrack');
      track.scrollTo({ left: track.clientWidth * 3, behavior: 'instant' });
    });
    await page.waitForFunction(() => {
      const track = document.querySelector('#experienceTrack');
      return Math.abs(track.scrollLeft - track.clientWidth * 3) < 3 &&
        document.querySelectorAll('.chapter-rail-node')[3]?.getAttribute('aria-current') === 'step' &&
        document.querySelector('#chapter-catalogue')?.getAttribute('aria-current') === 'page';
    }, undefined, { timeout: 10000 });
    const allChapterImageAudits = chapterImageAudits.flatMap(audit => audit.images);
    assert.ok(allChapterImageAudits.length > 0, 'Editorial chapters must contain real image elements');
    const catalogueVisuals = await page.locator('.product-catalogue-visual-img').evaluateAll(imgs => ({count:imgs.length,unique:new Set(imgs.map(img=>img.currentSrc||img.src)).size,loaded:imgs.every(img=>img.complete&&img.naturalWidth>0)}));
    assert.deepEqual(catalogueVisuals,{count:3,unique:3,loaded:true},'Catalogue must show three distinct, decoded documentary photos rather than repeated card backgrounds');
    if (viewport.name === 'mobile') {
      const catalogueLayout = await page.locator('#chapter-catalogue').evaluate(root => {
        const intro = root.querySelector('.product-catalogue-intro');
        const paragraphs = [...root.querySelectorAll('.product-catalogue-intro p')].filter(el => getComputedStyle(el).display !== 'none');
        const visuals = root.querySelector('.product-catalogue-visuals');
        const rect = el => { const r=el.getBoundingClientRect(); return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}; };
        const ir = rect(intro), vr = rect(visuals);
        return {
          intro:ir,visuals:vr,
          paragraphs:paragraphs.map(el => ({...rect(el),writingMode:getComputedStyle(el).writingMode,wordBreak:getComputedStyle(el).wordBreak,overflowWrap:getComputedStyle(el).overflowWrap})),
          viewportWidth:document.documentElement.clientWidth
        };
      });
      assert.ok(catalogueLayout.intro.width > catalogueLayout.viewportWidth * .72, 'Mobile catalogue introduction must use a full-width reading column: ' + JSON.stringify(catalogueLayout));
      assert.ok(catalogueLayout.visuals.top >= catalogueLayout.intro.bottom - 2, 'Catalogue photography must sit below the introduction, never beside it');
      assert.ok(catalogueLayout.paragraphs.length > 0 && catalogueLayout.paragraphs.every(p => p.width > catalogueLayout.viewportWidth * .65 && p.writingMode === 'horizontal-tb'), 'Mobile catalogue copy must remain horizontal and readable, not stretched into a narrow vertical strip');
    }
    const originalUrl = page.url();
    await page.locator('.chapter-rail-node').nth(2).click();
    await page.waitForFunction(() => document.querySelector('#chapter-network')?.getAttribute('aria-current') === 'page', undefined, { timeout: 10000 });
    await page.locator('#chapter-network a[data-domain-page="myco"]').click();
    await page.waitForFunction(() => document.querySelector('#selection .selection-title')?.textContent?.trim() === 'MYCOLOGIE', undefined, { timeout: 15000 });
    assert.equal(page.url(), originalUrl, 'Selecting a universe must stay inside the normal BA Labs homepage');
    assert.ok((await page.locator('#selection').innerText()).length > 0, 'Direct domain selection must focus the requested universe in the embedded scene');
    assert.equal(await page.locator('#selection .selection-title').textContent(), 'MYCOLOGIE', 'The selected universe must be visibly named in the compact dock');
    assert.equal(await page.locator('#selection .selection-open-link').getAttribute('href'), 'https://app.notion.com/p/3e273152f1718161b154d8b8fc50f063', 'The selected universe must expose its canonical public Notion page');
    assert.ok(await page.locator('#selection').evaluate((element) => element.getBoundingClientRect().width > 100 && element.getBoundingClientRect().height > 20), 'The selected-node dock must be visible and not clipped');
    assert.equal(await page.locator('.universe-rail [data-universe="myco"]').getAttribute('aria-current'), 'location', 'The side rail must reflect the focused universe');
    await page.locator('.universe-rail [data-universe="bio"]').click();
    await page.waitForFunction(() => document.querySelector('#selection .selection-title')?.textContent?.trim() === 'BIOTECHNOLOGIE', undefined, { timeout: 10000 });
    assert.equal(await page.locator('.universe-rail [data-universe="bio"]').getAttribute('aria-current'), 'location', 'Clicking a side point must focus and activate its matching universe');
    assert.equal(await page.locator('.universe-rail [data-universe="myco"]').getAttribute('aria-current'), null, 'Only the currently focused universe may be active in the side rail');
    // Every one of the eight public points must stay synchronized with the focused root.
    for (const domain of ['myco','bio','iot','soil','lab','products','work','learn']) {
      await page.locator('.universe-rail [data-universe="' + domain + '"]').click();
      await page.waitForFunction((expected) => {
        const canvas = document.querySelector('#field');
        const point = document.querySelector('.universe-rail [data-universe="' + expected + '"]');
        return canvas?.dataset.activeUniverse === expected && point?.getAttribute('aria-current') === 'location';
      }, domain, { timeout: 10000 });
      assert.equal(await page.locator('.universe-rail [aria-current="location"]').count(), 1, 'Exactly one universe point must be active at a time');
    }
    assert.ok(await page.locator('.universe-rail-filament').count() === 1, 'The eight universe points must be connected by the organic filament');

    assert.deepEqual(errors, [], 'No uncaught browser errors');
    assert.deepEqual(failed, [], 'No failed network requests');
    await page.waitForTimeout(650);
    await page.screenshot({ path: outputDir + '/' + viewport.name + '-vernpixi-primary.png', fullPage: false });
    results.push({ viewport: viewport.name, renderer: 'PixiJS 2D embedded in homepage', universes: 8, directDomainEntry: true, staysOnHomepage: true, imagesChecked: imageAudit.length + chapterImageAudits.reduce((sum, audit) => sum + audit.images.length, 0), chaptersChecked: chapterImageAudits.length, browserErrors: errors.length });
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
