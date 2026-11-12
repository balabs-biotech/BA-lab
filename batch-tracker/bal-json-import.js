/* BAL-JSON v1 authenticated import adapter.
 * The browser performs a conservative preview only. The Edge Function and
 * PostgreSQL remain the authoritative schema, authorization and integrity boundary.
 */
(() => {
  "use strict";

  const panel = document.getElementById("balJsonImportPanel");
  const source = document.getElementById("balJsonImportSource");
  const previewButton = document.getElementById("balJsonPreviewButton");
  const importButton = document.getElementById("balJsonImportButton");
  const preview = document.getElementById("balJsonPreview");
  const status = document.getElementById("balJsonImportStatus");

  if (!panel || !source || !previewButton || !importButton || !preview || !status) return;

  const allowedDomains = new Set(["mycology", "laboratory"]);
  const supportedVersion = "1.0.0";
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  let validatedRecord = null;
  let submitting = false;

  panel.hidden = !allowedDomains.has(String(window.BA_LABS_DOMAIN || "").toLowerCase());
  importButton.disabled = true;

  function setStatus(message, state) {
    status.textContent = message;
    status.dataset.state = state;
  }

  function invalidate(message) {
    validatedRecord = null;
    importButton.disabled = true;
    preview.textContent = "";
    setStatus(message, "error");
  }

  function validatePreviewRecord(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Le document doit être un objet JSON.");
    }
    if (value.contract !== "BA-LABS/JSON") throw new Error("Contrat BA-LABS/JSON non reconnu.");
    if (value.contract_version !== supportedVersion) throw new Error("Version BAL-JSON non prise en charge (version attendue : 1.0.0).");
    if (!["measurement", "observation"].includes(value.record_type)) throw new Error("Type d'enregistrement non pris en charge.");
    if (!uuidPattern.test(String(value.record_id || ""))) throw new Error("Identifiant d'enregistrement invalide.");
    if (!uuidPattern.test(String(value.organization_id || ""))) throw new Error("Identifiant d'organisation invalide.");

    const activeOrganization = typeof window.BA_LABS_GET_ORGANIZATION_ID === "function"
      ? window.BA_LABS_GET_ORGANIZATION_ID()
      : null;
    if (!activeOrganization || value.organization_id.toLowerCase() !== String(activeOrganization).toLowerCase()) {
      throw new Error("L'organisation du document ne correspond pas à l'organisation active.");
    }
    if (!value.data || typeof value.data !== "object" || Array.isArray(value.data)) {
      throw new Error("Le bloc data est absent ou invalide.");
    }
    if (!value.data.context || typeof value.data.context !== "object" || Array.isArray(value.data.context)) {
      throw new Error("Le contexte biologique est absent ou invalide.");
    }
    const context = value.data.context;
    if (![context.culture_id, context.plant_culture_id, context.batch_id].some(id => uuidPattern.test(String(id || "")))) {
      throw new Error("Le document doit être relié à une culture ou à un lot.");
    }
    if (typeof value.data.variable_code !== "string" || !value.data.variable_code.trim()) {
      throw new Error("Le code de variable est obligatoire.");
    }
    if (value.record_type === "measurement") {
      if (typeof value.data.raw_value !== "number" || !Number.isFinite(value.data.raw_value)) {
        throw new Error("La valeur numérique de la mesure est invalide.");
      }
      if (typeof value.data.raw_unit_code !== "string" || !value.data.raw_unit_code.trim()) {
        throw new Error("L'unité de la mesure est obligatoire.");
      }
      if (typeof value.data.measured_at !== "string" || Number.isNaN(Date.parse(value.data.measured_at))) {
        throw new Error("La date de mesure est absente ou invalide.");
      }
    } else {
      if (typeof value.data.value_text !== "string" || !value.data.value_text.trim()) {
        throw new Error("Le texte de l'observation est obligatoire.");
      }
      if (typeof value.data.observed_at !== "string" || Number.isNaN(Date.parse(value.data.observed_at))) {
        throw new Error("La date d'observation est absente ou invalide.");
      }
    }
    if (value.data.quality_state !== undefined && value.data.quality_state !== "raw") {
      throw new Error("Seules les données brutes peuvent être importées avec BAL-JSON v1.");
    }
    return value;
  }

  previewButton.addEventListener("click", () => {
    try {
      const parsed = JSON.parse(source.value);
      validatedRecord = validatePreviewRecord(parsed);
      const d = validatedRecord.data;
      const description = validatedRecord.record_type === "measurement"
        ? `Mesure — ${d.variable_code} : ${d.raw_value} ${d.raw_unit_code}`
        : `Observation — ${d.variable_code} : ${d.value_text}`;
      preview.textContent = [
        "Document reconnu : BA-LABS/JSON v1.0.0",
        `Type : ${validatedRecord.record_type}`,
        description,
        `Identifiant : ${validatedRecord.record_id}`,
        `Contexte : ${d.context.culture_id ? "culture" : d.context.plant_culture_id ? "culture végétale" : "lot"}`,
        "La validation définitive sera effectuée par le serveur."
      ].join("\n");
      importButton.disabled = false;
      setStatus("Document valide pour prévisualisation. Import prêt.", "ready");
    } catch (error) {
      invalidate(error instanceof Error ? error.message : "Document JSON invalide.");
    }
  });

  importButton.addEventListener("click", async () => {
    if (!validatedRecord || submitting) return;
    const client = window.BA_LABS_SUPABASE_CLIENT;
    if (!client || !client.functions || typeof client.functions.invoke !== "function") {
      setStatus("Connexion Supabase indisponible. Reconnectez-vous avant l'import.", "error");
      return;
    }
    const activeOrganization = typeof window.BA_LABS_GET_ORGANIZATION_ID === "function"
      ? window.BA_LABS_GET_ORGANIZATION_ID()
      : null;
    if (!activeOrganization || validatedRecord.organization_id.toLowerCase() !== String(activeOrganization).toLowerCase()) {
      invalidate("L'organisation active a changé. Prévisualisez à nouveau le document.");
      return;
    }

    submitting = true;
    importButton.disabled = true;
    previewButton.disabled = true;
    setStatus("Import en cours…", "pending");
    try {
      const { data, error } = await client.functions.invoke("bal-json-ingest", { body: validatedRecord });
      if (error) throw error;
      const resultStatus = data && data.status;
      if (!["inserted", "duplicate"].includes(resultStatus)) {
        throw new Error("Le serveur n'a pas confirmé l'enregistrement.");
      }
      setStatus(resultStatus === "duplicate"
        ? "Ce document avait déjà été enregistré. Aucun doublon créé."
        : "Document enregistré avec succès.", "success");
      if (typeof window.BA_LABS_REFRESH_EXPERIMENTAL_DATA === "function") {
        await window.BA_LABS_REFRESH_EXPERIMENTAL_DATA();
      }
      validatedRecord = null;
      source.value = "";
      preview.textContent = "";
    } catch (error) {
      setStatus(error instanceof Error && error.message
        ? `Import refusé : ${error.message}`
        : "Import impossible. Vérifiez la connexion et réessayez.", "error");
      importButton.disabled = false;
    } finally {
      submitting = false;
      previewButton.disabled = false;
    }
  });
})();
