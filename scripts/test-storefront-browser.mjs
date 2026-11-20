import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.BALABS_STORE_URL || "http://127.0.0.1:8767/store/index.html";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const pageErrors = [];
page.on("pageerror", error => pageErrors.push(error.message));

try {
  await page.addInitScript(() => localStorage.setItem("balabs-privacy-notice-v1", "acknowledged"));
  await page.goto(base, { waitUntil: "networkidle" });
  await page.locator("#biologicalIntro").waitFor({ state: "visible" });
  assert.equal(await page.locator("#biologicalIntro").getAttribute("aria-hidden"), "false", "Biological opening sequence must be exposed as the active introduction");
  await page.locator("#introSkip").click();
  await page.waitForFunction(() => document.querySelector("#biologicalIntro")?.hidden === true, null, { timeout: 1500 });
  const firstProductCard = page.locator("#productGrid .product-card").first();
  await firstProductCard.locator("[data-details]").click();
  await page.locator("#productDetailModal.is-open").waitFor();
  assert.equal(await page.locator("#productDetailModal").getAttribute("aria-hidden"), "false", "Product details must be exposed as an accessible dialog");
  assert.ok((await page.locator("#productDetailTitle").textContent()).trim(), "Product detail dialog must show the product title");
  assert.ok((await page.locator("#productDetailCode").textContent()).trim(), "Product detail dialog must show its catalogue reference");
  await page.locator("#productDetailAdd").click();
  assert.equal(await page.locator("#cartCount").textContent(), "1", "Adding from product details must update the cart");
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#productDetailModal").getAttribute("aria-hidden"), "true", "Escape must close product details");
  assert.equal(await page.evaluate(() => document.activeElement?.hasAttribute("data-details")), true, "Closing product details must restore focus to its opener");
  await page.locator("#productGrid .product-card").filter({ hasText: "LC GRAIN" }).locator("[data-details]").click();
  await page.locator("#productDetailModal.is-open").waitFor();
  assert.equal(await page.locator("#productDetailAdd").isDisabled(), true, "Unavailable products must not be addable from their details");
  await page.locator("#productDetailClose").click();
  assert.equal(await page.locator("#productDetailModal").getAttribute("aria-hidden"), "true", "Close control must dismiss product details");
  await page.locator("#productGrid .add-product").first().click();
  await page.waitForFunction(() => document.querySelector("#cartCount")?.textContent?.trim() === "2");
  await page.locator("#cartOpen").click();
  await page.locator("#cartItems .cart-line").first().waitFor();
  assert.equal(await page.locator("#cartDrawer").getAttribute("aria-hidden"), "false", "Opening the cart must expose its dialog to assistive technology");
  assert.equal(await page.locator("#cartDrawer").getAttribute("aria-modal"), "true", "Open cart must be modal");
  assert.equal(await page.evaluate(() => document.activeElement?.id), "cartClose", "Opening the cart must move keyboard focus into the drawer");
  await page.keyboard.press("Shift+Tab");
  assert.equal(await page.evaluate(() => document.activeElement?.id), "requestQuote", "Shift+Tab from the first cart control must wrap to the last");
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement?.id), "cartClose", "Tab from the last cart control must wrap to the first");
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#cartDrawer").getAttribute("aria-hidden"), "true", "Escape must close the cart dialog");
  assert.equal(await page.evaluate(() => document.activeElement?.id), "cartOpen", "Closing the cart must restore focus to its opener");
  await page.locator("#cartOpen").click();
  await page.locator("#cartItems .cart-line").first().waitFor();
  await page.locator("#requestQuote").click();
  await page.locator("#requestModal.is-open").waitFor();
  assert.equal(await page.locator("#requestModal").getAttribute("aria-hidden"), "false", "Opening the request dialog must expose it to assistive technology");
  await page.waitForFunction(() => document.activeElement?.id === "requestClose");
  assert.equal(await page.evaluate(() => document.activeElement?.id), "requestClose", "Opening the request dialog must move focus to its close control");
  await page.keyboard.press("Shift+Tab");
  assert.equal(await page.evaluate(() => document.activeElement?.id), "copyRequest", "Shift+Tab from the first request control must wrap to the last");
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement?.id), "requestClose", "Tab from the last request control must wrap to the first");
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#requestModal").getAttribute("aria-hidden"), "true", "Escape must close the request dialog");
  assert.equal(await page.evaluate(() => document.activeElement?.id), "cartOpen", "Closing the request dialog must restore focus to a visible opener");
  await page.locator("#cartOpen").click();
  await page.locator("#cartItems .cart-line").first().waitFor();
  await page.locator("#requestQuote").click();
  await page.locator("#requestModal.is-open").waitFor();
  await page.waitForFunction(() => {
    const panel = document.querySelector("#requestModal .request-panel");
    return panel && Number.parseFloat(getComputedStyle(panel).opacity) >= 0.99;
  });
  await page.waitForFunction(() => Boolean(document.querySelector("#requestSummary")?.textContent?.trim()));
  const summaryState = await page.locator("#requestSummary").evaluate(el => ({ text: el.textContent.trim(), display: getComputedStyle(el).display, visibility: getComputedStyle(el).visibility, rect: el.getBoundingClientRect().toJSON() }));
  assert.ok(summaryState.text, "Selected product must appear in the request summary");
  assert.notEqual(summaryState.display, "none", "Request summary must not be display-hidden");
  assert.notEqual(summaryState.visibility, "hidden", "Request summary must be visible");
  assert.ok(summaryState.rect.width > 0 && summaryState.rect.height > 0, "Request summary must occupy visible space");

  const desktopColumns = await page.locator(".request-layout").evaluate(el =>
    getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/).length
  );
  assert.equal(desktopColumns, 2, "Desktop request workspace must use two columns");

  assert.equal(await page.locator("#submitOrder").isDisabled(), true, "Public submission must remain disabled");
  await page.locator("#languageSelect").selectOption("en");
  const selectionHeading = page.locator('[data-i18n="selectionHeading"]');
  assert.equal(await selectionHeading.isVisible(), true, "Selection heading must remain visible after language change");
  assert.match(await selectionHeading.textContent(), /YOUR SELECTION/);

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileColumns = await page.locator(".request-layout").evaluate(el =>
    getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/).length
  );
  assert.equal(mobileColumns, 1, "Mobile request workspace must stack into one column");

  await page.locator("#languageSelect").selectOption("ar");
  assert.equal(await page.locator("html").getAttribute("dir"), "rtl", "Arabic locale must enable RTL direction");
  const validCode = await page.locator("#productGrid .add-product").first().getAttribute("data-add");
  const secondCode = await page.locator("#productGrid .add-product").nth(1).getAttribute("data-add");
  await page.evaluate(({ validCode, secondCode }) => {
    localStorage.setItem("balabs-store-cart", JSON.stringify({ [validCode]: "2", [secondCode]: 101, "UNLISTED-CODE": 7 }));
  }, { validCode, secondCode });
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await page.locator("#cartCount").textContent(), "2", "Reload must retain only valid cart entries with quantities from 1 to 100");
  assert.equal(await page.locator("#cartItems .quantity-control span").count(), 1, "Only the sanitized cart entry must render");
  await page.locator("#cartOpen").click();
  assert.equal(await page.locator("#cartItems .quantity-control span").first().textContent(), "2", "Persisted numeric-string quantities must be normalized to integers");
  assert.deepEqual(pageErrors, [], "Storefront must not raise uncaught browser errors");
  const reducedMotionPage = await browser.newPage({ reducedMotion: "reduce" });
  await reducedMotionPage.addInitScript(() => localStorage.setItem("balabs-privacy-notice-v1", "acknowledged"));
  await reducedMotionPage.goto(base, { waitUntil: "networkidle" });
  assert.equal(await reducedMotionPage.locator("#biologicalIntro").isVisible(), false, "Opening animation must be absent when reduced motion is preferred");
  await reducedMotionPage.close();
  const unconfiguredPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await unconfiguredPage.addInitScript(() => localStorage.setItem("balabs-privacy-notice-v1", "acknowledged"));
  await unconfiguredPage.route("**/store.js**", async route => {
    const response = await route.fetch();
    const source = (await response.text()).replace("const STORE_ORDER_ENABLED=false;", "const STORE_ORDER_ENABLED=true;");
    await route.fulfill({ response, body: source });
  });
  await unconfiguredPage.goto(base, { waitUntil: "networkidle" });
  assert.equal(await unconfiguredPage.locator("#submitOrder").isDisabled(), true, "Order submission must remain disabled when the Turnstile site key is missing");
  await unconfiguredPage.locator("#productGrid .add-product").first().click();
  await unconfiguredPage.locator("#cartOpen").click();
  await unconfiguredPage.locator("#requestQuote").click();
  await unconfiguredPage.locator("#requestModal.is-open").waitFor();
  assert.match(await unconfiguredPage.locator(".request-description").textContent(), /pas encore activé/i, "Missing Turnstile configuration must not display active-intake privacy copy");
  assert.match(await unconfiguredPage.locator("[data-i18n=integrationNote]").textContent(), /aucune coordonnée/i, "Missing Turnstile configuration must preserve the no-transmission disclosure");
  assert.match(await unconfiguredPage.locator("#orderStatus").textContent(), /non activé/i, "Missing Turnstile configuration must display the inactive status");
  assert.equal(await unconfiguredPage.locator("#turnstileWidget").isVisible(), false, "Turnstile must not render without its public site key");
  await unconfiguredPage.close();
  const turnstilePage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await turnstilePage.addInitScript(() => {
    window.turnstile = {
      render(mount, options) {
        window.__turnstileState = {
          visibleAtRender: mount.closest("#requestModal")?.classList.contains("is-open") === true,
          options
        };
        return "mock-turnstile-widget";
      },
      reset() { window.__turnstileReset = true; }
    };
  });
  await turnstilePage.addInitScript(() => localStorage.setItem("balabs-privacy-notice-v1", "acknowledged"));
  await turnstilePage.route("**/store.js**", async route => {
    const response = await route.fetch();
    let source = await response.text();
    source = source.replace("const STORE_ORDER_ENABLED=false;", "const STORE_ORDER_ENABLED=true;");
    source = source.replace("const TURNSTILE_SITE_KEY='';", "const TURNSTILE_SITE_KEY='test-site-key';");
    await route.fulfill({ response, body: source });
  });
  await turnstilePage.goto(base, { waitUntil: "networkidle" });
  if (await turnstilePage.locator("#consentNotice").isVisible()) await turnstilePage.locator("#consentAcknowledge").click();
  assert.equal(await turnstilePage.locator("#submitOrder").isDisabled(), true, "Order submission must start disabled until Turnstile validates");
  await turnstilePage.locator("#productGrid .add-product").first().click();
  await turnstilePage.waitForFunction(() => document.querySelector("#cartCount")?.textContent?.trim() === "1");
  await turnstilePage.locator("#cartOpen").click();
  await turnstilePage.locator("#cartItems .cart-line").first().waitFor();
  await turnstilePage.locator("#drawerBottom").waitFor({ state: "visible" });
  await turnstilePage.locator("#requestQuote").click();
  await turnstilePage.locator("#requestModal.is-open").waitFor();
  assert.match(await turnstilePage.locator(".request-description").textContent(), /connexion sécurisée/i, "Enabled intake must explain that submitted contact details are transmitted securely");
  assert.match(await turnstilePage.locator("[data-i18n=integrationNote]").textContent(), /transmises de façon sécurisée/i, "Enabled intake must not claim contact details are never sent");
  assert.match(await turnstilePage.locator("#orderStatus").textContent(), /contrôle anti-robot/i, "Enabled intake must not display the inactive-submission status");
  await turnstilePage.waitForFunction(() => Boolean(window.__turnstileState));
  assert.equal(await turnstilePage.evaluate(() => window.__turnstileState.visibleAtRender), true, "Turnstile must render only after the request dialog is visible");
  await turnstilePage.evaluate(() => window.__turnstileState.options.callback("mock-valid-token"));
  assert.equal(await turnstilePage.locator("#submitOrder").isDisabled(), false, "A valid Turnstile token must enable submission");
  await turnstilePage.locator("#requestClose").click();
  assert.equal(await turnstilePage.evaluate(() => window.__turnstileReset === true), true, "Closing the request dialog must reset the Turnstile widget");
  await turnstilePage.locator("#cartOpen").click();
  await turnstilePage.locator("#requestQuote").click();
  await turnstilePage.locator("#requestModal.is-open").waitFor();
  assert.equal(await turnstilePage.locator("#submitOrder").isDisabled(), true, "Reopening the request dialog must require a fresh Turnstile token");
  await turnstilePage.evaluate(() => window.__turnstileState.options["expired-callback"]());
  assert.equal(await turnstilePage.locator("#submitOrder").isDisabled(), true, "An expired Turnstile token must disable submission");
  await turnstilePage.evaluate(() => window.__turnstileState.options.callback("mock-valid-token"));
  await turnstilePage.evaluate(() => window.__turnstileState.options["error-callback"]());
  assert.equal(await turnstilePage.locator("#submitOrder").isDisabled(), true, "A Turnstile error must disable submission");
  assert.equal(await turnstilePage.locator("#orderStatus").textContent(), "Le contrôle anti-robot est indisponible. Réessayez plus tard.", "Turnstile errors must show localized unavailable feedback");
  await turnstilePage.close();
  console.log("Storefront browser smoke passed: cart, request summary, desktop/mobile layout, language switching and disabled intake.");
} finally {
  await browser.close();
}
