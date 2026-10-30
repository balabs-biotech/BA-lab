import fs from "node:fs";
import vm from "node:vm";
const root=fs.readFileSync("index.html","utf8");
const engine=fs.readFileSync("batch-tracker/tracker.js","utf8");
const template=fs.readFileSync("batch-tracker/workspace.html","utf8");
new vm.Script(engine,{filename:"batch-tracker/tracker.js"});
if (engine.includes("window.BALabsDomainEngine.filterMeasurementVariables")) throw new Error("Tracker calls the domain engine without loading that dependency");
if(!engine.includes('/invalid refresh token|refresh token not found/i')||!engine.includes('auth.signOut({ scope: "local" })')||!engine.includes("La session enregistrée sur cet appareil n’est plus valide"))throw new Error("Invalid local refresh-token recovery is missing");
const routes=[
 {domain:"agronomy",url:"batch-tracker/green-tech/",file:"batch-tracker/green-tech/index.html"},
 {domain:"mycology",url:"batch-tracker/mycology/",file:"batch-tracker/mycology/index.html"},
 {domain:"laboratory",url:"batch-tracker/laboratory/",file:"batch-tracker/laboratory/index.html"}
];
for(const r of routes){
 const html=fs.readFileSync(r.file,"utf8");
 if(!html.includes(`window.BA_LABS_DOMAIN = "${r.domain}"`))throw new Error("Wrong domain: "+r.file);
 if(!/fetch\("\.\.\/workspace\.html(?:\?v=[^"]*)?"\)/.test(html)||!/script\.src = "\.\.\/tracker\.js(?:\?v=[^"]*)?"/.test(html))throw new Error("Shared engine missing: "+r.file);
 if(!root.includes(`href="${r.url}"`))throw new Error("Root link missing: "+r.url);
}
if(template.includes('class="domain-switcher"'))throw new Error("Switcher remains inside workspace");
if(!engine.includes("const modulesByDomain")||!engine.includes('domain !== "laboratory"'))throw new Error("Domain module scope missing");
if(!/if \(document\.body\.dataset\.domain === "agronomy"\) \{[\s\S]*?await loadPlantCultures\(\);[\s\S]*?\}/.test(engine))throw new Error("Non-agronomy workspaces must not depend on plant registry loading during authentication");
const css=fs.readFileSync("batch-tracker/tracker.css","utf8");
const activeCss=css.replace(/\/\*[\s\S]*?\*\//g,"");
for(const obsoleteSelector of [".domain-switcher",".domain-switcher-copy",".domain-overline",".domain-options",".domain-option",".domain-option-icon"]){if(activeCss.includes(obsoleteSelector))throw new Error("Obsolete workspace-switcher CSS remains: "+obsoleteSelector);}
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

if(!template.includes('id="batchEvents"')||!template.includes('id="batchEventList"'))throw new Error("Batch event timeline UI missing");
if(!engine.includes('from("events")')||!engine.includes("renderBatchEventTimeline")||!engine.includes('eq("batch_id", batchId)'))throw new Error("Batch event timeline is not linked to the selected batch");
if(!engine.includes("measurement_recorded")||!engine.includes("batch_stage_advanced")||!engine.includes("batch_released"))throw new Error("Batch timeline omits key workflow event types");
if(!engine.includes("const measurementUnitsByVariable = new Map()")||!engine.includes("unitMismatchCount > 0 ? labels.unitMismatch(unitMismatchCount) : \"\""))throw new Error("Mixed measurement units are not flagged in batch comparison");
for(const label of ["Comparabilité :","Comparability:","Comparabilidade:","قابلية المقارنة:"]){
 if(!engine.includes(label))throw new Error("Mixed-unit warning translation missing: "+label);
}
console.log("✓ Batch comparison warns when a variable uses incompatible/missing units across selected batches");

if(!template.includes('id="harvestQuantity"')||!template.includes('id="harvestUnit"')||!template.includes('id="recordHarvestButton"'))throw new Error("Harvest entry form missing");
if(!engine.includes('function recordBatchHarvest')||!engine.includes('current_stage !== "harvest"')||!engine.includes('rpc("record_batch_harvest"'))throw new Error("Harvest event workflow missing, not RPC-backed, or not restricted to harvest stage");
if(!engine.includes('from("units")')||!engine.includes('p_unit_code: unit.code'))throw new Error("Harvest unit validation or RPC payload missing");
if(engine.slice(engine.indexOf("async function recordBatchHarvest()"), engine.indexOf("\nrecordHarvestButton?.addEventListener")).includes('from("events").insert({'))throw new Error("Harvest handler still inserts events directly");

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
for(const label of ["Culture ou ressource source","Culture biologique / lot de culture générique","Source culture or resource","Cultura ou recurso de origem","المستنبت أو المورد المصدر"]){
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
if(!/\.eq\("organization_id", (?:organizationId|loadOrganizationId)\)\.order\("name"\)/.test(engine))throw new Error("Batch place options are not scoped to the active organization");
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

const comparisonSummaryStart = engine.indexOf("const summarize = rows =>");
const comparisonSummaryEnd = engine.indexOf("batches.forEach(batch =>", comparisonSummaryStart);
const comparisonSummary = engine.slice(comparisonSummaryStart, comparisonSummaryEnd);
if (!comparisonSummary.includes("let min = Infinity") || !comparisonSummary.includes("let max = -Infinity") || comparisonSummary.includes("Math.min(...values)") || comparisonSummary.includes("Math.max(...values)")) {
  throw new Error("Comparison summary must handle large arrays without spread-argument limits");
}
if (!comparisonSummary.includes("!Number.isFinite(Number(value))")) {
  throw new Error("Non-numeric comparison values must be counted explicitly");
}
console.log("✓ Batch comparison summaries handle large datasets and classify non-numeric values");

const comparisonQuartileStart = engine.indexOf("const summarize = rows =>");
const comparisonQuartileEnd = engine.indexOf("batches.forEach(batch =>", comparisonQuartileStart);
const comparisonQuartileSummary = engine.slice(comparisonQuartileStart, comparisonQuartileEnd);
for (const snippet of [
  'median:"médiane"',
  'median:"median"',
  'median:"mediana"',
  'median:"الوسيط"',
  'const median = quantile(0.5)',
  'const q1 = quantile(0.25)',
  'const q3 = quantile(0.75)',
  'labels.quartiles'
]) {
  if (!comparisonQuartileSummary.includes(snippet)) throw new Error("Batch comparison median/quartile summary missing: " + snippet);
}
console.log("✓ Batch comparison reports median and interquartile range with four-language labels");

for (const snippet of [
  'outlierCaution:"à examiner, pas automatiquement erronées"',
  'outliers:"valeurs atypiques (règle IQR)"',
  'outlierCaution:"à examiner, pas automatiquement erronées"',
  'outlierCaution:"review; not automatically erroneous"',
  'outlierCaution:"rever; não são automaticamente erros"',
  'outlierCaution:"تحتاج إلى مراجعة ولا تعني أنها خاطئة تلقائيًا"',
  '(${labels.outlierCaution})',
  'outliers:"valeurs atypiques (règle IQR)"',
  'outliers:"potential outliers (IQR rule)"',
  'outliers:"valores atípicos potenciais (regra IQR)"',
  'outliers:"قيم شاذة محتملة (قاعدة المدى الربيعي)"',
  "const iqr = q3 - q1",
  "values.length >= 4",
  "sorted.filter(value => value < q1 - 1.5 * iqr || value > q3 + 1.5 * iqr).length"
]) {
  if (!comparisonQuartileSummary.includes(snippet) && !comparisonSummary.includes(snippet)) throw new Error("IQR outlier summary missing: " + snippet);
}
console.log("✓ Potential outliers use the 1.5×IQR rule only with at least four numeric measurements");

const plantMigration=fs.readFileSync("supabase/migrations/20261023010136_add_agritech_plant_cultures.sql","utf8");
if(!template.includes('id="plantCultureForm"')||!template.includes('id="plantCard"')||!template.includes('value="tomato_cherry"')||!template.includes('value="tomato"'))throw new Error("AgriTech plant registry form or tomato types are missing");
if(!engine.includes('from("plant_cultures")')||!engine.includes('domain: "agronomy"')||!engine.includes('if (activeDomain === "agronomy") return false;'))throw new Error("AgriTech registry persistence or domain separation is missing");
if(!engine.includes('domain: document.body.dataset.domain === "laboratory" ? "laboratory" : "mycology"'))throw new Error("Biological culture records must retain their originating workspace");
for(const snippet of ["create table if not exists public.plant_cultures","alter table public.plant_cultures enable row level security","private.is_org_member(organization_id)","constraint plant_cultures_org_code_key unique"])if(!plantMigration.includes(snippet))throw new Error("Plant registry migration missing security/constraint: "+snippet);
console.log("✓ AgriTech plant records are separate from mycology/laboratory culture lineages");


if(!root.includes('class="kicker"')||!root.includes('document.querySelector(".kicker").textContent'))throw new Error("Landing-page language switcher references a missing translated kicker");
if(!root.includes('<a class="skip-link" href="#main">')||!root.includes('<main id="main" tabindex="-1">'))throw new Error("Landing page skip link/main target missing");
if(!root.includes('id="pageLanguage"')||!root.includes('value="ar"'))throw new Error("Landing-page multilingual selector missing Arabic option");
console.log("✓ Landing page language switcher target exists; skip navigation and multilingual options are present");

if(!root.includes('"Every biological culture","has its own universe."')||!root.includes('"Cada cultura biológica","tem o seu universo."')||!root.includes('"لكل زراعة","عالمها الخاص."'))throw new Error("Landing-page headline translation is missing a complete phrase");
for(const selector of ['.section-head h2','.intro-note strong','.section-head p','.agronomy .universe-label','.myco .universe-label','.lab .universe-label','.agronomy h3','.myco h3','.lab h3'])if(!root.includes('document.querySelector("'+selector+'").textContent'))throw new Error("Landing-page translated selector missing: "+selector);
for(const label of ["Choose your workspace","Escolha o seu espaço de trabalho","اختر مساحة العمل"])if(!root.includes('"'+label+'"'))throw new Error("Landing-page translated workspace heading missing: "+label);
console.log("✓ English, Portuguese and Arabic landing headlines are grammatical; workspace headings are wired to translation arrays");

const landingCopyMatch=root.match(/const copy = (\{[\s\S]*?\n  \});\n  const select/);
if(!landingCopyMatch)throw new Error("Landing-page translation dictionary cannot be parsed by the audit");
const landingCopy=vm.runInNewContext("("+landingCopyMatch[1]+")");
for(const lang of ["fr","en","pt","ar"])if(!Array.isArray(landingCopy[lang])||landingCopy[lang].length!==20)throw new Error("Landing-page translation array must contain 20 mapped strings: "+lang);
for(const lang of ["fr","en","pt","ar"])for(const index of [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19])if(typeof landingCopy[lang][index]!=="string"||!landingCopy[lang][index].trim())throw new Error("Landing-page translation missing: "+lang+"["+index+"]");
console.log("✓ Landing-page translation dictionaries parse correctly and contain all 20 mapped strings for FR/EN/PT/AR");

const signOutStart=engine.indexOf("async function signOut()");
const authUiStart=engine.indexOf("/* ============================================================\n   AUTH UI",signOutStart);
if(signOutStart<0||authUiStart<0)throw new Error("Could not isolate signOut for session-failure regression guard");
const signOutBlock=engine.slice(signOutStart,authUiStart);
if(!signOutBlock.includes("const { error } = await supabaseClient.auth.signOut()")||!signOutBlock.includes("if (error)")||!signOutBlock.includes("Déconnexion impossible")||!signOutBlock.includes("return;"))throw new Error("Sign-out failure must be surfaced without clearing authenticated state");
if(signOutBlock.indexOf("return;")>signOutBlock.indexOf("organizationId = null"))throw new Error("Sign-out failure return must precede local session-state reset");
console.log("✓ Sign-out checks Supabase's returned error and preserves local state when logout fails");

if(!engine.includes("let authStateRevision = 0;"))throw new Error("Auth revision guard is missing");
const initStart=engine.indexOf("async function initializeAuthenticatedTracker(");
const initEnd=engine.indexOf("function setDefaultDate()",initStart);
if(initStart<0||initEnd<0)throw new Error("Could not isolate authenticated initialization");
const initBlock=engine.slice(initStart,initEnd);
if(!initBlock.includes("const initRevision = revision;")||!initBlock.includes("if (initRevision !== authStateRevision) return;")||!initBlock.includes("if (initRevision !== authStateRevision) {"))throw new Error("Authenticated initialization must reject stale work and reconcile the latest session");
const authListener=engine.slice(engine.indexOf("supabaseClient.auth.onAuthStateChange("),engine.indexOf("async function init()",engine.indexOf("supabaseClient.auth.onAuthStateChange(")));
if(!authListener.includes("authStateRevision += 1;"))throw new Error("Auth-state changes must increment the revision");
console.log("✓ Auth initialization rejects stale session work and refreshes against the latest auth revision");

const refreshStart=engine.indexOf("async function refreshAuthUI(");
const refreshEnd=engine.indexOf("/* ============================================================\n   INITIALISATION AUTHENTIFIEE",refreshStart);
if(refreshStart<0||refreshEnd<0)throw new Error("Could not isolate auth UI refresh");
const refreshBlock=engine.slice(refreshStart,refreshEnd);
if(!refreshBlock.includes("revision = authStateRevision")||!refreshBlock.includes("if (revision !== authStateRevision) return;")||!refreshBlock.includes("session,\n    revision"))throw new Error("Stale auth refresh must be rejected before initialization");
if(!engine.includes("let initializationWarnings = [];")||!engine.includes('initializationWarnings.push("unités")')||!engine.includes('initializationWarnings.push("registre végétal")')||!engine.includes("Chargement partiel"))throw new Error("Partial data-load failures must be reported to the user");
console.log("✓ Auth refreshes are revision-checked and optional data-load failures are surfaced as partial-load warnings");

if(!refreshBlock.includes("catch (error)")||!refreshBlock.includes("Session non vérifiable.")||!refreshBlock.includes("Impossible de vérifier votre session.")||!refreshBlock.includes("Vos données ne sont pas supprimées.")||!refreshBlock.includes("hideElement(trackerCard)"))throw new Error("Auth session verification failures must fail closed and explain the recovery action");
console.log("✓ Unverifiable sessions hide protected workspace content and show a recovery message without claiming data loss");

for (const [fn, button, label] of [
  ["async function saveMeasurement()", "saveMeasurementButton.disabled = true;", "mesure"],
  ["async function saveObservation()", "saveObservationButton.disabled = true;", "observation"]
]) {
  const start = engine.indexOf(fn);
  const next = engine.indexOf("\nasync function ", start + fn.length);
  if (start < 0 || next < 0) throw new Error("Could not isolate " + label + " save handler");
  const block = engine.slice(start, next);
  if (!block.includes("let session;") || !block.includes("catch (error)") || !block.includes("Impossible de vérifier votre session.") || !block.includes("Aucune " + label + " n’a été enregistrée.") || block.indexOf("Impossible de vérifier votre session.") > block.indexOf(button)) {
    throw new Error("Session verification failure must be handled before writing " + label + " data");
  }
}
console.log("✓ Measurement and observation writes handle session-verification failures before enabling the write operation");

for (const [fn, rpc, savedFlag] of [
  ["async function saveMeasurement()", "record_manual_measurement", "measurementSaved"],
  ["async function saveObservation()", "record_manual_observation", "observationSaved"]
]) {
  const start = engine.indexOf(fn);
  const next = engine.indexOf("\nasync function ", start + fn.length);
  const block = engine.slice(start, next);
  if (!block.includes('rpc("' + rpc + '"') ||
      !block.includes(savedFlag + " = true;") ||
      block.includes('.from("events").delete(') ||
      block.includes("eventCleanupFailed")) {
    throw new Error("Atomic save must not attempt separate event cleanup for " + rpc);
  }
}
console.log("✓ Atomic measurement/observation writes no longer perform separate event cleanup");

const forbiddenDirectWrite = engine.match(/\.from\(["'](?:events|measurements|observations)["']\)\s*\.(?:insert|upsert|update|delete)\s*\(/);
if (forbiddenDirectWrite) throw new Error("Audit-sensitive event/measurement/observation writes must go through validated RPCs, not direct table mutations");
console.log("✓ Tracker uses RPC-backed writes for events, measurements and observations");
