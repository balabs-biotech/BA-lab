/* BA Labs CultureOps — BAL-JSON v1 import client.
 * Preview is local and non-mutating. Submission requires an explicit action
 * and uses the active Supabase session through the configured client.
 */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const panel = $("balJsonImportPanel");
  const source = $("balJsonImportSource");
  const previewButton = $("balJsonPreviewButton");
  const importButton = $("balJsonImportButton");
  const preview = $("balJsonPreview");
  const status = $("balJsonImportStatus");
  if (!panel || !source || !previewButton || !importButton || !preview || !status) return;

  if (window.BA_LABS_DOMAIN === "agronomy") {
    panel.hidden = true;
    return;
  }

  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const MAX_BYTES = 64_000;
  let reviewedRecord = null;
  let reviewedSource = "";
  let reviewedOrganization = "";

  function setStatus(message, state) {
    status.textContent = message;
    status.dataset.state = state;
  }

  function invalidatePreview() {
    reviewedRecord = null;
    reviewedSource = "";
    reviewedOrganization = "";
    importButton.disabled = true;
  }

  function validatePreview(record) {
    if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error("Le contenu doit être un objet JSON.");
    if (record.contract !== "BA-LABS/JSON") throw new Error("Contrat inconnu : attendu BA-LABS/JSON.");
    if (record.contract_version !== "1.0.0") throw new Error("Version non prise en charge : seule BAL-JSON 1.0.0 est acceptée.");
    if (!["measurement", "observation"].includes(record.record_type)) throw new Error("Type de fiche non pris en charge.");
    if (!UUID.test(String(record.record_id ?? ""))) throw new Error("record_id doit être un UUID valide.");
    if (!UUID.test(String(record.organization_id ?? ""))) throw new Error("organization_id doit être un UUID valide.");
    if (!record.data || typeof record.data !== "object" || Array.isArray(record.data)) throw new Error("Le bloc data est absent ou invalide.");
    if (!record.provenance || typeof record.provenance !== "object" || Array.isArray(record.provenance)) throw new Error("Le bloc provenance est absent ou invalide.");
    if (!record.data.context || typeof record.data.context !== "object") throw new Error("Le contexte biologique est obligatoire.");
    if (!["culture_id", "plant_culture_id", "batch_id"].some((key) => UUID.test(String(record.data.context[key] ?? "")))) {
      throw new Error("Le contexte doit référencer une culture, une culture végétale ou un lot.");
    }
    if (record.data.quality_state && record.data.quality_state !== "raw") {
      throw new Error("L’import accepte uniquement les données brutes (raw).");
    }
    if (record.record_type === "measurement") {
      if (typeof record.data.raw_value !== "number" || !Number.isFinite(record.data.raw_value) || !record.data.raw_unit_code || !record.data.variable_code) {
        throw new Error("Mesure incomplète : variable_code, raw_value et raw_unit_code sont requis.");
      }
    } else if (!record.data.variable_code || typeof record.data.value_text !== "string" || !record.data.value_text.trim()) {
      throw new Error("Observation incomplète : variable_code et value_text sont requis.");
    }

    const activeOrganization = window.BA_LABS_GET_ORGANIZATION_ID?.();
    if (!activeOrganization) throw new Error("Connectez-vous à une organisation avant l’import.");
    if (record.organization_id !== activeOrganization) throw new Error("Cette fiche appartient à une autre organisation. Import bloqué.");
    return record;
  }

  function assessNormalization(record) {
    if (record.record_type !== "measurement") return null;
    const normalizer = window.BALabsNormalizer;
    const catalogue = window.BA_LABS_GET_MEASUREMENT_CATALOGUE?.();
    if (!normalizer?.normalizeMeasurement || !catalogue?.variables || !catalogue?.units) {
      return { status: "blocked", reason: "catalogue_unavailable" };
    }
    const variable = catalogue.variables.find((item) => item.code === record.data.variable_code);
    if (!variable) return { status: "blocked", reason: "unknown_variable" };
    return normalizer.normalizeMeasurement({
      rawValue: record.data.raw_value,
      rawUnitCode: record.data.raw_unit_code,
      variable,
      units: catalogue.units,
    });
  }

  const normalizationMessages = {
    catalogue_unavailable: "Catalogue des unités indisponible : mesure brute conservée.",
    unknown_variable: "Variable absente du catalogue : aucune conversion proposée.",
    unknown_raw_unit: "Unité brute inconnue : aucune conversion proposée.",
    raw_unit_dimension_mismatch: "Dimension de l’unité incompatible avec la variable.",
    canonical_unit_not_configured: "Aucune unité canonique configurée pour cette variable.",
    canonical_unit_missing: "Unité canonique absente du catalogue.",
    canonical_unit_dimension_mismatch: "Dimension de l’unité canonique incompatible.",
    nonlinear_or_offset_conversion_not_enabled: "Conversion avec décalage ou échelle non linéaire non activée.",
    invalid_conversion_factor: "Facteur de conversion invalide dans le catalogue.",
    offset_conversion_not_enabled: "Conversion avec offset non validée.",
    conversion_overflow: "Résultat hors plage numérique.",
  };

  function showPreview(record) {
    const data = record.data;
    const normalization = assessNormalization(record);
    const rows = [
      "Type : " + record.record_type,
      "Identifiant : " + record.record_id,
      "Organisation : " + record.organization_id,
      "Variable : " + data.variable_code,
      record.record_type === "measurement"
        ? "Valeur brute : " + data.raw_value + " " + data.raw_unit_code
        : "Observation : " + data.value_text,
      "Origine : " + record.provenance.source,
      "Révision : " + (record.provenance.review_status ?? "non précisée"),
    ];
    if (normalization) {
      if (normalization.status === "normalized" || normalization.status === "already_canonical") {
        rows.push(
          "Normalisation proposée (non enregistrée) : " +
          normalization.normalizedValue + " " + normalization.normalizedUnitCode
        );
        rows.push("Méthode : " + normalization.method + " · BAL-Normalizer " + normalization.version);
      } else {
        rows.push("Normalisation : non effectuée");
        rows.push("Motif : " + (normalizationMessages[normalization.reason] ?? "Conversion non justifiée par le catalogue."));
      }
      rows.push("La valeur brute reste la référence et sera importée sans modification.");
    }
    preview.textContent = rows.join("\n");
  }

  function parseAndPreview() {
    invalidatePreview();
    const raw = source.value;
    if (!raw.trim()) {
      setStatus("Collez une fiche BAL-JSON avant de lancer l’aperçu.", "error");
      return;
    }
    if (new TextEncoder().encode(raw).byteLength > MAX_BYTES) {
      setStatus("Fiche trop volumineuse : limite de 64 Ko.", "error");
      return;
    }
    try {
      const record = validatePreview(JSON.parse(raw));
      reviewedRecord = record;
      reviewedSource = raw;
      reviewedOrganization = window.BA_LABS_GET_ORGANIZATION_ID();
      showPreview(record);
      importButton.disabled = false;
      setStatus("Aperçu prêt. Vérifiez les informations avant de lancer l’import.", "success");
    } catch (error) {
      preview.textContent = "";
      setStatus(error instanceof Error ? error.message : "Fiche invalide.", "error");
    }
  }

  async function submitImport() {
    if (!reviewedRecord || !reviewedSource) {
      setStatus("Produisez d’abord un aperçu valide.", "error");
      return;
    }
    if (source.value !== reviewedSource) {
      invalidatePreview();
      setStatus("Le contenu a changé depuis l’aperçu. Relancez la vérification.", "error");
      return;
    }
    const client = window.BA_LABS_SUPABASE_CLIENT;
    const activeOrganization = window.BA_LABS_GET_ORGANIZATION_ID?.();
    if (!client?.functions?.invoke || !activeOrganization) {
      invalidatePreview();
      setStatus("Session ou service d’import indisponible. Reconnectez-vous.", "error");
      return;
    }
    if (activeOrganization !== reviewedOrganization || activeOrganization !== reviewedRecord.organization_id) {
      invalidatePreview();
      setStatus("L’organisation active a changé. Relancez l’aperçu.", "error");
      return;
    }

    importButton.disabled = true;
    previewButton.disabled = true;
    setStatus("Transmission et validation par BAL-Core…", "pending");
    try {
      const { data, error } = await client.functions.invoke("bal-json-ingest", { body: reviewedRecord });
      if (error) {
        const context = error.context;
        const code = context?.body?.error ?? context?.error ?? "";
        if (code === "record_id_reused_with_different_payload") {
          throw new Error("Identifiant déjà utilisé avec un contenu différent. Créez un nouvel identifiant de fiche.");
        }
        if (code === "organization_access_denied") throw new Error("Accès refusé pour cette organisation.");
        if (code === "schema_validation_failed") throw new Error("Le schéma complet BAL-JSON a rejeté la fiche.");
        throw new Error("Le serveur n’a pas accepté l’import. Vérifiez la connexion et réessayez.");
      }
      if (data?.status === "inserted") {
        setStatus("Fiche enregistrée dans BAL-Core. Événement : " + (data.event_id ?? "confirmé") + ".", "success");
      } else if (data?.status === "duplicate") {
        setStatus("Cette fiche avait déjà été importée. Aucun doublon créé.", "notice");
      } else {
        throw new Error("Réponse du serveur non reconnue. Vérifiez l’historique avant de réessayer.");
      }
      invalidatePreview();
      if (typeof window.BA_LABS_REFRESH_EXPERIMENTAL_DATA === "function") {
        try {
          await window.BA_LABS_REFRESH_EXPERIMENTAL_DATA();
        } catch (_) {
          setStatus("Fiche enregistrée, mais l’historique n’a pas pu être actualisé. Utilisez Actualiser.", "notice");
        }
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Échec de l’import.", "error");
      importButton.disabled = false;
    } finally {
      previewButton.disabled = false;
    }
  }

  previewButton.addEventListener("click", parseAndPreview);
  importButton.addEventListener("click", submitImport);
  source.addEventListener("input", invalidatePreview);
})();
