import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const html = readFileSync('store/index.html', 'utf8');
const css = readFileSync('store/store.css', 'utf8');
const js = readFileSync('store/store.js', 'utf8');
const workflow = readFileSync('.github/workflows/deploy-pages.yml', 'utf8');
const ecosystem = readFileSync('ecosystem/index.html', 'utf8');

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
assert.ok(js.includes('STORE_CATALOGUE_URL') && js.includes("method:'GET'") && js.includes("credentials:'omit'"), 'Storefront may read the public catalogue only through a credential-free GET request');
assert.ok(js.includes('STORE_REMOTE_CATALOGUE_ENABLED=false') && js.includes('if(!STORE_REMOTE_CATALOGUE_ENABLED)return;'), 'Remote catalogue access must remain disabled until cross-border processing and privacy disclosures are approved');
assert.ok(js.includes('STORE_PUBLISHABLE_KEY') && js.includes('apikey:STORE_PUBLISHABLE_KEY'), 'Public catalogue requests must use only the publishable key');
assert.ok(!js.includes("method:'POST'") && !js.includes('customer_phone') && !js.includes('customer_email'), 'Guest personal data must not be submitted before the order endpoint is deployed');
assert.ok(html.includes('./cookies.html') && html.includes('./privacy.html') && html.includes('./terms.html') && html.includes('./shipping.html') && html.includes('./legal.html'), 'Footer must expose legal and privacy pages');
assert.ok(css.includes('.legal-content') && css.includes('.store-hero') && css.includes('.product-card'), 'Storefront and legal page styling must be present');
assert.ok(workflow.includes('cp -R store/. _site/store/'), 'GitHub Pages workflow must publish the independent store directory');
assert.ok(ecosystem.includes('href="../store/index.html"') && ecosystem.includes('navStore:"Boutique"') && ecosystem.includes('navStore:"Store"') && ecosystem.includes('navStore:"المتجر"') && ecosystem.includes('navStore:"Loja"'), 'The ecosystem navigation must link to the storefront in all four languages');
console.log('Storefront regression checks passed: 12 references, 4 languages, ecosystem entry point, cart, reduced motion, legal pages, no remote fonts or premature data submission.');
