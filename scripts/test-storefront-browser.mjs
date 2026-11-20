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
  await page.locator("#productGrid .add-product").first().click();
  await page.waitForFunction(() => document.querySelector("#cartCount")?.textContent?.trim() === "1");
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
  assert.deepEqual(pageErrors, [], "Storefront must not raise uncaught browser errors");
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
  await turnstilePage.route("**/store.js", async route => {
    const response = await route.fetch();
    let source = await response.text();
    source = source.replace("const STORE_ORDER_ENABLED=false;", "const STORE_ORDER_ENABLED=true;");
    source = source.replace("const TURNSTILE_SITE_KEY='';", "const TURNSTILE_SITE_KEY='test-site-key';");
    await route.fulfill({ response, body: source });
  });
  await turnstilePage.goto(base, { waitUntil: "networkidle" });
  assert.equal(await turnstilePage.locator("#submitOrder").isDisabled(), true, "Order submission must start disabled until Turnstile validates");
  await turnstilePage.locator("#productGrid .add-product").first().click();
  await turnstilePage.locator("#cartOpen").click();
  await turnstilePage.locator("#requestQuote").click();
  await turnstilePage.locator("#requestModal.is-open").waitFor();
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
