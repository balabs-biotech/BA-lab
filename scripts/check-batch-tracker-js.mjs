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
if(!engine.includes('map(batch => batch.environment_id)')||!engine.includes('environmentMeasurementResult')||!engine.includes('row.environment_id === batch.environment_id'))throw new Error("Environment-linked measurements are not included in batch comparison");
if(!engine.includes("Résumé numérique séparé par source")||!engine.includes("${labels.culture} : ${summarize(cultureLinked)} | ${labels.environment} : ${summarize(environmentLinked)}"))throw new Error("Culture and environment summaries are not separated or localised");
if(!engine.includes("row.environment_id === batch.environment_id && !(batch.culture_id && row.culture_id === batch.culture_id)"))throw new Error("Culture-linked measurements may be double-counted as environmental-only data");
if(!engine.includes('from("cultures")')||!engine.includes('select("id,experiment_id,experimental_unit_id")'))throw new Error("Culture experimental context is not loaded");
if(!engine.includes('from("experimental_units")')||!engine.includes('unit_code,replicate_no,treatment_code'))throw new Error("Experimental unit treatment/replicate context is not loaded");
if(!engine.includes('from("experiments")')||!engine.includes('select("id,code,name")'))throw new Error("Experiment metadata is not loaded");
if(!engine.includes("<th>Expérience</th><th>Unité / traitement / répétition</th>"))throw new Error("Experimental context columns are missing from batch comparison");
if(!engine.includes('...units.map(row => row.experiment_id)'))throw new Error("Experiment lookup does not fall back to the experimental unit link");
if(!engine.includes("async function fetchAllComparisonPages")||!engine.includes("queryBuilder.range(from, from + pageSize - 1)"))throw new Error("Batch comparison pagination is missing");
const comparisonStart=engine.indexOf("async function compareSelectedBatches()");
const comparisonEnd=engine.indexOf('document.getElementById("compareBatchesButton")?.addEventListener',comparisonStart);
const comparisonCode=engine.slice(comparisonStart,comparisonEnd);
if((comparisonCode.match(/fetchAllComparisonPages\(supabaseClient\.from\("(?:measurements|observations)"\)/g)||[]).length!==4)throw new Error("Measurements and observations are not fully paginated");
if((comparisonCode.match(/\.limit\(1000\)/g)||[]).length!==0)throw new Error("Batch comparison still has a hard 1,000-row cap");
if(!comparisonCode.includes('.order("measured_at", { ascending: false }).order("id", { ascending: true })')||!comparisonCode.includes('.order("observed_at", { ascending: false }).order("id", { ascending: true })'))throw new Error("Paginated comparison queries lack deterministic ordering");
if(!engine.includes("normalized_value,normalized_unit_code")||!engine.includes("raw_value,raw_unit_code"))throw new Error("Numeric measurement fields missing from comparison");
if(!engine.includes('row.quality_state === "excluded"'))throw new Error("Excluded measurements are not handled explicitly");
if(!engine.includes("min–max")||!engine.includes("values.length"))throw new Error("Descriptive numeric summary missing");
if(!engine.includes("n_mesures=${values.length}"))throw new Error("Numeric summary does not distinguish measurement count from independent replicates");
if(!engine.includes("repeatedUnitCount")||!engine.includes("répétitions indépendantes"))throw new Error("Shared experimental units are not flagged as non-independent replicates");
const i18n=fs.readFileSync("batch-tracker/i18n.js","utf8");
for(const label of ["Résumé numérique par variable","Resumo numérico por variável","ملخص رقمي حسب المتغير"]){
 if(!i18n.includes(label))throw new Error("Comparison heading translation missing: "+label);
}
console.log("✓ JavaScript syntax parsed");
console.log("✓ Three fixed-domain entry pages and chooser links verified");
console.log("✓ Shared workspace excludes universe switcher");
console.log("✓ Batch production scoped to Laboratory");
console.log("✓ Mycology terracotta palette verified in workspace and chooser");
if(!engine.includes('from("observations")')||!engine.includes('value_text,observed_at,quality_state'))throw new Error("Qualitative observations are not loaded");
if(!engine.includes('in("experimental_unit_id", unitIds)'))throw new Error("Unit-linked observations are not loaded");
if(!engine.includes("<th>Observations qualitatives</th>"))throw new Error("Qualitative observation column is missing");
if(!engine.includes("batchObservations.slice(0, 3)"))throw new Error("Observation summary is not bounded");
