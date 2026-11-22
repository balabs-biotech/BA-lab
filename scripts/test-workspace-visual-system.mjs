import fs from "node:fs";
import assert from "node:assert/strict";

const html = fs.readFileSync("batch-tracker/workspace.html", "utf8");
const visuals = fs.readFileSync("batch-tracker/workspace-visuals.js", "utf8");
const motion = fs.readFileSync("batch-tracker/styles/motion.css", "utf8");
const shared = fs.readFileSync("batch-tracker/styles/workspace-components.css", "utf8");
const lineage = fs.readFileSync("batch-tracker/mycology-lineage-visuals.js", "utf8");
const mycology = fs.readFileSync("batch-tracker/styles/mycology-workspace.css", "utf8");
const mycologyEntry = fs.readFileSync("batch-tracker/mycology/index.html", "utf8");
const greenTechEntry = fs.readFileSync("batch-tracker/green-tech/index.html", "utf8");
const laboratoryEntry = fs.readFileSync("batch-tracker/laboratory/index.html", "utf8");

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
assert.ok(motion.includes("radial-gradient(360px circle at var(--ba-pointer-x"), "OriginKit-inspired pointer light must remain integrated into the shared surface system");
assert.ok(lineage.includes("bezierCurveTo"), "PixiJS lineage edges must use curved biological topology");
assert.ok(lineage.includes('data-graph-zoom="in"') && lineage.includes('data-graph-zoom="out"'), "PixiJS lineage graph must expose zoom controls");
assert.ok(lineage.includes('data-graph-zoom="fit"'), "PixiJS lineage graph must expose a recenter action");
assert.ok(lineage.includes("window.addEventListener(\"pointermove\""), "PixiJS lineage graph must support pointer panning without capturing node taps");
assert.ok(lineage.includes("graph.width * zoom"), "PixiJS zoom must expand the scrollable canvas surface");
assert.ok(mycology.includes(".lineage-graph-toolbar"), "Mycology must style the PixiJS controls");
assert.ok(mycologyEntry.includes("20261117-pixi-graph-controls-159"), "Mycology must load the upgraded PixiJS runtime");
assert.ok(greenTechEntry.includes("20261117-sector-interaction-160"), "GreenTech must load the interactive sector particle runtime");
assert.ok(laboratoryEntry.includes("20261117-sector-interaction-160"), "Laboratory must load the interactive sector particle runtime");

const laboratoryProcess = fs.readFileSync("batch-tracker/laboratory-process-visuals.js", "utf8");
const laboratoryStyles = fs.readFileSync("batch-tracker/styles/laboratory-process-map.css", "utf8");
assert.ok(laboratoryProcess.includes('import("https://cdn.jsdelivr.net/npm/pixi.js@8.17.1/dist/pixi.min.mjs")'), "Laboratory process map must use the same pinned PixiJS runtime");
assert.ok(laboratoryProcess.includes('querySelectorAll(":scope > .stage")'), "Laboratory process map must derive nodes from actual rendered batch stages");
assert.ok(laboratoryProcess.includes('element.classList.contains("completed")') && laboratoryProcess.includes('element.classList.contains("active")') && laboratoryProcess.includes('element.classList.contains("failed")'), "Laboratory process map must reflect persisted stage states");
assert.ok(laboratoryProcess.includes("next.stop()"), "Laboratory process map must render on demand without a permanent GPU ticker");
assert.ok(laboratoryProcess.includes("observer.disconnect()"), "Laboratory process map must release its observer on page exit");
assert.ok(laboratoryProcess.includes("La liste détaillée des étapes reste accessible"), "Laboratory process map must retain a semantic fallback");
assert.ok(laboratoryStyles.includes(".lab-process-map-stage"), "Laboratory process map must have a bounded scrollable stage");
assert.ok(laboratoryEntry.includes("20261117-lab-process-map-161"), "Laboratory must load the new process map runtime");

console.log("✓ CultureOps sector-specific visual runtime contract");

const greenClimate = fs.readFileSync("batch-tracker/greentech-climate-signature.js", "utf8");
const greenClimateStyles = fs.readFileSync("batch-tracker/styles/greentech-climate-signature.css", "utf8");
assert.ok(greenClimate.includes('import("https://cdn.jsdelivr.net/npm/pixi.js@8.17.1/dist/pixi.min.mjs")'), "GreenTech climate signature must use pinned PixiJS");
assert.ok(greenClimate.includes('document.querySelectorAll("#envWeatherCharts > .environmental-weather-chart")'), "GreenTech visualization must read existing NASA POWER chart cards");
assert.ok(greenClimate.includes('svg.querySelectorAll("circle")') && greenClimate.includes('circle.querySelector("title")'), "GreenTech visualization must derive plotted points and labels from real chart data");
assert.ok(greenClimate.includes("next.stop()"), "GreenTech PixiJS visualization must render on demand without a permanent ticker");
assert.ok(greenClimate.includes("resizeObserver.disconnect()"), "GreenTech visualization must clean up resize observers");
assert.ok(greenClimate.includes("plot.replaceChildren()") && !greenClimate.includes("charts.replaceChildren()"), "GreenTech visualization must leave the native NASA POWER chart cards intact");
assert.ok(greenClimateStyles.includes(".greentech-climate-signature"), "GreenTech climate signature must have its own visual system");
assert.ok(greenClimateStyles.includes("greentech-climate-values"), "GreenTech visual summary must expose accessible textual values");
assert.ok(greenTechEntry.includes("20261117-climate-signature-162"), "GreenTech must load the climate signature runtime");

