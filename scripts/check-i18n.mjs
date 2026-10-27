import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync("batch-tracker/i18n.js", "utf8");
new vm.Script(source, { filename: "batch-tracker/i18n.js" });

for (const required of [
  "function translate(value, lang)",
  "function translateTree(root = document)",
  "attributes: true",
  'attributeFilter: ["placeholder", "title", "aria-label"]',
  "const prefix = normalize(key)",
  "if (root.nodeType === 1) elements.push(root)",
  'elements.push(...root.querySelectorAll("*"))'
]) {
  if (!source.includes(required)) {
    throw new Error(`Missing localisation behaviour: ${required}`);
  }
}

const match = source.match(/const supplementalCoverage = (\[[\s\S]*?\]);\s*for \(const \[fr, en, pt, ar\] of supplementalCoverage\)/);
if (!match) throw new Error("Supplemental translation table is missing or malformed");
const rows = JSON.parse(match[1]);
if (rows.length < 60) throw new Error(`Expected at least 60 operational translation rows, found ${rows.length}`);

const seen = new Set();
for (const [index, row] of rows.entries()) {
  if (!Array.isArray(row) || row.length !== 4 || row.some(value => typeof value !== "string" || !value.trim())) {
    throw new Error(`Invalid translation row at index ${index}`);
  }
  if (seen.has(row[0])) throw new Error(`Duplicate French source string: ${row[0]}`);
  seen.add(row[0]);
}
for (const required of [
  "Votre session a expiré.",
  "L’enregistrement de la mesure a échoué.",
  "L’enregistrement de l’observation a échoué.",
  "Historique partiel : au moins une catégorie atteint sa limite de chargement. Certaines données anciennes peuvent ne pas apparaître ici.",
  "Entrez une adresse email.",
  "Erreur connexion:",
  "Session non vérifiable.",
  "Synchronisation Notion en cours...",
  "Entrez un code de batch.",
  "Aucune mesure numérique exploitable",
  "Culture linked by ID",
  "Cultures végétales",
  "Activité récente",
  "Les informations saisies dans CultureOps sont enregistrées dans la base de données BA Labs afin d’assurer la traçabilité des cultures, des générations et des lots. L’accès à l’application nécessite l’acceptation des conditions d’utilisation.",
  "Impossible de vérifier votre session. Vérifiez la connexion puis réessayez. Aucune mesure n’a été enregistrée.",
  "Vérification de session avant observation impossible: "
]) {
  if (!seen.has(required)) throw new Error(`Missing critical translation: ${required}`);
}

