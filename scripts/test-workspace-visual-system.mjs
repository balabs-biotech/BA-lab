import fs from "node:fs";
import assert from "node:assert/strict";

const html = fs.readFileSync("batch-tracker/workspace.html", "utf8");
const visuals = fs.readFileSync("batch-tracker/workspace-visuals.js", "utf8");
const motion = fs.readFileSync("batch-tracker/styles/motion.css", "utf8");
const shared = fs.readFileSync("batch-tracker/styles/workspace-components.css", "utf8");
const visualizationFoundation = fs.readFileSync("batch-tracker/styles/visualization-foundation.css", "utf8");
const interiorHarmonization = fs.readFileSync("batch-tracker/styles/interior-harmonization.css", "utf8");
const lineage = fs.readFileSync("batch-tracker/mycology-lineage-visuals.js", "utf8");
const mycology = fs.readFileSync("batch-tracker/styles/mycology-workspace.css", "utf8");
const mycologyEntry = fs.readFileSync("batch-tracker/mycology/index.html", "utf8");
const greenTechEntry = fs.readFileSync("batch-tracker/green-tech/index.html", "utf8");
const laboratoryEntry = fs.readFileSync("batch-tracker/laboratory/index.html", "utf8");

const entryPages = [
  ["Mycology", mycologyEntry, "data-domain=\"mycology\""],
  ["GreenTech", greenTechEntry, "data-domain=\"agronomy\""],
  ["Laboratory", laboratoryEntry, "data-domain=\"laboratory\""]
];

for (const [name, page, domain] of entryPages) {
  assert.ok(page.includes(domain), name + " must preserve its workspace identity");
  assert.ok(page.includes("workspace-entry-state") && page.includes("workspace-entry-indicator"), name + " must use the shared loading state");
  assert.ok(page.includes("workspace-entry-error") && page.includes("role='alert'"), name + " must use the shared recoverable-error surface");
  assert.ok(!page.includes("<main class='container'><p role='alert'>"), name + " must not retain unstyled legacy failure fallbacks");
  assert.ok((page.match(/workspace-entry-error/g) || []).length >= 3, name + " must harmonize service, language and application-load failures");
  assert.ok(page.includes("workspace-unified.css?v=20261127-entry-state-213"), name + " must load the current shared visual system");
}
assert.ok(interiorHarmonization.includes(".workspace-entry-state") && interiorHarmonization.includes(".workspace-entry-indicator"), "Workspace entry and loading states must share the BA Labs visual system");
assert.ok(interiorHarmonization.includes(".workspace-entry-error") && interiorHarmonization.includes("ba-entry-spin"), "Workspace failures must use a legible branded recovery surface");
assert.ok(interiorHarmonization.includes("prefers-reduced-motion:reduce") && interiorHarmonization.includes(".workspace-entry-indicator { animation:none"), "Entry loading motion must respect reduced-motion preferences");

