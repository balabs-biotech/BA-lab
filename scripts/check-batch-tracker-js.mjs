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
if((comparisonCode.match(/fetchAllComparisonPages\\(supabaseClient\\.from\\("(?:measurements|observations)"\\)/g)||[]).length!==4)throw new Error("Measurements and observations are not fully paginated");
if((comparisonCode.match(/\\.limit\\(1000\\)/g)||[]).length!==0)throw new Error("Batch comparison still has a hard 1,000-row cap");
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
for(const label of ["Chronologie du lot","Enregistrer une récolte","Récolte enregistrée","Batch timeline","Record a harvest","Harvest recorded","Cronologia do lote","Registar uma colheita","Colheita registada","الخط الزمني للدفعة","تسجيل حصاد","تم تسجيل الحصاد"]){
 if(!i18n.includes(label))throw new Error("Harvest timeline translation missing: "+label);
}
for(const label of ["Lot créé","Batch created","Lote criado","تم إنشاء الدفعة","Étape avancée","Stage advanced","Etapa avançada","تم الانتقال إلى المرحلة التالية","Aucun événement enregistré pour ce lot.","No events recorded for this batch.","Nenhum evento registado para este lote.","لا توجد أحداث مسجلة لهذه الدفعة.","Chronologie indisponible : ","Timeline unavailable: ","Cronologia indisponível: ","الخط الزمني غير متاح: "]){
 if(!i18n.includes(label))throw new Error("Dynamic batch timeline localisation missing: "+label);
}
console.log("✓ Harvest entry, timeline labels and feedback are covered in French, English, Portuguese and Arabic");
if(!template.includes('<select id="batchUnit"')||!template.includes('<select id="harvestUnit"'))throw new Error("Batch and harvest quantities must use controlled unit selectors");
if(template.includes('<input\n          id="batchUnit"')||template.includes('<input id="harvestUnit"'))throw new Error("Free-text quantity units remain in the forms");
for(const type of ["CULTURE","TRICHODERMA","PLEUROTUS_SPAWN","MUSHROOM_PRODUCT","BIOSTIMULANT","FORMULATION"]){
 if(!template.includes('value="'+type+'"'))throw new Error("Batch category missing: "+type);
}
if(!engine.includes('async function loadQuantityUnitOptions')||!engine.includes('.from("units")')||!engine.includes('select("code,label,dimension")'))throw new Error("Batch/harvest units are not loaded from the canonical unit catalogue");
if(!engine.includes("quantityPlanned <= 0")||!engine.includes("Choisissez une unité dans le référentiel pour la quantité prévue."))throw new Error("Planned quantity validation does not require a valid unit");
if(!engine.includes("quantityPlanned === null && quantityUnit")||!engine.includes("Saisissez la quantité prévue ou effacez l’unité sélectionnée."))throw new Error("Planned quantity and unit can be recorded inconsistently");
for(const label of ["Choisir une famille de lot…","Mycélium sur grain — Pleurotus","Biostimulant / biofertilisant","Choisir une unité…","Choose a batch category…","Escolha uma categoria de lote…","اختر فئة الدفعة…"]){
 if(!i18n.includes(label))throw new Error("Batch form localisation missing: "+label);
}
if(!template.includes('id="batchCultureHint"')||!template.includes("filiation biologique"))throw new Error("Batch source culture purpose is not explained");
if(!i18n.includes("Ce choix détermine les contrôles qualité associés."))throw new Error("Batch category guidance translation missing");
for(const label of ["Culture ou ressource source","Culture biologique / lot de culture générique","Source culture or resource","Cultura ou recurso de origem","المزرعة أو المورد المصدر"]){
 if(!i18n.includes(label))throw new Error("Batch source guidance localisation missing: "+label);
}
if(!template.includes('id="bioChildCodesField"')||!engine.includes("function setupBioOperationFormGuidance")||!engine.includes('"division_aliquotes"'))throw new Error("Descendant-code field is not restricted to compatible biological operations");
if(!template.includes('min="0.000001"'))throw new Error("Planned batch quantity does not require a positive value");
console.log("✓ Batch types align with QC template keys; planned and harvested quantities use canonical units");

if(!engine.includes("const BATCH_STAGES_BY_TYPE = {")||!engine.includes("function getBatchStages(batchType)"))throw new Error("Batch-specific stage sequences are missing");
for(const type of ["CULTURE","TRICHODERMA","PLEUROTUS_SPAWN","MUSHROOM_PRODUCT","BIOSTIMULANT","FORMULATION"]){
 if(!engine.includes(type+": ["))throw new Error("Batch-specific stage sequence missing: "+type);
}
if(!engine.includes("getBatchStages(batchType)"))throw new Error("Batch creation still sends one universal stage sequence");
if(!engine.includes("const orderedStages = stages.length")||!engine.includes("orderedStages[index]"))throw new Error("Batch stages are not rendered from persisted sequence order");
for(const type of ["TRICHODERMA","PLEUROTUS_SPAWN","MUSHROOM_PRODUCT","BIOSTIMULANT","FORMULATION"]){
 const match=engine.match(new RegExp(type+": \\[([^\\]]+)\\]"));
 if(!match||!match[1].includes('"qc"')||!match[1].includes('"release"'))throw new Error("QC/release stages missing for "+type);
}
console.log("✓ Batch-specific workflows retain QC and release gates; UI follows saved stage order");

if(!template.includes('id="batchLocation"')||!template.includes('id="batchEnvironment"'))throw new Error("Batch location/environment selectors are missing");
if(!engine.includes('from("locations").select("id,code,name")')||!engine.includes('from("environments").select("id,name,location_id")'))throw new Error("Batch place options are not loaded from the existing schema");
if(!engine.includes('.eq("organization_id", organizationId).order("name")'))throw new Error("Batch place options are not scoped to the active organization");
if(!engine.includes('p_location_id:')||!engine.includes('batchLocationInput?.value || null')||!engine.includes('batchEnvironmentInput?.value || null'))throw new Error("Batch creation does not persist the selected location/environment");
for(const label of ["Emplacement (facultatif)","Location (optional)","Localização (opcional)","الموقع (اختياري)","Environnement (facultatif)","Environment (optional)","Ambiente (opcional)","البيئة (اختياري)"]){
 if(!i18n.includes(label))throw new Error("Batch location/environment localisation missing: "+label);
}
console.log("✓ Batch creation supports organization-scoped location and environment selection");
if(!template.includes('id="moveBatchLocation"')||!template.includes('id="moveBatchEnvironment"')||!template.includes('id="moveBatchButton"'))throw new Error("Batch movement controls are missing");
for(const snippet of [
 'rpc("move_batch_to_location"',
 'p_batch_id: selectedBatchId',
 'p_location_id: locationId',
 'p_environment_id: environmentId',
 'p_note: note',
 'prepareMovementControls(batch)',
 'batch_moved: "Déplacement du lot"',
 'event_type === "batch_moved"'
]) if(!engine.includes(snippet))throw new Error("Batch movement UI integration missing: "+snippet);
for(const label of ["Déplacer le lot","Move batch","Mover lote","نقل الدفعة","Enregistrer le déplacement","Save move","Guardar movimentação","حفظ النقل"]){
 if(!i18n.includes(label))throw new Error("Batch movement localisation missing: "+label);
}
console.log("✓ Batch movement calls the atomic RPC and refreshes the traceability timeline");
if(!engine.includes("const hasCurrentAssignment = Boolean(batch?.location_id || batch?.environment_id)"))throw new Error("Assigned batches cannot retain movement controls when destination options are unavailable");
if(!engine.includes("const locationName = batchLocationOptions.find")||!engine.includes("const environmentName = batchEnvironmentOptions.find")||!engine.includes("escapeHtml(locationName)")||!engine.includes("escapeHtml(environmentName)"))throw new Error("Batch detail does not safely display its selected location/environment");


