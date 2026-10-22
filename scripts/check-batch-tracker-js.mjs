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
const css=fs.readFileSync("batch-tracker/tracker.css","utf8");
if(!css.includes("--brand:#a94f1d")||!css.includes("--focus:#a94f1d"))throw new Error("Terracotta palette missing");
if(!root.includes(".universe.myco{--accent:#a94f1d;"))throw new Error("Chooser mycology accent is still fluorescent");
if(!template.includes('id="batchCompareSelect"')||!template.includes('id="batchCompareResults"'))throw new Error("Batch comparison UI missing");
if(!engine.includes("async function compareSelectedBatches")||!engine.includes('from("batch_stages")')||!engine.includes('from("measurements")'))throw new Error("Batch comparison data flow missing");
if(!engine.includes("limite de 1 000 mesures récentes au total"))throw new Error("Batch comparison measurement cap is not disclosed");
console.log("✓ JavaScript syntax parsed");
console.log("✓ Three fixed-domain entry pages and chooser links verified");
console.log("✓ Shared workspace excludes universe switcher");
console.log("✓ Batch production scoped to Laboratory");
console.log("✓ Mycology terracotta palette verified in workspace and chooser");