assert.ok(html.includes('class="app-hero"'), "Each sector must retain the shared workspace header");
assert.ok(!html.includes('id="ba-particle-field"'), "The obsolete global particle layer must be removed from the shared workspace markup");
assert.ok(!html.includes("visual-mycology"), "The obsolete branching mycelium hero SVG must not be shipped in the shared markup");
assert.ok(!visuals.includes("workspace-particle-field"), "The old generic global particle field must be removed");
assert.ok(visuals.includes('ba-sector-visual--mycology'), "Mycology must have a dedicated colony-growth scene");
assert.ok(visuals.includes('ba-sector-visual--greentech'), "GreenTech must have a dedicated leaf-growth scene");
assert.ok(visuals.includes('ba-sector-visual--laboratory'), "Laboratory must have a dedicated bioreactor scene");
assert.ok(visuals.includes('mode: "repulse"') && visuals.includes('mode: "push"'), "GreenTech particles must react to pointer hover and click");
assert.ok(visuals.includes('mode: "bubble"'), "Laboratory particles must react with a controlled bubble interaction");
assert.ok(visuals.includes('count: compact ? 5 : 10'), "GreenTech must have its own particle density");
assert.ok(visuals.includes('count: compact ? 4 : 8'), "Laboratory must have its own particle density");
assert.ok(!visuals.includes("links: { enable: true"), "Decorative sector particles must not form filament-like links");
assert.ok(visuals.includes("prefers-reduced-motion"), "The visual runtime must respect reduced motion");
assert.ok(visuals.includes("pauseOnOutsideViewport: true"), "Particle animation must pause outside the viewport");
assert.ok(motion.includes("ba-colony-ring"), "Mycology colony rings must animate independently");
assert.ok(motion.includes("ba-leaf-trace"), "GreenTech vein scan must animate independently");
assert.ok(motion.includes("ba-reactor-bubble"), "Laboratory reactor bubbles must animate independently");
assert.ok(motion.includes("workspace-authenticated .hero-art.ba-sector-art"), "Sector identity must remain visible in authenticated workspaces");
assert.ok(motion.includes("prefers-reduced-motion:reduce"), "CSS motion must include a reduced-motion fallback");
assert.ok(shared.includes("backdrop-filter:blur(18px)"), "Workspace toolbar must retain the glass navigation treatment");
assert.ok(visualizationFoundation.includes(".mycology-activity-tools,.lab-process-map-controls"), "Scientific visualization controls must share a common interaction foundation");
assert.ok(visualizationFoundation.includes(":focus-visible"), "Scientific visualization controls must expose a visible keyboard focus state");
assert.ok(visualizationFoundation.includes("min-height:40px"), "Scientific visualization controls must meet a 40px touch target");
assert.ok(fs.readFileSync("batch-tracker/styles/mycology-activity-timeline.css", "utf8").includes("min-height:40px"), "Mycology activity controls must not override the shared touch target");
assert.ok(fs.readFileSync("batch-tracker/styles/laboratory-process-map.css", "utf8").includes("min-height:40px"), "Laboratory process controls must meet the shared touch target");
assert.ok(visualizationFoundation.includes("prefers-reduced-motion:reduce"), "Visualization controls must respect reduced-motion preferences");
assert.ok(motion.includes("radial-gradient(360px circle at var(--ba-pointer-x"), "OriginKit-inspired pointer light must remain integrated into the shared surface system");
assert.ok(lineage.includes("descendant: 0xd9a36e") && !lineage.includes("descendant: 0xb4f477"), "Mycology lineage descendants must use the copper/amber palette, not GreenTech lime");
assert.ok(!mycology.includes("#b4f477") && !mycology.includes("#83a7a0") && mycology.includes("background:#9b9a8f") && mycology.includes("background:#d9a36e"), "Mycology lineage legend must use warm neutral origins and copper/amber descendants");
assert.ok(lineage.includes("bezierCurveTo"), "PixiJS lineage edges must use curved biological topology");
assert.ok(lineage.includes('data-graph-zoom="in"') && lineage.includes('data-graph-zoom="out"'), "PixiJS lineage graph must expose zoom controls");
assert.ok(lineage.includes('data-graph-zoom="fit"'), "PixiJS lineage graph must expose a recenter action");
assert.ok(lineage.includes("window.addEventListener(\"pointermove\""), "PixiJS lineage graph must support pointer panning without capturing node taps");
assert.equal((lineage.match(/window\.addEventListener\("pointermove"/g) || []).length, 1, "Lineage graph must register pointer listeners once, not on every render");
assert.ok(lineage.includes("graphWidth * zoom") && lineage.includes("graphHeight * zoom"), "PixiJS zoom must expand the scrollable canvas surface");
assert.ok(lineage.includes("let pendingApp = null") && lineage.includes("if (pendingApp) { pendingApp.destroy(true, true); pendingApp = null; }"), "Lineage graph must dispose a renderer whose initialization fails");
assert.ok(lineage.includes("function showFallback(message, revealList = false)") && lineage.includes("if (app) { app.destroy(true, true); app = null; }\n    stage.replaceChildren();"), "Lineage renderer must release its PixiJS application when entering fallback");
assert.ok(mycology.includes(".lineage-graph-toolbar"), "Mycology must style the PixiJS controls");
assert.ok(mycology.includes(".lineage-graph-toolbar button:focus-visible"), "Mycology lineage controls must expose a visible keyboard focus state");
assert.ok(mycology.includes("min-width:40px !important") && mycology.includes("min-height:40px !important"), "Mycology lineage controls must meet the 40px touch target");
assert.ok(mycologyEntry.includes("20261117-pixi-graph-controls-159"), "Mycology must load the upgraded PixiJS runtime");
assert.ok(greenTechEntry.includes("20261126-organic-mycelium-cover-1"), "GreenTech must load the shared BA Labs organic visual runtime");
assert.ok(laboratoryEntry.includes("20261126-organic-mycelium-cover-1"), "Laboratory must load the shared BA Labs organic visual runtime");

const laboratoryProcess = fs.readFileSync("batch-tracker/laboratory-process-visuals.js", "utf8");
const laboratoryStyles = fs.readFileSync("batch-tracker/styles/laboratory-process-map.css", "utf8");
assert.ok(laboratoryProcess.includes('import("https://cdn.jsdelivr.net/npm/pixi.js@8.17.1/dist/pixi.min.mjs")'), "Laboratory process map must use the same pinned PixiJS runtime");
assert.ok(laboratoryProcess.includes('querySelectorAll(":scope > .stage")'), "Laboratory process map must derive nodes from actual rendered batch stages");
assert.ok(laboratoryProcess.includes('element.classList.contains("completed")') && laboratoryProcess.includes('element.classList.contains("active")') && laboratoryProcess.includes('element.classList.contains("failed")'), "Laboratory process map must reflect persisted stage states");
assert.ok(laboratoryProcess.includes("next.stop()"), "Laboratory process map must render on demand without a permanent GPU ticker");
assert.ok(laboratoryProcess.includes("observer.disconnect()"), "Laboratory process map must release its observer on page exit");
assert.ok(laboratoryProcess.includes("let pendingApp = null") && laboratoryProcess.includes("if (pendingApp) { pendingApp.destroy(true, true); pendingApp = null; }"), "Laboratory process map must dispose a renderer whose initialization fails");
assert.ok(laboratoryProcess.includes("La liste détaillée des étapes reste accessible"), "Laboratory process map must retain a semantic fallback");
assert.ok(laboratoryStyles.includes(".lab-process-map-stage"), "Laboratory process map must have a bounded scrollable stage");
assert.ok(laboratoryEntry.includes("20261117-lab-process-map-161"), "Laboratory must load the new process map runtime");


const cultureDetailMarkup = html.slice(html.indexOf('id="cultureDetailPanel"'), html.indexOf('id="plantCard"'));
assert.ok(cultureDetailMarkup.includes('id="cultureDetailSummary"') && cultureDetailMarkup.includes('id="bioOperationForm"'), "Culture detail must expose its summary and biological-operation form");
assert.ok(cultureDetailMarkup.includes('id="cultureLineage"') && cultureDetailMarkup.includes('id="cultureDetailTimeline"'), "Culture detail must preserve lineage and the complete evidence timeline");
assert.ok(interiorHarmonization.includes(".culture-detail-summary") && interiorHarmonization.includes("grid-template-columns:repeat(auto-fit"), "Culture summary fields must use a responsive, content-aware grid");
assert.ok(interiorHarmonization.includes(".culture-detail-heading") && interiorHarmonization.includes("flex-direction:column"), "Culture detail heading and close action must stack on narrow screens");
assert.ok(interiorHarmonization.includes(".culture-linked-batches .culture-timeline-entry") && interiorHarmonization.includes("grid-template-columns:minmax(0,1fr) auto"), "Linked production batches must retain a readable record/action layout");
const batchMarkup = html.slice(html.indexOf('id="batchCard"'), html.indexOf('id="statisticsCard"'));
assert.ok(batchMarkup.includes('class="batch-create-panel"') && batchMarkup.includes('id="batchQcList"'), "Production workspace must retain lot creation and quality-control surfaces");
assert.ok(batchMarkup.includes('id="batchEvents"') && batchMarkup.includes('id="batchEventList"'), "Production workspace must retain its traceability journal and event list");
assert.ok(batchMarkup.includes('id="harvestQuantity"') && batchMarkup.includes('id="moveBatchLocation"'), "Production journal must retain harvest and movement controls");
assert.ok(interiorHarmonization.includes(".batch-event-item") && interiorHarmonization.includes(".qc-row"), "Production events and quality checks must share the harmonized record surfaces");
assert.ok(interiorHarmonization.includes("@media(max-width:760px)") && interiorHarmonization.includes(".culture-timeline-entry"), "Scientific record timelines must have a narrow-screen layout");
assert.ok(batchMarkup.includes('<div class="batch-harvest-entry">') && batchMarkup.includes('<div class="grid">'), "Harvest and movement panels must retain their nested field grids");
assert.ok(interiorHarmonization.includes("#batchEvents .batch-harvest-entry > .grid"), "Batch journal subforms must have an explicit nested-grid layout");
assert.ok(interiorHarmonization.includes("@media(max-width:760px)") && interiorHarmonization.includes("#batchEvents .batch-harvest-entry > .grid {\n    grid-template-columns:minmax(0,1fr)"), "Harvest and movement fields must stack on narrow screens");


const measurementMarkup = html.slice(html.indexOf('id="measurementCard"'), html.indexOf('id="statisticsCard"'));
assert.ok(measurementMarkup.includes('class="quick-capture-grid"') && measurementMarkup.includes('id="measurementHistory"') && measurementMarkup.includes('class="observation-details"'), "Measurement workspace must retain quick capture, history and qualitative observation surfaces");
assert.ok(interiorHarmonization.includes("#measurementCard .quick-capture-grid") && interiorHarmonization.includes("grid-template-columns:repeat(2,minmax(0,1fr))"), "Quick capture tiles must use a responsive two-column layout");
assert.ok(interiorHarmonization.includes("#measurementCard > .grid") && interiorHarmonization.includes("#measurementCard .observation-details > .grid"), "Measurement and observation fields must have explicit responsive grid rules");
assert.ok(interiorHarmonization.includes("#measurementCard .bal-json-panel") && interiorHarmonization.includes("overflow-wrap:anywhere"), "BAL-JSON import content must remain readable without horizontal overflow");
assert.ok(interiorHarmonization.includes("#measurementCard #measurementHistory") && interiorHarmonization.includes("min-width:0"), "Measurement history must remain constrained within its workspace card");


const statisticsMarkup = html.slice(html.indexOf('id="statisticsCard"'), html.indexOf('id="resultCard"'));
assert.ok(statisticsMarkup.includes('class="statistics-filters"') && statisticsMarkup.includes('id="statisticsSummary"') && statisticsMarkup.includes('id="statisticsChart"') && statisticsMarkup.includes('class="statistics-table-wrap"'), "Statistics workspace must retain filters, summary, chart and raw-data table");
assert.ok(interiorHarmonization.includes("#statisticsCard .statistics-filters") && interiorHarmonization.includes("@media(max-width:760px)"), "Statistics filters must adapt from desktop grid to mobile stack");
assert.ok(interiorHarmonization.includes("#statisticsCard .statistics-summary-item") && interiorHarmonization.includes("repeat(auto-fit,minmax(min(100%,150px),1fr))"), "Statistics summary must form responsive metric tiles");
assert.ok(interiorHarmonization.includes("#statisticsCard .statistics-chart") && interiorHarmonization.includes("min-height:180px"), "Statistics chart must have a bounded, readable visualization surface");
assert.ok(interiorHarmonization.includes("#statisticsCard .statistics-table") && interiorHarmonization.includes("min-width:620px") && interiorHarmonization.includes("overflow-x:auto"), "Raw statistics table must remain legible through horizontal scrolling on narrow screens");


const batchMarkup = html.slice(html.indexOf('id="batchCard"'), html.indexOf('id="statisticsCard"'));
assert.ok(batchMarkup.includes('class="batch-create-panel"') && batchMarkup.includes('id="batchList"') && batchMarkup.includes('class="batch-compare-panel"'), "Production workspace must retain lot creation, list and comparison surfaces");
assert.ok(batchMarkup.includes('id="batchStages"') && batchMarkup.includes('id="batchQc"') && batchMarkup.includes('id="batchEvents"') && batchMarkup.includes('id="batchEventList"'), "Production workspace must retain lifecycle, quality and traceability surfaces");
assert.ok(interiorHarmonization.includes("#batchCard .batch-create-panel > .grid") && interiorHarmonization.includes("#batchCard .batch-compare-panel"), "Lot creation and comparison panels must have dedicated visual hierarchy");
assert.ok(interiorHarmonization.includes("#batchCard #batchStages") && interiorHarmonization.includes("#batchCard #batchQc") && interiorHarmonization.includes("#batchCard #batchEvents"), "Lifecycle, QC and traceability panels must share the interior visual system");
assert.ok(interiorHarmonization.includes("#batchCard .batch-harvest-entry .grid") && interiorHarmonization.includes("#batchCard #batchEventList"), "Harvest and movement forms plus event history must be responsive and contained");
assert.ok(interiorHarmonization.includes("@media(max-width:760px)") && interiorHarmonization.includes("#batchCard .batch-actions"), "Production actions must stack on mobile");


const cultureDetailMarkup = html.slice(html.indexOf('id="cultureDetailPanel"'), html.indexOf('<!-- ======================================================\n       REGISTRE AGRITECH'));
assert.ok(cultureDetailMarkup.includes('id="cultureDetailSummary"') && cultureDetailMarkup.includes('id="bioOperationForm"'), "Culture detail must retain summary and biological operation form");
assert.ok(cultureDetailMarkup.includes('id="cultureLineage"') && cultureDetailMarkup.includes('id="cultureDetailTimeline"'), "Culture detail must retain lineage and complete timeline");
assert.ok(interiorHarmonization.includes("#trackerCard .bio-operation-form") && interiorHarmonization.includes("#trackerCard .bio-operation-wide"), "Biological operation form must use a responsive structured grid");
assert.ok(interiorHarmonization.includes("#trackerCard .lineage-graph-stage") && interiorHarmonization.includes("#trackerCard .lineage-graph-toolbar"), "Lineage graph must provide a contained stage and accessible controls");
assert.ok(interiorHarmonization.includes("#trackerCard .culture-lineage-node") && interiorHarmonization.includes("#trackerCard .lineage-data-details"), "Lineage must retain readable selectable nodes and a text-list fallback");
assert.ok(interiorHarmonization.includes("#trackerCard .culture-detail-timeline") && interiorHarmonization.includes("@media(max-width:760px)"), "Culture history must adapt to narrow screens");


const plantMarkup = html.slice(html.indexOf('id="plantCard"'), html.indexOf('<!-- ======================================================\n       LOTS DE PRODUCTION'));
assert.ok(plantMarkup.includes('id="plantCultureForm"') && plantMarkup.includes('id="plantCultureList"') && plantMarkup.includes('id="plantCultureStatus"'), "Plant register must retain its entry form, list and status feedback");
assert.ok(interiorHarmonization.includes("#plantCard #plantCultureForm") && interiorHarmonization.includes("#plantCard #plantCultureList"), "Plant register form and record list must use the shared interior system");
assert.ok(interiorHarmonization.includes("#plantCard #plantCultureList .plant-culture-status") && interiorHarmonization.includes("@media(max-width:760px)"), "Plant status and entry form must remain legible on mobile");

console.log("✓ CultureOps sector-specific visual runtime contract");

const greenClimate = fs.readFileSync("batch-tracker/greentech-climate-signature.js", "utf8");
const greenClimateStyles = fs.readFileSync("batch-tracker/styles/greentech-climate-signature.css", "utf8");
assert.ok(greenClimate.includes('import("https://cdn.jsdelivr.net/npm/pixi.js@8.17.1/dist/pixi.min.mjs")'), "GreenTech climate signature must use pinned PixiJS");
assert.ok(greenClimate.includes('document.querySelectorAll("#envWeatherCharts > .environmental-weather-chart")'), "GreenTech visualization must read existing NASA POWER chart cards");
assert.ok(greenClimate.includes('svg.querySelectorAll("circle")') && greenClimate.includes('circle.querySelector("title")'), "GreenTech visualization must derive plotted points and labels from real chart data");
assert.ok(greenClimate.includes("next.stop()"), "GreenTech PixiJS visualization must render on demand without a permanent ticker");
assert.ok(greenClimate.includes("let pendingApp = null") && greenClimate.includes("if (pendingApp) { pendingApp.destroy(true, true); pendingApp = null; }"), "GreenTech must dispose a renderer whose initialization fails");
assert.ok(greenClimate.includes("resizeObserver.disconnect()"), "GreenTech visualization must clean up resize observers");
assert.ok(greenClimate.includes("plot.replaceChildren()") && !greenClimate.includes("charts.replaceChildren()"), "GreenTech visualization must leave the native NASA POWER chart cards intact");
assert.ok(greenClimateStyles.includes(".greentech-climate-signature"), "GreenTech climate signature must have its own visual system");
assert.ok(greenClimateStyles.includes("greentech-climate-values"), "GreenTech visual summary must expose accessible textual values");
assert.ok(greenTechEntry.includes("20261117-climate-signature-162"), "GreenTech must load the climate signature runtime");

const mycologyActivity = fs.readFileSync("batch-tracker/mycology-activity-timeline.js", "utf8");
const mycologyActivityStyles = fs.readFileSync("batch-tracker/styles/mycology-activity-timeline.css", "utf8");
assert.ok(interiorHarmonization.includes("color:#e8eee8 !important") && interiorHarmonization.includes("color:#c3cec5 !important") && interiorHarmonization.includes("color:#aebdb2 !important"), "Scientific headings, form labels and helper text must use high-contrast mineral tones");
assert.ok(interiorHarmonization.includes(":is(#overviewCard,#trackerCard,#plantCard,#batchCard,#measurementCard,#statisticsCard,#resultCard) > h2") && interiorHarmonization.includes("color:#e2b092 !important"), "Legacy ID-scoped interior headings and sector kickers must retain readable contrast");
assert.ok(interiorHarmonization.includes("#balJsonImportPanel .bal-json-heading h3") && interiorHarmonization.includes("#balJsonImportPanel .bal-json-preview"), "BAL-JSON import title, help text and preview must remain legible on dark surfaces");
assert.ok(mycologyActivity.includes('import("https://cdn.jsdelivr.net/npm/pixi.js@8.17.1/dist/pixi.min.mjs")'), "Mycology activity timeline must use pinned PixiJS");
assert.ok(mycologyActivity.includes('querySelectorAll(":scope > .culture-timeline-entry")'), "Mycology timeline must derive nodes from existing culture history entries");
assert.ok(!mycologyActivity.includes("}).slice(0, 18);"), "Mycology timeline must not silently truncate large culture histories");
assert.ok(mycologyActivity.includes('time?.textContent?.trim()') && mycologyActivity.includes('heading?.textContent?.trim()'), "Mycology timeline must use stored date and event labels");
assert.ok(mycologyActivity.includes("observation: 0xd9a36e") && mycologyActivity.includes("measurement: 0x9b6d54") && !mycologyActivity.includes("observation: 0xb5d98c") && !mycologyActivity.includes("measurement: 0x8dbce0"), "Mycology activity timeline must stay within copper/amber/brown tones");
assert.ok(mycologyActivity.includes("next.stop()"), "Mycology timeline must render on demand without a permanent GPU ticker");
assert.ok(mycologyActivity.includes("let pendingApp = null") && mycologyActivity.includes("if (pendingApp) { pendingApp.destroy(true, true); pendingApp = null; }"), "Mycology timeline must dispose a renderer whose initialization fails");
assert.ok(mycologyActivity.includes("resizeObserver?.disconnect()"), "Mycology timeline must clean up resize observers");
assert.ok(mycologyActivity.includes("if (!shell.isConnected) target.prepend(shell)"), "Mycology timeline must survive culture selection replacing the history container contents");
assert.ok(mycologyActivity.includes("L’historique détaillé reste accessible"), "Mycology timeline must preserve its text fallback");
assert.ok(mycologyActivityStyles.includes(".mycology-activity-stage"), "Mycology timeline must provide a bounded scrollable visualization");
assert.ok(mycologyActivity.includes("if (!entries.length)"), "Mycology timeline must explicitly handle a genuinely empty culture history");
assert.ok(mycologyActivity.includes("const pageSize = 24") && mycologyActivity.includes("data-activity-page=\"prev\"") && mycologyActivity.includes("data-activity-page=\"next\""), "Mycology timeline must paginate long histories without dropping records");
assert.ok(mycologyActivity.includes('pageLabel.textContent = "Liste complète"') && mycologyActivity.includes("previousPage.disabled = true") && mycologyActivity.includes("nextPage.disabled = true"), "Mycology timeline controls must disable cleanly when the graphic falls back");
assert.ok(mycologyActivityStyles.includes("flex-wrap:wrap"), "Mycology timeline controls must wrap on narrow screens");
assert.ok(mycologyActivity.includes("shell.dataset.state = \"ready\"") && mycologyActivity.includes("shell.dataset.state = \"fallback\""), "Mycology timeline must expose ready and fallback render states");
assert.ok(greenClimate.includes("panel.dataset.state = \"empty\"") && greenClimate.includes("panel.dataset.state = \"ready\"") && greenClimate.includes("panel.dataset.state = \"fallback\""), "GreenTech climate signature must distinguish empty, ready and fallback states");
assert.ok(laboratoryProcess.includes("shell.dataset.state = \"empty\"") && laboratoryProcess.includes("shell.dataset.state = \"ready\"") && laboratoryProcess.includes("shell.dataset.state = \"fallback\""), "Laboratory process map must distinguish empty, ready and fallback states");
assert.ok(greenClimate.includes("renderText(series)"), "GreenTech must retain textual climate values when graphical rendering is unavailable");
assert.ok(greenClimate.includes("if (!charts) {\n      destroy();\n      panel.hidden = true;\n      panel.dataset.state = \"empty\";"), "GreenTech must release stale charts when its source panel disappears");
assert.ok(laboratoryProcess.includes("querySelectorAll(\":scope > .stage\")"), "Laboratory map must only project the currently selected batch stages");
assert.ok(mycologyEntry.includes("20261117-mycology-activity-163"), "Mycology must load the activity timeline runtime");
