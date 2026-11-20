import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const html = readFileSync('store/index.html', 'utf8');
const css = readFileSync('store/store.css', 'utf8');
const js = readFileSync('store/store.js', 'utf8');
const workflow = readFileSync('.github/workflows/deploy-pages.yml', 'utf8');
const ecosystem = readFileSync('ecosystem/index.html', 'utf8');
const privacy = readFileSync('store/privacy.html', 'utf8');
const cookies = readFileSync('store/cookies.html', 'utf8');
const legalPages = ['legal.html', 'privacy.html', 'terms.html', 'shipping.html', 'cookies.html'].map(page => readFileSync('store/' + page, 'utf8'));
const retiredStoreNotion = readFileSync('supabase/functions/store-notion-order/index.ts', 'utf8');
const retiredNotionStore = readFileSync('supabase/functions/notion-store-order/index.ts', 'utf8');

for (const page of ['index.html', 'legal.html', 'privacy.html', 'terms.html', 'shipping.html', 'cookies.html']) {
  assert.ok(existsSync('store/' + page), 'Missing storefront page: ' + page);
}
for (const id of ['productGrid', 'cartDrawer', 'cartItems', 'requestModal', 'consentNotice', 'languageSelect']) {
  assert.ok(html.includes('id="' + id + '"'), 'Missing storefront mount: ' + id);
}
assert.ok(html.includes('<link rel="canonical" href="https://balabs-biotech.github.io/BA-lab/store/">'), 'Storefront must declare its canonical public URL');
assert.ok(html.includes('property="og:title"') && html.includes('property="og:description"') && html.includes('property="og:url"') && html.includes('property="og:type"'), 'Storefront must provide Open Graph metadata for link previews');
assert.ok(html.includes('name="twitter:card" content="summary"'), 'Storefront must provide a lightweight social preview without an unapproved image');
for (const language of ['fr', 'en', 'ar', 'pt']) {
  assert.ok(js.includes(language + ':{'), 'Missing language dictionary: ' + language);
}
assert.equal((js.match(/(?:code:'BAL-|"code":"BAL-)/g) || []).length, 32, 'Storefront must retain all 29 active public catalogue references plus Petri, wheat grain spawn and liquid culture syringe');
assert.ok(js.includes('statusOnRequest') && js.includes('statusToConfirm') && js.includes('statusUnavailable') && js.includes("p.status!=='unavailable'"), 'The catalogue must localize availability and block selection of unavailable references');
assert.ok(js.includes('BAL-LC-TRI-HAMATUM-001') && js.includes('BAL-AG-PDAE-001'), 'Unavailable Notion catalogue references must remain visible in the static multilingual catalogue');
assert.ok(js.includes('priceDzd:2000') && js.includes('product-price'), 'The inoculated Petri dish must show its confirmed 2,000 DZD unit price');
assert.ok(!/priceDzd:100[,}]/.test(js) && js.includes('Water Agar — boîte non inoculée'), 'Water Agar must remain on request without an unconfirmed public price');
const wheatSpawn = js.match(/\{code:'BAL-GRAIN-SPAWN-WHEAT-25-001',[\s\S]*?\},\n\{code:/)?.[0] || '';
assert.ok(wheatSpawn.includes("status:'to_confirm'") && wheatSpawn.includes('grain spawn · 2,5 kg') && !wheatSpawn.includes('priceDzd:'), 'Wheat grain spawn must remain visible as to-confirm with no unconfirmed public price');
assert.ok(js.includes('priceDzd:5000') && js.includes('Prix envisagé · à confirmer') && js.includes('price-qualifier'), 'Liquid culture syringe price must be clearly marked indicative');
assert.ok(js.includes("family:'spawn'") && js.includes("filterSpawn:'Grain spawn'"), 'Grain spawn must have a distinct localized catalogue filter');
assert.ok(html.includes('id="copyRequest"') && js.includes('navigator.clipboard.writeText(requestText)'), 'The guest selection must be copyable as a request without submitting personal data');
assert.ok(js.includes('balabs-store-cart') && js.includes('safeGet') && js.includes('safeSet'), 'Cart and preferences must use guarded local storage');
assert.ok(js.includes('Number.isInteger(Number(quantity))') && js.includes('Number(quantity)<=100') && js.includes('Math.min(100,(cart[id]||0)+1)'), 'Persisted cart quantities must be sanitized and capped at the server-side maximum');
assert.ok(js.includes("const privacySettings=$('#privacySettings');if(privacySettings)privacySettings.addEventListener"), 'Optional privacy settings control must not stop storefront initialization when absent');
assert.ok(js.includes('prefers-reduced-motion') && js.includes('IntersectionObserver'), 'Motion must respect reduced-motion preference and progressive reveal');
assert.ok(html.includes('id="cartDrawer" role="dialog" aria-modal="false"') && html.includes('id="requestModal" aria-hidden="true" role="dialog" aria-modal="true"'), 'Cart and request surfaces must expose dialog semantics');
assert.ok(js.includes('function trapDialogFocus(event,dialog)') && js.includes("trapDialogFocus(e,$('#requestModal'))") && js.includes("trapDialogFocus(e,$('#cartDrawer'))"), 'Keyboard focus must remain inside open dialogs');
assert.ok(js.includes('requestOpener.focus()') && js.includes('cartOpener.focus()'), 'Closing a dialog must restore focus to its opener');
assert.ok(!html.includes('fonts.googleapis.com') && !html.includes('fonts.gstatic.com'), 'Storefront must not request remote Google Fonts');
assert.ok(html.includes("Content-Security-Policy") && html.includes("script-src 'self' https://challenges.cloudflare.com") && html.includes("frame-src https://challenges.cloudflare.com") && html.includes("object-src 'none'") && html.includes("connect-src 'self' https://axcouwiodqsauwnsiotn.supabase.co https://challenges.cloudflare.com"), 'Storefront must enforce a restrictive CSP while allowing only its own assets, Supabase API and Turnstile challenge');
assert.ok(html.includes("default-src 'self'") && html.includes("base-uri 'self'") && html.includes("form-action 'self'") && html.includes("style-src 'self'") && html.includes("img-src 'self' data:") && html.includes("font-src 'self' data:") && html.includes("upgrade-insecure-requests"), 'Storefront CSP must restrict resource origins, form targets and insecure transport');
assert.ok(html.includes('<meta name="referrer" content="strict-origin-when-cross-origin">'), 'Storefront must limit cross-origin referrer disclosure');
assert.equal((html.match(/<script\b[^>]*>/gi)||[]).filter(tag=>! /\bsrc=/.test(tag)).length, 0, 'Storefront must not introduce inline script blocks that weaken CSP');

assert.ok(html.includes('id="turnstileWidget"') && js.includes("const TURNSTILE_SITE_KEY=''"), 'Turnstile mount must exist while its unprovisioned public key stays blank');
const requestOpener = js.match(/function openRequest\(\)\{[\s\S]*?(?=\nfunction closeRequest)/)?.[0] || '';
assert.ok(requestOpener.includes('loadTurnstile()') && requestOpener.indexOf("classList.add('is-open')") < requestOpener.indexOf('loadTurnstile()'), 'Turnstile must initialize only after the request dialog becomes visible');
const orderGateStart = js.indexOf('if(STORE_ORDER_ENABLED){orderForm.querySelectorAll');
const orderGate = js.slice(orderGateStart, js.indexOf('\norderForm.addEventListener', orderGateStart));
assert.ok(!orderGate.includes('loadTurnstile()'), 'Turnstile must not render inside the initially hidden request dialog');
assert.ok(js.includes('let turnstileToken=\'\',turnstileWidgetId=null,turnstileScriptLoading=false') && js.includes('if(turnstileScriptLoading)return;') && js.includes('turnstileScriptLoading=true;') && js.includes('turnstileScriptLoading=false;render();'), 'Turnstile script loading must be idempotent across repeated dialog openings');
const turnstileRender = js.match(/const render=\(\)=>\{[\s\S]*?\n \};/)?.[0] || '';
assert.ok(turnstileRender.includes("!$('#requestModal').classList.contains('is-open')") && turnstileRender.indexOf("classList.contains('is-open')") < turnstileRender.indexOf('turnstile.render'), 'A late Turnstile script load must not render into a dialog that has already closed');
assert.ok(js.includes("STORE_CATALOGUE_URL") && /method\s*:\s*["\']GET["\']/.test(js) && /credentials\s*:\s*["\']omit["\']/.test(js), "Storefront may read the public catalogue only through a cookie-free GET request");
assert.ok(js.includes('STORE_REMOTE_CATALOGUE_ENABLED=false') && js.includes('if(!STORE_REMOTE_CATALOGUE_ENABLED)return;'), 'Remote catalogue access must remain disabled until cross-border processing and privacy disclosures are approved');
assert.ok(js.includes('STORE_PUBLISHABLE_KEY') && js.includes('apikey:STORE_PUBLISHABLE_KEY'), 'Public catalogue requests must use only the publishable key');
assert.ok(html.includes('./cookies.html') && html.includes('./privacy.html') && html.includes('./terms.html') && html.includes('./shipping.html') && html.includes('./legal.html'), 'Footer must expose legal and privacy pages');
assert.ok(privacy.includes('appel depuis le navigateur reste désactivé') && privacy.includes('transfert international'), 'Privacy policy must disclose the disabled remote catalogue and cross-border review gate');
assert.ok(cookies.includes('appel depuis le navigateur reste désactivé'), 'Cookie policy must disclose that no remote catalogue request is active');
assert.ok(legalPages.every(page => /<meta name="robots" content="noindex, nofollow">/.test(page)), 'Unfinished legal and privacy drafts must stay out of search indexes until formally approved');
assert.ok(css.includes('.legal-content') && css.includes('.store-hero') && css.includes('.product-card'), 'Storefront and legal page styling must be present');
assert.ok(css.includes(':focus-visible') && css.includes('outline:2px solid #e0a080'), 'All storefront keyboard controls must expose a high-contrast visible focus indicator');
assert.ok(workflow.includes('cp -R store/. _site/store/'), 'GitHub Pages workflow must publish the independent store directory');
assert.ok(ecosystem.includes('href="../store/index.html"') && ecosystem.includes('navStore:"Boutique"') && ecosystem.includes('navStore:"Store"') && ecosystem.includes('navStore:"المتجر"') && ecosystem.includes('navStore:"Loja"'), 'The ecosystem navigation must link to the storefront in all four languages');
console.log('Storefront regression checks passed: 32 references, four languages, availability gating, cart, custom enquiry workspace, Supabase-first intake gate, legal pages and reduced-motion support.');
assert.equal((html.match(/id="copyRequest"/g)||[]).length,1,'Request copy action must have one unique DOM id');
assert.ok(js.includes('STORE_ORDER_URL') && js.includes('STORE_ORDER_ENABLED=false'), 'Order endpoint must remain gated until deployment');
assert.ok(html.includes('id="orderForm"') && html.includes('name="phone"') && html.includes('name="name"'), 'Guest order form must collect customer identity');
assert.ok(html.includes('class="request-layout"') && html.includes('class="request-selection"') && html.includes('class="request-details"'), 'Enquiry form must use the custom two-column request workspace');
assert.ok(js.includes('create-store-order') && !js.includes('/functions/v1/store-notion-order'), 'The storefront must route requests through Supabase-first intake');
assert.ok(js.includes('function escapeHtml(value)') && js.includes('escapeHtml(p.titles[language])') && js.includes('escapeHtml(p.descriptions[language])'), 'Catalogue text must be HTML-escaped before rendering to prevent stored/reflected XSS');
assert.ok(!js.includes('SUPABASE_SERVICE_ROLE_KEY') && !js.includes('NOTION_API_KEY') && !js.includes('sb_secret_'), 'No server-side credentials may be shipped in the public storefront');
assert.ok(!/https:\/\/app\.notion\.com\/p\//i.test(js), 'Public storefront source must not expose internal Notion page URLs or identifiers');
assert.ok(js.includes("credentials:'omit'"), 'Browser requests must never forward browser cookies to Supabase');
const persistedKeys = [...js.matchAll(/safeSet\('([^']+)'/g)].map(match => match[1]).sort();
assert.deepEqual(persistedKeys, ['balabs-privacy-notice-v1', 'balabs-store-cart', 'balabs-store-language'], 'Browser storage must be limited to cart, language and privacy-notice preference; no customer form fields');

assert.ok(js.includes('orderForm.addEventListener') && js.includes('apikey:STORE_PUBLISHABLE_KEY'), 'Browser submits through the public Supabase key only');

assert.ok(retiredStoreNotion.includes('status: 410') && retiredNotionStore.includes('status: 410'), 'Legacy public direct-to-Notion endpoints must remain retired');
assert.ok(!retiredStoreNotion.includes('NOTION_API_KEY') && !retiredNotionStore.includes('NOTION_API_KEY'), 'Retired endpoints must not retain access to customer-data integrations');