console.log(`✓ i18n.js syntax valid; ${rows.length} supplemental entries have French, English, Portuguese and Arabic values`);
const testableSource = source.replace(
  /  if \(document\.readyState === "loading"\)[\s\S]*?\n  window\.BALabsI18n = \{ setLanguage, get language\(\) \{ return currentLanguage; \} \};\n\}\)\(\);\s*$/,
  "  window.__testTranslate = translate;\n})();"
);
if (testableSource === source) throw new Error("Could not isolate the translation function for behaviour tests");
const testWindow = {};
vm.runInNewContext(testableSource, {
  window: testWindow,
  document: {},
  localStorage: { getItem: () => null, setItem: () => {} }
});
const translate = testWindow.__testTranslate;
const cases = [
  ["en", "Démarrage : 2026-10-22", "Started: 2026-10-22"],
  ["pt", "Démarrage : 2026-10-22", "Início: 2026-10-22"],
  ["ar", "Démarrage : 2026-10-22", "تاريخ البدء: 2026-10-22"],
  ["en", "Ajouter une observation à CULT-001", "Add an observation to CULT-001"],
  ["pt", "Ajouter une mesure à CULT-002", "Adicionar uma medição a CULT-002"],
  ["ar", "Ajouter une mesure à CULT-002", "إضافة قياس إلى CULT-002"],
  ["en", "Votre session a expiré.", "Your session has expired."],
  ["fr", "Démarrage : 2026-10-22", "Démarrage : 2026-10-22"],
  ["en", "Untranslated runtime text", "Untranslated runtime text"],
  ["en", "Suivi environnemental", "Environmental monitoring"],
  ["pt", "Analyse agronomique", "Análise agronómica"],
  ["ar", "Analyse mycologique", "التحليل الفطري"],
  ["en", "Serre, substrats, irrigation, climat et croissance.", "Greenhouse, substrates, irrigation, climate, and growth."],
  ["pt", "Souches", "Estirpes"],
  ["ar", "Contamination", "التلوث"],
  ["en", "supervision agronomique", "agronomic monitoring"],
  ["pt", "LAB / EXPERIMENT TRACKING", "LAB / ACOMPANHAMENTO EXPERIMENTAL"],
  ["ar", "Culture", "المستنبت"],
  ["ar", "Cultures", "المستنبتات"],
  ["ar", "Culture biologique / culture de laboratoire", "مستنبت بيولوجي / مستنبت مخبري"],
  ["ar", "Libération", "اعتماد"],
  ["en", "Erreur connexion: Invalid login credentials", "Sign-in error: Invalid login credentials"],
  ["pt", "Erreur connexion: credenciais inválidas", "Erro ao iniciar sessão: credenciais inválidas"],
  ["ar", "Erreur connexion: بيانات غير صحيحة", "خطأ تسجيل الدخول: بيانات غير صحيحة"],
  ["en", "Synchronisation Notion en cours...", "Notion sync in progress..."],
  ["en", "  Cultures végétales  ", "  Plant records  "],
  ["pt", "Cultures végétales", "Registos vegetais"],
  ["ar", "Cultures végétales", "سجلات النباتات"],
  ["en", "Impossible de vérifier votre session. Vérifiez la connexion puis réessayez. Aucune mesure n’a été enregistrée.", "Could not verify your session. Check your connection and try again. No measurement was saved."],
  ["pt", "Vérification de session avant observation impossible: timeout", "Não foi possível verificar a sessão antes da observação: timeout"]
];
for (const [lang, input, expected] of cases) {
  const actual = translate(input, lang);
  if (actual !== expected) throw new Error(`Translation behaviour failed (${lang}): ${JSON.stringify(input)} => ${JSON.stringify(actual)}; expected ${JSON.stringify(expected)}`);
}
console.log(`✓ translation behaviour valid; ${cases.length} exact, dynamic-prefix, fallback and French-preservation cases passed`);


const themeCss = fs.readFileSync("batch-tracker/tracker.css", "utf8");
const requiredThemeRules = [
  "body[data-domain=\"agronomy\"] {",
  "body[data-domain=\"mycology\"] {",
  "body[data-domain=\"laboratory\"] {",
  "background: #a9d68f !important;",
  "color: #142017 !important;",
  "background: #a94f1d !important;",
  "color: #fff7ed !important;",
  "background: #215b91 !important;",
  "color: #ffffff !important;",
  "body[data-domain=\"agronomy\"] .secondary-button",
  "body[data-domain=\"mycology\"] .secondary-button",
  "body[data-domain=\"laboratory\"] .secondary-button",
  "button:not(.overview-shortcut):not(.quick-capture-tile):not(.statistics-filter-action):not(.secondary)",
  ":not(.secondary-button):not(.danger-button)"
];
for (const rule of requiredThemeRules) {
  if (!themeCss.includes(rule)) throw new Error(`Missing audited theme rule: ${rule}`);
}

function relativeLuminance(hex) {
  const channels = hex.replace("#", "").match(/.{2}/g).map(value => parseInt(value, 16) / 255);
  const linear = channels.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}
function contrastRatio(foreground, background) {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
const contrastPairs = [
  ["Green Tech primary action", "#142017", "#a9d68f"],
  ["Green Tech secondary action", "#f1f5ef", "#36473b"],
  ["Mycology primary action", "#fff7ed", "#a94f1d"],
  ["Mycology secondary action", "#fff7ed", "#69422f"],
  ["Laboratory primary action", "#ffffff", "#215b91"],
  ["Laboratory secondary action", "#ffffff", "#35546f"],
  ["Mycology muted text", "#755b4c", "#f7f1e9"],
  ["Laboratory muted text", "#476078", "#edf3f8"],
  ["Green Tech muted text", "#b1bfb2", "#101714"]
];
for (const [label, foreground, background] of contrastPairs) {
  const ratio = contrastRatio(foreground, background);
  if (ratio < 4.5) throw new Error(`WCAG AA contrast failure for ${label}: ${ratio.toFixed(2)}:1`);
}
console.log(`✓ workspace contrast audit passed; ${contrastPairs.length} text/background pairs meet WCAG AA (4.5:1)`);
