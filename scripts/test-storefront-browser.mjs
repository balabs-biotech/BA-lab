import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.BALABS_STORE_URL || "http://127.0.0.1:8767/store/index.html";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const pageErrors = [];
page.on("pageerror", error => pageErrors.push(error.message));

try {
  await page.goto(base, { waitUntil: "networkidle" });
  await page.locator("#productGrid .add-product").first().click();
  await page.locator("#cartOpen").click();
  await page.locator("#requestQuote").click();
  await page.locator("#requestModal.is-open").waitFor();
  assert.ok(await page.locator("#requestSummary").innerText(), "Selected product must appear in the request summary");

  const desktopColumns = await page.locator(".request-layout").evaluate(el =>
    getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/).length
  );
  assert.equal(desktopColumns, 2, "Desktop request workspace must use two columns");

  assert.equal(await page.locator("#submitOrder").isDisabled(), true, "Public submission must remain disabled");
  await page.locator("#languageSelect").selectOption("en");
  assert.match(await page.locator('[data-i18n="selectionHeading"]').innerText(), /YOUR SELECTION/);

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileColumns = await page.locator(".request-layout").evaluate(el =>
    getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/).length
  );
  assert.equal(mobileColumns, 1, "Mobile request workspace must stack into one column");

  await page.locator("#languageSelect").selectOption("ar");
  assert.equal(await page.locator("html").getAttribute("dir"), "rtl", "Arabic locale must enable RTL direction");
  assert.deepEqual(pageErrors, [], "Storefront must not raise uncaught browser errors");
  console.log("Storefront browser smoke passed: cart, request summary, desktop/mobile layout, language switching and disabled intake.");
} finally {
  await browser.close();
}
