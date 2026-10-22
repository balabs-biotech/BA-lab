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
if(!engine.includes("limite de 1 000 mesures récentes par lien culture/environnement"))throw new Error("Batch comparison measurement cap is not disclosed");
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

if(!template.includes('id="batchEvents"')||!template.includes('id="batchEventList"'))throw new Error("Batch event timeline UI missing");
if(!engine.includes('from("events")')||!engine.includes("renderBatchEventTimeline")||!engine.includes('eq("batch_id", batchId)'))throw new Error("Batch event timeline is not linked to the selected batch");
if(!engine.includes("measurement_recorded")||!engine.includes("batch_stage_advanced")||!engine.includes("batch_released"))throw new Error("Batch timeline omits key workflow event types");
if(!engine.includes("const measurementUnitsByVariable = new Map()")||!engine.includes("unitMismatchCount > 0 ? labels.unitMismatch(unitMismatchCount) : \"\""))throw new Error("Mixed measurement units are not flagged in batch comparison");
for(const label of ["Comparabilité :","Comparability:","Comparabilidade:","قابلية المقارنة:"]){
 if(!engine.includes(label))throw new Error("Mixed-unit warning translation missing: "+label);
}
console.log("✓ Batch comparison warns when a variable uses incompatible/missing units across selected batches");

if(!template.includes('id="harvestQuantity"')||!template.includes('id="harvestUnit"')||!template.includes('id="recordHarvestButton"'))throw new Error("Harvest entry form missing");
if(!engine.includes('event_type: "harvest_recorded"')||!engine.includes('function recordBatchHarvest')||!engine.includes('current_stage !== "harvest"'))throw new Error("Harvest event workflow missing or not restricted to harvest stage");
if(!engine.includes('from("units")')||!engine.includes('unit_code: unit.code'))throw new Error("Harvest unit validation missing");

if(!engine.includes("const eventAnchor = selectedBatch.culture_id")||!engine.includes("Ce lot doit être lié à une culture ou à un matériau"))throw new Error("Harvest event biological anchor validation missing");