const mycologyActivity = fs.readFileSync("batch-tracker/mycology-activity-timeline.js", "utf8");
const mycologyActivityStyles = fs.readFileSync("batch-tracker/styles/mycology-activity-timeline.css", "utf8");
assert.ok(mycologyActivity.includes('import("https://cdn.jsdelivr.net/npm/pixi.js@8.17.1/dist/pixi.min.mjs")'), "Mycology activity timeline must use pinned PixiJS");
assert.ok(mycologyActivity.includes('querySelectorAll(":scope > .culture-timeline-entry")'), "Mycology timeline must derive nodes from existing culture history entries");
assert.ok(mycologyActivity.includes('time?.textContent?.trim()') && mycologyActivity.includes('heading?.textContent?.trim()'), "Mycology timeline must use stored date and event labels");
assert.ok(mycologyActivity.includes("next.stop()"), "Mycology timeline must render on demand without a permanent GPU ticker");
assert.ok(mycologyActivity.includes("resizeObserver?.disconnect()"), "Mycology timeline must clean up resize observers");
assert.ok(mycologyActivity.includes("if (!shell.isConnected) target.prepend(shell)"), "Mycology timeline must survive culture selection replacing the history container contents");
assert.ok(mycologyActivity.includes("L’historique détaillé reste accessible"), "Mycology timeline must preserve its text fallback");
assert.ok(mycologyActivityStyles.includes(".mycology-activity-stage"), "Mycology timeline must provide a bounded scrollable visualization");
assert.ok(mycologyEntry.includes("20261117-mycology-activity-163"), "Mycology must load the activity timeline runtime");


const spatialNavigation = fs.readFileSync("batch-tracker/workspace-spatial-navigation.js", "utf8");
const spatialStyles = fs.readFileSync("batch-tracker/styles/workspace-spatial-navigation.css", "utf8");
const unifiedWorkspace = fs.readFileSync("batch-tracker/workspace-unified.css", "utf8");
assert.ok(unifiedWorkspace.includes("workspace-spatial-navigation.css"), "All workspaces must load the spatial navigation visual layer");
assert.ok(spatialNavigation.includes("overviewCard") && spatialNavigation.includes("measurementCard") && spatialNavigation.includes("statisticsCard"), "Spatial navigation must connect overview, data and analysis modules");
assert.ok(spatialNavigation.includes('direction === "left" || direction === "right"') && spatialNavigation.includes('const other = row === "primary" ? "secondary" : "primary"'), "Spatial navigation must support all four directions");
assert.ok(spatialNavigation.includes("ArrowLeft") && spatialNavigation.includes("ArrowRight") && spatialNavigation.includes("ArrowUp") && spatialNavigation.includes("ArrowDown"), "Spatial navigation must support keyboard arrows");
assert.ok(spatialNavigation.includes('event.pointerType !== "touch"') && spatialNavigation.includes("Math.abs(dx) < 70"), "Mobile users must be able to move between modules with deliberate horizontal swipes");
assert.ok(spatialNavigation.includes("prefers-reduced-motion") && spatialStyles.includes("prefers-reduced-motion:reduce"), "Spatial transitions must respect reduced-motion preferences");
for (const [label, entry] of [["GreenTech", greenTechEntry], ["Mycology", mycologyEntry], ["Laboratory", laboratoryEntry]]) {
  assert.ok(entry.includes("workspace-spatial-navigation.js?v=20261117-spatial-navigation-1"), label + " must load the shared spatial navigation runtime after the workspace engine");
}
assert.ok(spatialStyles.includes(".ba-spatial-dock") && spatialStyles.includes("@keyframes ba-spatial-arrive"), "The navigation dock and panel transition must have a dedicated visual layer");
assert.ok(spatialNavigation.includes("toolbar.appendChild(dock)") && spatialStyles.includes("flex:1 0 100%"), "Spatial controls must stay inside the existing toolbar without changing workspace grid rows");
assert.ok(!spatialStyles.includes("grid-template-areas:"), "Spatial navigation must not add implicit grid rows to the legacy workspace");
assert.ok(spatialNavigation.includes("plantCard") && spatialNavigation.includes("agronomy"), "GreenTech plant workspace must remain in the spatial navigation map");
assert.ok(spatialNavigation.includes("ba-spatial-enter-x") && spatialNavigation.includes("ba-spatial-enter-y") && spatialStyles.includes("translate3d(var(--ba-spatial-enter-x"), "Panel transitions must follow the chosen left, right, up or down direction");
assert.ok(["fr:", "en:", "pt:", "ar:"].every(language => spatialNavigation.includes(language)), "Spatial navigation must be available in all four CultureOps languages");
console.log("✓ CultureOps spatial navigation: four directions, keyboard, touch and reduced motion");
