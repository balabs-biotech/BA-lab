import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync("batch-tracker/i18n.js", "utf8");
new vm.Script(source, { filename: "batch-tracker/i18n.js" });

for (const required of [
  "function translate(value, lang)",
  "function translateTree(root = document)",
  "attributes: true",
  'attributeFilter: ["placeholder", "title", "aria-label"]',
  "const prefix = normalize(key)"
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
  "Historique partiel : au moins une catégorie atteint sa limite de chargement. Certaines données anciennes peuvent ne pas apparaître ici."
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
  ["en", "Untranslated runtime text", "Untranslated runtime text"]
];
for (const [lang, input, expected] of cases) {
  const actual = translate(input, lang);
  if (actual !== expected) throw new Error(`Translation behaviour failed (${lang}): ${JSON.stringify(input)} => ${JSON.stringify(actual)}; expected ${JSON.stringify(expected)}`);
}
console.log(`✓ translation behaviour valid; ${cases.length} exact, dynamic-prefix, fallback and French-preservation cases passed`);
