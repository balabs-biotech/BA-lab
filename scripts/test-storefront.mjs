import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const html = readFileSync('store/index.html', 'utf8');
const css = readFileSync('store/store.css', 'utf8');
const js = readFileSync('store/store.js', 'utf8');
const workflow = readFileSync('.github/workflows/deploy-pages.yml', 'utf8');

for (const page of ['index.html', 'legal.html', 'privacy.html', 'terms.html', 'shipping.html', 'cookies.html']) {
  assert.ok(existsSync('store/' + page), 'Missing storefront page: ' + page);
}
for (const id of ['productGrid', 'cartDrawer', 'cartItems', 'requestModal', 'consentNotice', 'languageSelect']) {
  assert.ok(html.includes('id="' + id + '"'), 'Missing storefront mount: ' + id);
}
for (const language of ['fr', 'en', 'ar', 'pt']) {
  assert.ok(js.includes(language + ':{'), 'Missing language dictionary: ' + language);
}
assert.equal((js.match(/code:'BAL-/g) || []).length, 12, 'Storefront must render the 12 verified catalogue references');
assert.ok(js.includes('balabs-store-cart') && js.includes('safeGet') && js.includes('safeSet'), 'Cart and preferences must use guarded local storage');
assert.ok(js.includes('prefers-reduced-motion') && js.includes('IntersectionObserver'), 'Motion must respect reduced-motion preference and progressive reveal');
assert.ok(!html.includes('fonts.googleapis.com') && !html.includes('fonts.gstatic.com'), 'Storefront must not request remote Google Fonts');
assert.ok(!js.includes('fetch(') && !js.includes('createClient('), 'Preview storefront must not transmit or persist personal data before backend integration');
assert.ok(html.includes('./cookies.html') && html.includes('./privacy.html') && html.includes('./terms.html') && html.includes('./shipping.html') && html.includes('./legal.html'), 'Footer must expose legal and privacy pages');
assert.ok(css.includes('.legal-content') && css.includes('.store-hero') && css.includes('.product-card'), 'Storefront and legal page styling must be present');
assert.ok(workflow.includes('cp -R store/. _site/store/'), 'GitHub Pages workflow must publish the independent store directory');
console.log('Storefront regression checks passed: 12 references, 4 languages, cart, reduced motion, legal pages, no remote fonts or premature data submission.');
