/* CultureOps BAL-JSON bridge.
 * The LLM is an offline assistant: this client validates a proposed record,
 * previews it, then submits it through the authenticated Edge Function.
 */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const panel = $("balJsonImportPanel");
  if (!panel) return;
  const domain = window.BA_LABS_DOMAIN;
  if (!["mycology", "laboratory"].includes(domain)) { panel.hidden = true; return; }

  const source = $("balJsonImportSource");
  const previewButton = $("balJsonPreviewButton");
  const importButton = $("balJsonImportButton");
  const preview = $("balJsonPreview");
  const status = $("balJsonImportStatus");
  const promptButton = $("balJsonCopyPromptButton");
  const downloadButton = $("balJsonDownloadPromptButton");
  const schemaButton = $("balJsonCopySchemaButton");
  let approvedRecord = null;
  let approvedOrganization = null;

  const schema = {
    contract: "BA-LABS/JSON",
    contract_version: "1.0.0",
    record_type: "measurement | observation",
    record_id: "UUID unique et stable pour cette proposition",
    organization_id: "UUID de l'organisation CultureOps connectée",
    created_at: "date ISO-8601 UTC",
    data: {
      variable_code: "code exact d'une variable existante",
      context: { culture_id: "UUID culture OU batch_id / plant_culture_id" },
      measurement: {
        raw_value: "number",
        raw_unit_code: "code unité existant",
        measured_at: "date ISO-8601",
        method: "string facultatif",
        instrument: "string facultatif"
      },
      observation: {
        value_text: "description factuelle",
        observed_at: "date ISO-8601",
        method: "string facultatif",
        instrument: "string facultatif"
      },
      metadata: "objet facultatif"
    },
    provenance: {
      source: "ai_assisted",
      model: "nom du LLM ou unknown",
      review_status: "unreviewed"
    }
  };

  function currentOrganization() {
    return typeof window.BA_LABS_GET_ORGANIZATION_ID === "function"
      ? window.BA_LABS_GET_ORGANIZATION_ID() : null;
  }
  function isObject(value) { return !!value && typeof value === "object" && !Array.isArray(value); }
  function uuid(value) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || "")); }
  function fail(message) { approvedRecord = null; approvedOrganization = null; importButton.disabled = true; status.textContent = message; status.dataset.state = "error"; }

  function extractJson(raw) {
    let text = String(raw || "").trim();
    const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (fenced) text = fenced[1];
    const parsed = JSON.parse(text);
    if (!isObject(parsed)) throw new Error("Le JSON doit être un objet unique, pas un tableau.");
    return parsed;
  }

  function validate(record) {
    const org = currentOrganization();
    if (!org || !uuid(org)) throw new Error("Connectez-vous à CultureOps : organisation active introuvable.");
    if (record.contract !== "BA-LABS/JSON" || record.contract_version !== "1.0.0") throw new Error("Contrat incompatible : utilisez BA-LABS/JSON version 1.0.0.");
    if (!uuid(record.record_id)) throw new Error("record_id doit être un UUID valide.");
    if (!uuid(record.organization_id) || record.organization_id !== org) throw new Error("Le JSON ne correspond pas à l’organisation actuellement connectée.");
    if (!["measurement", "observation"].includes(record.record_type)) throw new Error("record_type doit être measurement ou observation.");
    if (!record.created_at || Number.isNaN(Date.parse(record.created_at))) throw new Error("created_at doit être une date ISO-8601 valide.");
    if (!isObject(record.data) || !isObject(record.data.context)) throw new Error("data et data.context sont obligatoires.");
    const context = record.data.context;
    if (![context.culture_id, context.plant_culture_id, context.batch_id].some(uuid)) throw new Error("Ajoutez un culture_id, plant_culture_id ou batch_id valide dans data.context.");
    if (!/^[a-z0-9][a-z0-9_]{1,79}$/i.test(String(record.data.variable_code || ""))) throw new Error("variable_code est obligatoire et doit être un code, pas un libellé.");
    if (!isObject(record.provenance) || record.provenance.review_status !== "unreviewed") throw new Error("provenance.review_status doit rester unreviewed : l’IA ne peut pas valider une observation.");
    if (record.record_type === "measurement") {
      if (typeof record.data.raw_value !== "number" || !Number.isFinite(record.data.raw_value)) throw new Error("raw_value doit être un nombre fini.");
      if (!record.data.raw_unit_code || !record.data.measured_at || Number.isNaN(Date.parse(record.data.measured_at))) throw new Error("raw_unit_code et measured_at sont obligatoires.");
    } else {
      if (typeof record.data.value_text !== "string" || !record.data.value_text.trim()) throw new Error("value_text doit contenir une observation factuelle.");
      if (!record.data.observed_at || Number.isNaN(Date.parse(record.data.observed_at))) throw new Error("observed_at doit être une date ISO-8601 valide.");
    }
    return org;
  }

  function buildPrompt() {
    const workspace = domain === "mycology" ? "MYCOLOGY — souches, lignées, générations, morphologie, repiquages, incubation et fructification" : "LABORATORY — géloses, cultures liquides, grain, micropropagation, milieux, lots et opérations de laboratoire";
    return `# BA Labs CultureOps — assistant de structuration BAL-JSON

Organisation active CultureOps : ${currentOrganization() || "NON CONNECTÉ — demander le UUID à l’utilisateur"}.\n\nTu aides à transformer des notes expérimentales en données structurées pour CultureOps.
Espace actif : ${workspace}.

## Règles impératives
- Tu n'as aucun accès à la base CultureOps et tu ne dois jamais prétendre avoir enregistré une donnée.
- N'invente jamais une souche, un identifiant UUID, un code de variable, une unité, une date, une valeur ou un lien de filiation.
- Sépare strictement observation factuelle, interprétation et hypothèse. N'enregistre dans value_text que les faits explicitement rapportés.
- Si une information obligatoire manque, pose une question au lieu de fabriquer une valeur.
- Le record doit rester non vérifié : provenance.review_status = "unreviewed".
- Retourne un seul objet JSON valide, sans Markdown, sans commentaire et sans texte autour.
- N'utilise que record_type "measurement" ou "observation". Une mesure doit avoir une valeur numérique et une unité explicite. Une observation qualitative va dans value_text.
- Ne crée pas de statut QC, de diagnostic biologique définitif ni de recommandation opérationnelle comme s'il s'agissait d'un résultat observé.

## Contrat de sortie
${JSON.stringify(schema, null, 2)}

## Identifiants de contexte
Utilise exactement les UUID fournis par l'utilisateur pour organization_id et un seul ancrage valide dans data.context (culture_id, batch_id ou plant_culture_id). Si l'un manque, demande-le. record_id doit être un UUID généré une seule fois pour cette proposition et conservé lors des nouvelles tentatives du même enregistrement.

## Exemple de forme — observation
{
  "contract": "BA-LABS/JSON",
  "contract_version": "1.0.0",
  "record_type": "observation",
  "record_id": "d0d0d0d0-0000-4000-8000-000000000001",
  "organization_id": "<UUID_ORGANISATION_FOURNI>",
  "created_at": "2026-11-26T12:00:00.000Z",
  "data": {
    "variable_code": "<CODE_VARIABLE_EXISTANT>",
    "value_text": "Description strictement factuelle fournie dans les notes.",
    "observed_at": "2026-11-26T12:00:00.000Z",
    "context": { "culture_id": "<UUID_CULTURE_FOURNI>" },
    "metadata": {}
  },
  "provenance": { "source": "ai_assisted", "model": "<NOM_MODELE>", "review_status": "unreviewed" }
}

Demande maintenant les informations manquantes, puis produis l'objet BAL-JSON.`;
  }

  async function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    const area = document.createElement("textarea");
    area.value = text; area.style.position = "fixed"; area.style.opacity = "0";
    document.body.appendChild(area); area.select();
    const ok = document.execCommand("copy"); area.remove();
    if (!ok) throw new Error("Copie impossible sur cet appareil.");
  }

  promptButton.addEventListener("click", async () => {
    try { await copyText(buildPrompt()); status.textContent = "Prompt CultureOps copié. Collez-le dans votre LLM généraliste."; status.dataset.state = "success"; }
    catch (error) { status.textContent = error.message; status.dataset.state = "error"; }
  });
  downloadButton.addEventListener("click", () => {
    const blob = new Blob([buildPrompt()], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a");
    link.href = url; link.download = "BA-Labs-CultureOps-prompt-BAL-JSON.md";
    document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
    status.textContent = "Prompt téléchargé au format Markdown."; status.dataset.state = "success";
  });
  schemaButton.addEventListener("click", async () => {
    try { await copyText(JSON.stringify(schema, null, 2)); status.textContent = "Contrat BAL-JSON copié."; status.dataset.state = "success"; }
    catch (error) { status.textContent = error.message; status.dataset.state = "error"; }
  });

  previewButton.addEventListener("click", () => {
    try {
      const record = extractJson(source.value);
      const org = validate(record);
      approvedRecord = record; approvedOrganization = org; importButton.disabled = false;
      const context = record.data.context;
      preview.textContent = [
        "Contrat : " + record.contract + " v" + record.contract_version,
        "Type : " + record.record_type,
        "Variable : " + record.data.variable_code,
        "Contexte : " + (context.culture_id ? "culture " + context.culture_id : context.batch_id ? "lot " + context.batch_id : "culture végétale " + context.plant_culture_id),
        "Provenance : " + (record.provenance.model || "modèle non précisé") + " — non vérifié",
        "Aperçu : " + (record.record_type === "measurement" ? record.data.raw_value + " " + record.data.raw_unit_code : record.data.value_text)
      ].join("\n");
      status.textContent = "JSON valide et prêt pour vérification serveur. Les références, variables et unités seront revérifiées avant écriture.";
      status.dataset.state = "success";
    } catch (error) { fail(error.message || "JSON invalide."); preview.textContent = "Aucun aperçu : corrigez le JSON."; }
  });

  importButton.addEventListener("click", async () => {
    if (!approvedRecord || !approvedOrganization || approvedOrganization !== currentOrganization()) {
      fail("La session ou l’organisation a changé. Relancez la prévisualisation."); return;
    }
    importButton.disabled = true; previewButton.disabled = true;
    status.textContent = "Validation serveur et import atomique en cours…"; status.dataset.state = "pending";
    try {
      const client = window.BA_LABS_SUPABASE_CLIENT;
      if (!client?.functions?.invoke) throw new Error("Client Supabase authentifié indisponible.");
      const { data, error } = await client.functions.invoke("bal-json-ingest", { body: approvedRecord });
      if (error) throw new Error(error.message || "Le serveur a refusé l’import.");
      if (data?.error) throw new Error(data.message || data.error);
      status.textContent = data?.status === "duplicate"
        ? "Ce record était déjà enregistré : aucun doublon créé."
        : "Record importé et enregistré dans CultureOps. Il reste non vérifié et doit être contrôlé dans l’historique.";
      status.dataset.state = "success"; approvedRecord = null; approvedOrganization = null;
      if (typeof window.BA_LABS_REFRESH_EXPERIMENTAL_DATA === "function") await window.BA_LABS_REFRESH_EXPERIMENTAL_DATA();
    } catch (error) {
      status.textContent = "Import non effectué : " + (error.message || "erreur inconnue");
      status.dataset.state = "error"; importButton.disabled = false;
    } finally { previewButton.disabled = false; }
  });

  source.addEventListener("input", () => {
    approvedRecord = null; approvedOrganization = null; importButton.disabled = true;
  });
})();
