import fs from "node:fs";
import vm from "node:vm";
const root=fs.readFileSync("index.html","utf8");
const engine=fs.readFileSync("batch-tracker/tracker.js","utf8");
const template=fs.readFileSync("batch-tracker/workspace.html","utf8");
new vm.Script(engine,{filename:"batch-tracker/tracker.js"});
const routes=[
 {domain:"agronomy",url:"batch-tracker/green-tech/",file:"batch-tracker/green-tech/index.html"},
 {domain:"mycology",url:"batch-tracker/mycology/",file:"batch-tracker/mycology/index.html"},
 {domain:"laboratory",url:"batch-tracker/laboratory/",file:"batch-tracker/laboratory/index.html"}
];
for(const r of routes){
 const html=fs.readFileSync(r.file,"utf8");
 if(!html.includes(`window.BA_LABS_DOMAIN = "${r.domain}"`))throw new Error("Wrong domain: "+r.file);
 if(!html.includes('fetch("../workspace.html")')||!html.includes('script.src = "../tracker.js"'))throw new Error("Shared engine missing: "+r.file);
 if(!root.includes(`href="${r.url}"`))throw new Error("Root link missing: "+r.url);
}
if(template.includes('class="domain-switcher"'))throw new Error("Switcher remains inside workspace");
if(!engine.includes("const modulesByDomain")||!engine.includes('domain !== "laboratory"'))throw new Error("Domain module scope missing");
const comparison=fs.readFileSync("batch-tracker/compare-analysis.js","utf8");
new vm.Script(comparison,{filename:"batch-tracker/compare-analysis.js"});
if(!template.includes("Comparer mes lots")||!template.includes("compareLotsButton"))throw new Error("Lot comparison interface missing");
if(!engine.includes('.in("sample_id", sampleChunk)')||!engine.includes('is("event_id", null)'))throw new Error("Direct sample-linked measurement/observation lookup missing");
if(!engine.includes("detectOutliersByBatch"))throw new Error("Outlier detection is not isolated per batch");
if(!engine.includes('window.addEventListener("ba-labs-language-change"'))throw new Error("Comparison does not refresh on language changes");
for(const r of routes){const html=fs.readFileSync(r.file,"utf8");if(!html.includes("../compare-analysis.js"))throw new Error("Comparison analysis loader missing: "+r.file);}
console.log("✓ Lot comparison interface and analysis loader verified");
const css=fs.readFileSync("batch-tracker/tracker.css","utf8");
if(!css.includes("--brand:#a94f1d")||!css.includes("--focus:#a94f1d"))throw new Error("Terracotta palette missing");
if(!root.includes(".universe.myco{--accent:#a94f1d;"))throw new Error("Chooser mycology accent is still fluorescent");
console.log("✓ JavaScript syntax parsed");
console.log("✓ Three fixed-domain entry pages and chooser links verified");
console.log("✓ Shared workspace excludes universe switcher");
console.log("✓ Batch production scoped to Laboratory");
console.log("✓ Mycology terracotta palette verified in workspace and chooser");
