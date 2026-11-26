import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const baseUrl = (process.env.CULTUREOPS_BASE_URL || "http://127.0.0.1:8787").replace(/\/$/, "");
const artifactDir = process.env.CULTUREOPS_ARTIFACT_DIR || "artifacts/cultureops-browser-smoke";
fs.mkdirSync(artifactDir, { recursive: true });

const workspaces = [
  { slug: "green-tech", domain: "agronomy", accent: "#b5d38b", cover: "universe-soil.jpg" },
  { slug: "mycology", domain: "mycology", accent: "#be7658", cover: "universe-myco.jpg" },
  { slug: "laboratory", domain: "laboratory", accent: "#78b8e8", cover: "chapter-research.jpg" },
];
const viewports = [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "mobile", width: 390, height: 844 },
  { name: "compact-mobile", width: 360, height: 800 },
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

      const balJsonUi = await page.evaluate(() => ({
        panel: !!document.querySelector("#balJsonImportPanel"),
        promptCopy: !!document.querySelector("#balJsonCopyPromptButton"),
        promptDownload: !!document.querySelector("#balJsonDownloadPromptButton"),
        schemaCopy: !!document.querySelector("#balJsonCopySchemaButton"),
        jsonInput: !!document.querySelector("#balJsonImportSource"),
        preview: !!document.querySelector("#balJsonPreviewButton"),
        import: !!document.querySelector("#balJsonImportButton"),
        status: !!document.querySelector("#balJsonImportStatus"),
        bridgeScript: [...document.scripts].some(script => script.src.includes("bal-json-import.js")),
      }));
      if (Object.values(balJsonUi).some(value => !value)) {
        failures.push(`${workspace.slug}/${viewport.name}: BAL-JSON bridge UI incomplete ${JSON.stringify(balJsonUi)}`);
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
        const container = document.querySelector(".container");
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
          signInButtonBottom: document.querySelector("#signInButton")?.getBoundingClientRect().bottom ?? null,
          toolbarPosition: toolbar ? getComputedStyle(toolbar).position : null,
          toolbarTop: toolbar?.getBoundingClientRect().top ?? null,
          toolbarRight: toolbar?.getBoundingClientRect().right ?? null,
          toolbarBottom: toolbar?.getBoundingClientRect().bottom ?? null,
          toolbarWidth: toolbar?.getBoundingClientRect().width ?? null,
          contentLeft: container?.getBoundingClientRect().left ?? null,
          contentRight: container?.getBoundingClientRect().right ?? null,
          heroTop: hero?.getBoundingClientRect().top ?? null,
          heroVisualSector: document.querySelector(".ba-sector-visual")?.dataset.sector || null,
          organicField: !!hero?.querySelector("canvas.ba-organic-field"),
          heroCoverImage: getComputedStyle(hero, "::before").backgroundImage,
          languageLabelWraps: languageLabel ? languageLabel.scrollWidth > languageLabel.clientWidth : true,
          overflowElements: [...document.querySelectorAll("body *")].map(element => {
            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return {
              tag: element.tagName,
              id: element.id || null,
              className: typeof element.className === "string" ? element.className.slice(0, 90) : null,
              left: Math.round(rect.left),
              right: Math.round(rect.right),
              width: Math.round(rect.width),
              position: style.position,
              display: style.display
            };
          }).filter(item => item.width > 0 && (item.right > innerWidth + 1 || item.left < -1))
            .sort((a, b) => b.right - a.right).slice(0, 12),
          navLinks: document.querySelectorAll(".section-nav a").length,
          navigationHidden: document.querySelector(".section-nav")?.hidden ?? false,
        };
      });

      if (viewport.width >= 821 && (metrics.toolbarPosition !== "sticky" || metrics.toolbarTop < 0 || metrics.heroTop < metrics.toolbarBottom + 8 || metrics.toolbarWidth > metrics.viewportWidth)) failures.push(`${workspace.slug}/${viewport.name}: horizontal sticky toolbar layout is invalid (${JSON.stringify({ position: metrics.toolbarPosition, top: metrics.toolbarTop, bottom: metrics.toolbarBottom, heroTop: metrics.heroTop, width: metrics.toolbarWidth, viewport: metrics.viewportWidth })})`);
      if (metrics.documentWidth > metrics.viewportWidth + 1) failures.push(`${workspace.slug}/${viewport.name}: horizontal overflow ${metrics.documentWidth}px > ${metrics.viewportWidth}px`);
      if (metrics.domain !== workspace.domain) failures.push(`${workspace.slug}/${viewport.name}: wrong data-domain ${metrics.domain}`);
      if (metrics.heroVisualSector !== workspace.domain) failures.push(`${workspace.slug}/${viewport.name}: sector-specific hero visual missing or mismatched (${metrics.heroVisualSector})`);
      if (!metrics.organicField) failures.push(`${workspace.slug}/${viewport.name}: shared organic mycelium canvas missing`);
      if (!metrics.heroCoverImage.includes(workspace.cover)) failures.push(`${workspace.slug}/${viewport.name}: expected BA Labs cover image ${workspace.cover} missing (${metrics.heroCoverImage})`);
      if (metrics.workspaceAccent.toLowerCase() !== workspace.accent) failures.push(`${workspace.slug}/${viewport.name}: unexpected workspace accent ${metrics.workspaceAccent}; expected ${workspace.accent}`);
      const headingContrast = contrastRatio(metrics.headingColor, metrics.surfaceToken);
      if (headingContrast < 4.5) failures.push(`${workspace.slug}/${viewport.name}: auth heading contrast ${headingContrast.toFixed(2)}:1 is below 4.5:1`);
      const descriptionContrast = contrastRatio(metrics.descriptionColor, metrics.surfaceToken);
      const labelContrast = contrastRatio(metrics.labelColor, metrics.surfaceToken);
      if (descriptionContrast < 4.5) failures.push(`${workspace.slug}/${viewport.name}: auth description contrast ${descriptionContrast.toFixed(2)}:1 is below 4.5:1`);
      if (labelContrast < 4.5) failures.push(`${workspace.slug}/${viewport.name}: auth label contrast ${labelContrast.toFixed(2)}:1 is below 4.5:1`);
      const accentContrast = contrastRatio(metrics.workspaceAccent, metrics.surfaceToken);
      if (accentContrast < 4.5) failures.push(`${workspace.slug}/${viewport.name}: workspace accent contrast ${accentContrast.toFixed(2)}:1 is below 4.5:1`);
      if (viewport.name === "desktop" && (metrics.toolbarPosition !== "sticky" || metrics.heroTop < metrics.toolbarBottom + 8)) failures.push(`${workspace.slug}/${viewport.name}: desktop toolbar should remain sticky above the workspace content (position=${metrics.toolbarPosition}, toolbarBottom=${metrics.toolbarBottom}, heroTop=${metrics.heroTop})`);
      if (viewport.name === "desktop" && metrics.heroTop > 220) failures.push(`${workspace.slug}/${viewport.name}: workspace hero starts too far below the top navigation (${metrics.heroTop}px > 220px)`);
      if (viewport.name === "mobile" && metrics.languageLabelWraps) failures.push(`${workspace.slug}/${viewport.name}: language label wraps unexpectedly`);
            if (!metrics.headingText || !metrics.authVisible) failures.push(`${workspace.slug}/${viewport.name}: auth content missing`);
      if (metrics.documentWidth > metrics.viewportWidth + 1) failures.push(`${workspace.slug}/${viewport.name}: horizontal overflow ${metrics.documentWidth}px > ${metrics.viewportWidth}px`);
      if (viewport.name !== "desktop" && metrics.signInButtonBottom > viewport.height) failures.push(`${workspace.slug}/${viewport.name}: sign-in action falls below the first viewport (${metrics.signInButtonBottom}px > ${viewport.height}px)`);
      if (metrics.navLinks < 5) failures.push(`${workspace.slug}/${viewport.name}: incomplete section navigation (${metrics.navLinks} links)`);
      if (!metrics.navigationHidden) failures.push(`${workspace.slug}/${viewport.name}: module navigation is exposed before authentication`);
      if (metrics.authEmailPrefilled) failures.push(`${workspace.slug}/${viewport.name}: login email is hard-coded in the interface`);
      const compactHero = await page.evaluate(() => {
        const hero = document.querySelector(".app-hero");
        const auth = document.querySelector("#authCard");
        const authWasVisible = auth && !auth.classList.contains("hidden");
        const before = hero?.getBoundingClientRect().height ?? 0;
        document.body.classList.add("workspace-authenticated");
        auth?.classList.add("hidden");
        const after = hero?.getBoundingClientRect().height ?? 0;
        const artHidden = getComputedStyle(document.querySelector(".hero-art")).display === "none";
        const descriptionHidden = getComputedStyle(document.querySelector(".hero-description")).display === "none";
        document.body.classList.remove("workspace-authenticated");
        if (authWasVisible) auth.classList.remove("hidden");
        return { before, after, artHidden, descriptionHidden };
      });
      if (!compactHero.artHidden || !compactHero.descriptionHidden || compactHero.after >= compactHero.before) failures.push(`${workspace.slug}/${viewport.name}: authenticated hero did not collapse (${compactHero.before}px -> ${compactHero.after}px)`);
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

      // Reset test-only credentials and error messages before capturing clean UI.
      await page.evaluate(() => {
        const email = document.querySelector("#authEmail");
        const password = document.querySelector("#authPassword");
        if (email) email.value = "";
        if (password) password.value = "";
        const message = document.querySelector("#message");
        if (message) message.replaceChildren();
      });

      const screenshotPath = path.join(artifactDir, `${workspace.slug}-${viewport.name}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true, animations: "disabled" });

      // Visual fixture only: render the dashboard overview without pretending
      // that the test Supabase stub has authenticated or loaded tenant data.
      if (viewport.name === "desktop" || viewport.name === "mobile") {
        await page.evaluate(() => {
          const auth = document.querySelector("#authCard");
          if (auth) auth.classList.add("hidden");
          const card = document.querySelector("#overviewCard");
          if (card) {
            card.classList.remove("hidden");
            document.body.classList.add("workspace-authenticated");
            const live = card.querySelector(".overview-live");
            if (live) live.textContent = "Aperçu visuel — données de test";
            const values = {
              overviewCultureCount: "12",
              overviewBatchCount: "8",
              overviewObservationCount: "34",
            };
            for (const [id, value] of Object.entries(values)) {
              const node = document.getElementById(id);
              if (node) node.textContent = value;
            }
            for (const [id, width] of Object.entries({
              overviewCultureMeter: "12%",
              overviewBatchMeter: "27%",
              overviewObservationMeter: "34%",
            })) {
              const node = document.getElementById(id);
              if (node) node.style.width = width;
            }
          }
        });
        const overviewPath = path.join(artifactDir, `${workspace.slug}-${viewport.name}-overview-preview.png`);
        await page.screenshot({ path: overviewPath, fullPage: true, animations: "disabled" });
        const overviewState = await page.evaluate(() => {
          const card = document.querySelector("#overviewCard");
          return {
            visible: !!card && card.getBoundingClientRect().height > 0,
            width: document.documentElement.scrollWidth,
            viewport: innerWidth,
            metricCount: card?.querySelectorAll(".overview-metric").length ?? 0,
          };
        });
        if (!overviewState.visible || overviewState.metricCount !== 3 || overviewState.width > overviewState.viewport + 1) {
          failures.push(`${workspace.slug}/${viewport.name}: dashboard overview preview failed ${JSON.stringify(overviewState)}`);
        }
      }
      const interiorState = await page.evaluate(() => {
        const fixtures = [
          ["#cultureCatalogList", "culture-catalog-row", "Culture P80"],
          ["#cultureDetailSummary", "culture-detail-field", "Identifiant"],
          ["#measurementHistory", "measurement-entry", "Température"],
          ["#batchList", "batch-item", "Lot de test"],
          ["#batchStageList", "stage active", "Incubation"],
        ];
        const checks = [];
        for (const [parentSelector, className, label] of fixtures) {
          const parent = document.querySelector(parentSelector);
          if (!parent) {
            checks.push({ parentSelector, missing: true });
            continue;
          }
          const fixture = document.createElement(className === "batch-item" ? "button" : "article");
          if (fixture.tagName === "BUTTON") fixture.type = "button";
          fixture.className = className;
          fixture.textContent = label;
          parent.appendChild(fixture);
          const style = getComputedStyle(fixture);
          const matchedBackgroundRules = [];
          const batchListRules = [];
          const stylesheetDiagnostics = [];
          for (const sheet of [...document.styleSheets]) {
            let rules;
            try { rules = [...sheet.cssRules]; } catch (error) {
              stylesheetDiagnostics.push({ href: sheet.href, error: String(error) });
              continue;
            }
            const visit = list => {
              for (const rule of list) {
                if (rule.selectorText) {
                  if (rule.selectorText.includes("batchList")) {
                    batchListRules.push({ selector: rule.selectorText, background: rule.style?.background, backgroundColor: rule.style?.backgroundColor, backgroundImage: rule.style?.backgroundImage });
                  }
                  try {
                    if (fixture.matches(rule.selectorText) && (rule.style?.background || rule.style?.backgroundColor || rule.style?.backgroundImage)) {
                      matchedBackgroundRules.push({ href: sheet.href, selector: rule.selectorText, background: rule.style.background, backgroundColor: rule.style.backgroundColor, backgroundImage: rule.style.backgroundImage, important: rule.style.getPropertyPriority("background") || rule.style.getPropertyPriority("background-color") });
                    }
                  } catch {}
                }
                if (rule.cssRules?.length) visit([...rule.cssRules]);
              }
            };
            visit(rules);
            stylesheetDiagnostics.push({ href: sheet.href, ruleCount: rules.length, lastRules: rules.slice(-18).map(rule => rule.selectorText || rule.cssText?.slice(0,180)) });
          }
          checks.push({
            parentSelector,
            fixtureSelector: parentSelector + ' > .' + className.split(' ').join('.'),
            background: style.backgroundColor,
            backgroundImage: style.backgroundImage,
            inlineStyle: fixture.getAttribute("style"),
            border: style.borderTopColor,
            radius: style.borderTopLeftRadius,
            padding: style.padding,
            matchedBackgroundRules,
            batchListRules: parentSelector === "#batchList" ? batchListRules : undefined,
            stylesheetDiagnostics,
            parentMatchesScopedSelector: parentSelector === "#batchList" ? parent.matches("html body[data-domain] #batchList") : undefined,
            stylesheets: [...document.styleSheets].map(sheet => sheet.href),
          });
          fixture.remove();
        }
        return {
          checks,
          catalogLayout: getComputedStyle(document.querySelector("#cultureCatalogList")).display,
          measurementLayout: getComputedStyle(document.querySelector("#measurementHistory")).display,
          detailGrid: getComputedStyle(document.querySelector("#cultureDetailSummary")).gridTemplateColumns,
        };
      });
      for (const check of interiorState.checks) {
        if (check.missing) failures.push(`${workspace.slug}/${viewport.name}: interior fixture parent missing (${check.parentSelector})`);
        else if (check.background === "rgba(0, 0, 0, 0)" || check.radius === "0px" || check.padding === "0px") {
          failures.push(`${workspace.slug}/${viewport.name}: interior component lacks applied surface treatment (${check.fixtureSelector || check.parentSelector}: ${JSON.stringify(check)})`);
        }
      }
      if (interiorState.catalogLayout !== "grid" || interiorState.measurementLayout !== "grid") {
        failures.push(`${workspace.slug}/${viewport.name}: interior list layout not applied (${JSON.stringify(interiorState)})`);
      }
      if (pageErrors.length) failures.push(`${workspace.slug}/${viewport.name}: JS errors: ${pageErrors.join(" | ")}`);
      if (badResponses.length) failures.push(`${workspace.slug}/${viewport.name}: failed local assets: ${JSON.stringify(badResponses)}`);
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
  console.log("\nCultureOps browser smoke passed: 3 workspaces × 3 viewports; screenshots saved.");
}
