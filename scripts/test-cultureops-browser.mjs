import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const baseUrl = (process.env.CULTUREOPS_BASE_URL || "http://127.0.0.1:8787").replace(/\/$/, "");
const artifactDir = process.env.CULTUREOPS_ARTIFACT_DIR || "artifacts/cultureops-browser-smoke";
fs.mkdirSync(artifactDir, { recursive: true });

const workspaces = [
  { slug: "green-tech", domain: "agronomy", accent: "#91bd78" },
  { slug: "mycology", domain: "mycology", accent: "#b96b3e" },
  { slug: "laboratory", domain: "laboratory", accent: "#4e8bbd" },
];
const viewports = [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "mobile", width: 390, height: 844 },
];
function parseColor(value) {
  const hex = value.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const raw = hex[1].length === 3 ? [...hex[1]].map(char => char + char).join("") : hex[1];
    return [0, 2, 4].map(index => parseInt(raw.slice(index, index + 2), 16));
  }
  const rgb = value.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : null;
}
function luminance(value) {
  const channels = parseColor(value);
  if (!channels) return null;
  const linear = channels.map(channel => {
    const normalized = channel / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}
function contrastRatio(first, second) {
  const a = luminance(first), b = luminance(second);
  if (a === null || b === null) return 0;
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const supabaseStub = `
window.supabase = {
  createClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: async () => ({ error: null }),
      signInWithPassword: async () => ({ error: new Error("Browser smoke: authentication disabled") }),
      signUp: async () => ({ error: new Error("Browser smoke: authentication disabled") })
    }
  })
};
`;

const browser = await chromium.launch({ headless: true });
const failures = [];
try {
  for (const workspace of workspaces) {
    for (const viewport of viewports) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
        reducedMotion: "reduce",
      });
      const page = await context.newPage();
      const pageErrors = [];
      const badResponses = [];
      page.on("pageerror", error => pageErrors.push(error.message));
      page.on("response", response => {
        if (response.status() >= 400 && new URL(response.url()).origin === new URL(baseUrl).origin) {
          badResponses.push({ status: response.status(), url: response.url() });
        }
      });
      await page.route("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@**", route =>
        route.fulfill({ status: 200, contentType: "application/javascript", body: supabaseStub })
      );
      await page.route("https://axcouwiodqsauwnsiotn.supabase.co/**", route =>
        route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: null, error: null }) })
      );

      const url = `${baseUrl}/batch-tracker/${workspace.slug}/`;
      const response = await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
      if (!response || !response.ok()) failures.push(`${workspace.slug}/${viewport.name}: HTTP ${response?.status() ?? "no response"}`);

      try {
        await page.locator(".app-toolbar").waitFor({ state: "visible", timeout: 15000 });
        await page.locator("#authCard").waitFor({ state: "visible", timeout: 10000 });
      } catch {
        failures.push(`${workspace.slug}/${viewport.name}: workspace shell or authentication panel did not render`);
      }

      const metrics = await page.evaluate(() => {
        const body = document.body;
        const root = document.documentElement;
        const card = document.querySelector("#authCard");
        const heading = card?.querySelector("h2");
        const style = getComputedStyle(body);
        const cardStyle = card ? getComputedStyle(card) : null;
        const headingStyle = heading ? getComputedStyle(heading) : null;
        const description = card?.querySelector(".muted");
        const firstLabel = card?.querySelector("label");
        const status = card?.querySelector("#authStatus");
        const toolbar = document.querySelector(".app-toolbar");
        const hero = document.querySelector(".app-hero");
        const languageLabel = document.querySelector("#languageLabel");
        return {
          domain: body.dataset.domain,
          title: document.title,
          viewportWidth: innerWidth,
          documentWidth: root.scrollWidth,
          bodyBackground: style.backgroundColor,
          workspaceAccent: style.getPropertyValue("--workspace-accent").trim(),
          surfaceToken: style.getPropertyValue("--surface").trim(),
          cardBackground: cardStyle?.backgroundColor || null,
          headingColor: headingStyle?.color || null,
          headingText: heading?.textContent?.trim() || null,
          descriptionColor: description ? getComputedStyle(description).color : null,
          labelColor: firstLabel ? getComputedStyle(firstLabel).color : null,
          statusColor: status ? getComputedStyle(status).color : null,
          authVisible: !!card && card.getBoundingClientRect().height > 0,
          authEmailPrefilled: !!document.querySelector("#authEmail")?.value,
          toolbarPosition: toolbar ? getComputedStyle(toolbar).position : null,
          toolbarTop: toolbar?.getBoundingClientRect().top ?? null,
          heroTop: hero?.getBoundingClientRect().top ?? null,
          languageLabelWraps: languageLabel ? languageLabel.scrollWidth > languageLabel.clientWidth : true,
          navLinks: document.querySelectorAll(".section-nav a").length,
          navigationHidden: document.querySelector(".section-nav")?.hidden ?? false,
        };
      });

      if (metrics.domain !== workspace.domain) failures.push(`${workspace.slug}/${viewport.name}: wrong data-domain ${metrics.domain}`);
      if (metrics.workspaceAccent.toLowerCase() !== workspace.accent) failures.push(`${workspace.slug}/${viewport.name}: unexpected workspace accent ${metrics.workspaceAccent}; expected ${workspace.accent}`);
      const headingContrast = contrastRatio(metrics.headingColor, metrics.surfaceToken);
      if (headingContrast < 4.5) failures.push(`${workspace.slug}/${viewport.name}: auth heading contrast ${headingContrast.toFixed(2)}:1 is below 4.5:1`);
      const descriptionContrast = contrastRatio(metrics.descriptionColor, metrics.surfaceToken);
      const labelContrast = contrastRatio(metrics.labelColor, metrics.surfaceToken);
      if (descriptionContrast < 4.5) failures.push(`${workspace.slug}/${viewport.name}: auth description contrast ${descriptionContrast.toFixed(2)}:1 is below 4.5:1`);
      if (labelContrast < 4.5) failures.push(`${workspace.slug}/${viewport.name}: auth label contrast ${labelContrast.toFixed(2)}:1 is below 4.5:1`);
      if (viewport.name === "desktop" && (metrics.toolbarPosition !== "fixed" || metrics.heroTop > 200)) failures.push(`${workspace.slug}/${viewport.name}: desktop navigation still occupies content flow (position=${metrics.toolbarPosition}, heroTop=${metrics.heroTop})`);
      if (viewport.name === "mobile" && metrics.languageLabelWraps) failures.push(`${workspace.slug}/${viewport.name}: language label wraps unexpectedly`);
            if (!metrics.headingText || !metrics.authVisible) failures.push(`${workspace.slug}/${viewport.name}: auth content missing`);
      if (metrics.documentWidth > metrics.viewportWidth + 1) failures.push(`${workspace.slug}/${viewport.name}: horizontal overflow ${metrics.documentWidth}px > ${metrics.viewportWidth}px`);
      if (metrics.navLinks < 5) failures.push(`${workspace.slug}/${viewport.name}: incomplete section navigation (${metrics.navLinks} links)`);
      if (!metrics.navigationHidden) failures.push(`${workspace.slug}/${viewport.name}: module navigation is exposed before authentication`);
      if (metrics.authEmailPrefilled) failures.push(`${workspace.slug}/${viewport.name}: login email is hard-coded in the interface`);
      const accessibility = await page.evaluate(() => {
        const ids = [...document.querySelectorAll("[id]")].map(node => node.id);
        const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
        const missingHashTargets = [...document.querySelectorAll('a[href^="#"]')]
          .map(link => link.getAttribute("href").slice(1))
          .filter(id => id && !document.getElementById(id));
        const unnamedControls = [...document.querySelectorAll("input:not([type=hidden]), select, textarea, button, a[href]")]
          .filter(element => {
            const text = element.innerText?.trim() || element.getAttribute("aria-label") || element.getAttribute("title") || element.value || "";
            const labelledBy = (element.getAttribute("aria-labelledby") || "").split(/\s+/).filter(Boolean);
            return !text && !element.labels?.length && !labelledBy.some(id => document.getElementById(id)?.textContent?.trim());
          })
          .map(element => ({ tag: element.tagName, id: element.id, type: element.type || null, href: element.getAttribute("href") }));
        const brokenDescriptions = [...document.querySelectorAll("[aria-describedby]")]
          .flatMap(element => (element.getAttribute("aria-describedby") || "").split(/\s+/))
          .filter(id => id && !document.getElementById(id));
        return { duplicateIds, missingHashTargets, unnamedControls, brokenDescriptions };
      });
      if (accessibility.duplicateIds.length) failures.push(workspace.slug + "/" + viewport.name + ": duplicate IDs " + JSON.stringify(accessibility.duplicateIds));
      if (accessibility.missingHashTargets.length) failures.push(workspace.slug + "/" + viewport.name + ": broken navigation targets " + JSON.stringify(accessibility.missingHashTargets));
      if (accessibility.unnamedControls.length) failures.push(workspace.slug + "/" + viewport.name + ": controls without accessible names " + JSON.stringify(accessibility.unnamedControls));
      if (accessibility.brokenDescriptions.length) failures.push(workspace.slug + "/" + viewport.name + ": broken aria-describedby references " + JSON.stringify(accessibility.brokenDescriptions));
      for (const language of ["en", "pt", "ar", "fr"]) {
        await page.locator("#languageSelect").selectOption(language);
        const expectedSignIn = { fr: "Se connecter", en: "Sign in", pt: "Iniciar sessão", ar: "تسجيل الدخول" };
        await page.waitForFunction(expected => (
          document.documentElement.lang === expected.language &&
          document.querySelector("#signInButton")?.textContent.trim() === expected.label
        ), { language, label: expectedSignIn[language] }, { timeout: 7000 });
        const languageState = await page.evaluate(() => ({
          lang: document.documentElement.lang,
          dir: document.documentElement.dir,
          width: document.documentElement.scrollWidth,
          viewport: innerWidth,
        }));
        const expectedDirection = language === "ar" ? "rtl" : "ltr";
        if (languageState.lang !== language || languageState.dir !== expectedDirection) {
          failures.push(`${workspace.slug}/${viewport.name}: language ${language} produced ${JSON.stringify(languageState)}`);
        }
        if (languageState.width > languageState.viewport + 1) failures.push(`${workspace.slug}/${viewport.name}/${language}: horizontal overflow ${languageState.width}px > ${languageState.viewport}px`);
      }
      await page.locator("#languageSelect").selectOption("fr");
      await page.locator("#authEmail").fill("");
      await page.locator("#authPassword").fill("");
      await page.locator("#signInButton").click();
      await page.waitForFunction(() => document.querySelector("#message")?.textContent.includes("Entrez une adresse email."), null, { timeout: 5000 });
      await page.locator("#authEmail").fill("qa@example.invalid");
      await page.locator("#authPassword").fill("12345");
      await page.locator("#signUpButton").click();
      await page.waitForFunction(() => document.querySelector("#message")?.textContent.includes("au moins 6 caractères"), null, { timeout: 5000 });
      await page.locator("#authPassword").fill("valid-test-password");
      await page.locator("#signInButton").click();
      await page.waitForFunction(() => document.querySelector("#message")?.textContent.includes("Browser smoke: authentication disabled"), null, { timeout: 5000 });
      if (pageErrors.length) failures.push(`${workspace.slug}/${viewport.name}: JS errors: ${pageErrors.join(" | ")}`);
      if (badResponses.length) failures.push(`${workspace.slug}/${viewport.name}: failed local assets: ${JSON.stringify(badResponses)}`);

      const screenshotPath = path.join(artifactDir, `${workspace.slug}-${viewport.name}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true, animations: "disabled" });
      console.log(JSON.stringify({ workspace: workspace.slug, viewport: viewport.name, metrics, pageErrors, badResponses, screenshot: screenshotPath }));
      await context.close();
    }
  }
} finally {
  await browser.close();
}

if (failures.length) {
  console.error("\nCultureOps browser smoke failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log("\nCultureOps browser smoke passed: 3 workspaces × 2 viewports; screenshots saved.");
}
