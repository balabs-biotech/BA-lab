import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const html = readFileSync('store/index.html', 'utf8');
const css = readFileSync('store/store.css', 'utf8');
const js = readFileSync('store/store.js', 'utf8');
const workflow = readFileSync('.github/workflows/deploy-pages.yml', 'utf8');
const ecosystem = readFileSync('ecosystem/index.html', 'utf8');
const privacy = readFileSync('store/privacy.html', 'utf8');
const cookies = readFileSync('store/cookies.html', 'utf8');

for (const page of ['index.html', 'legal.html', 'privacy.html', 'terms.html', 'shipping.html', 'cookies.html']) {
  assert.ok(existsSync('store/' + page), 'Missing storefront page: ' + page);
}
for (const id of ['productGrid', 'cartDrawer', 'cartItems', 'requestModal', 'consentNotice', 'languageSelect']) {
  assert.ok(html.includes('id="' + id + '"'), 'Missing storefront mount: ' + id);
}
for (const language of ['fr', 'en', 'ar', 'pt']) {
  assert.ok(js.includes(language + ':{'), 'Missing language dictionary: ' + language);
}
assert.equal((js.match(/code:'BAL-/g) || []).length, 15, 'Storefront must render 12 original references plus Petri, wheat grain spawn and liquid culture syringe products');
assert.ok(js.includes('priceDzd:2000') && js.includes('product-price'), 'The inoculated Petri dish must show its confirmed 2,000 DZD unit price');
assert.ok(js.includes('priceDzd:100') && js.includes('Water Agar — boîte non inoculée'), 'Uninoculated Water Agar must show its 100 DZD unit price');
assert.ok(js.includes('priceDzd:1000') && js.includes('grain spawn · 2,5 kg'), 'Wheat grain spawn must show its 2.5 kg / 1,000 DZD format');
assert.ok(js.includes('priceDzd:5000') && js.includes('Prix envisagé · à confirmer') && js.includes('price-qualifier'), 'Liquid culture syringe price must be clearly marked indicative');
assert.ok(js.includes("family:'spawn'") && js.includes("filterSpawn:'Grain spawn'"), 'Grain spawn must have a distinct localized catalogue filter');
assert.ok(html.includes('id="copyRequest"') && js.includes('navigator.clipboard.writeText(requestText)'), 'The guest selection must be copyable as a request without submitting personal data');
assert.ok(js.includes('balabs-store-cart') && js.includes('safeGet') && js.includes('safeSet'), 'Cart and preferences must use guarded local storage');
assert.ok(js.includes("const privacySettings=$('#privacySettings');if(privacySettings)privacySettings.addEventListener"), 'Optional privacy settings control must not stop storefront initialization when absent');
assert.ok(js.includes('prefers-reduced-motion') && js.includes('IntersectionObserver'), 'Motion must respect reduced-motion preference and progressive reveal');
assert.ok(!html.includes('fonts.googleapis.com') && !html.includes('fonts.gstatic.com'), 'Storefront must not request remote Google Fonts');
assert.ok(js.includes('STORE_CATALOGUE_URL') && js.includes("method:'GET'") && js.includes("credentials:'omit'"), 'Storefront may read the public catalogue only through a credential-free GET request');
assert.ok(js.includes('STORE_REMOTE_CATALOGUE_ENABLED=false') && js.includes('if(!STORE_REMOTE_CATALOGUE_ENABLED)return;'), 'Remote catalogue access must remain disabled until cross-border processing and privacy disclosures are approved');
assert.ok(js.includes('STORE_PUBLISHABLE_KEY') && js.includes('apikey:STORE_PUBLISHABLE_KEY'), 'Public catalogue requests must use only the publishable key');
assert.ok(html.includes('./cookies.html') && html.includes('./privacy.html') && html.includes('./terms.html') && html.includes('./shipping.html') && html.includes('./legal.html'), 'Footer must expose legal and privacy pages');
assert.ok(privacy.includes('point d\'accès Supabase du catalogue est désactivé') && privacy.includes('transfert international'), 'Privacy policy must disclose the disabled remote catalogue and cross-border review gate');
assert.ok(cookies.includes('point d\'accès Supabase du catalogue est actuellement désactivé'), 'Cookie policy must disclose that no remote catalogue request is active');
assert.ok(css.includes('.legal-content') && css.includes('.store-hero') && css.includes('.product-card'), 'Storefront and legal page styling must be present');
assert.ok(workflow.includes('cp -R store/. _site/store/'), 'GitHub Pages workflow must publish the independent store directory');
assert.ok(ecosystem.includes('href="../store/index.html"') && ecosystem.includes('navStore:"Boutique"') && ecosystem.includes('navStore:"Store"') && ecosystem.includes('navStore:"المتجر"') && ecosystem.includes('navStore:"Loja"'), 'The ecosystem navigation must link to the storefront in all four languages');
console.log('Storefront regression checks passed: 15 references, four languages, cart, custom enquiry workspace, Supabase-first intake gate, legal pages and reduced-motion support.');
assert.equal((html.match(/id="copyRequest"/g)||[]).length,1,'Request copy action must have one unique DOM id');
assert.ok(js.includes('STORE_ORDER_URL') && js.includes('STORE_ORDER_ENABLED=false'), 'Order endpoint must remain gated until deployment');
assert.ok(html.includes('id="orderForm"') && html.includes('name="phone"') && html.includes('name="name"'), 'Guest order form must collect customer identity');
assert.ok(html.includes('class="request-layout"') && html.includes('class="request-selection"') && html.includes('class="request-details"'), 'Enquiry form must use the custom two-column request workspace');
assert.ok(js.includes('create-store-order') && !js.includes('/functions/v1/store-notion-order'), 'The storefront must route requests through Supabase-first intake');
assert.ok(js.includes('function escapeHtml(value)') && js.includes('escapeHtml(p.titles[language])') && js.includes('escapeHtml(p.descriptions[language])'), 'Catalogue text must be HTML-escaped before rendering to prevent stored/reflected XSS');
assert.ok(!js.includes('SUPABASE_SERVICE_ROLE_KEY') && !js.includes('NOTION_API_KEY') && !js.includes('sb_secret_'), 'No server-side credentials may be shipped in the public storefront');
assert.ok(js.includes("credentials:'omit'"), 'Browser requests must never forward browser cookies to Supabase');
assert.ok(!js.includes('localStorage.setItem') && js.includes('safeSet'), 'Customer form values must not be persisted directly in browser storage');

assert.ok(js.includes('orderForm.addEventListener') && js.includes('apikey:STORE_PUBLISHABLE_KEY'), 'Browser submits through the public Supabase key only');
