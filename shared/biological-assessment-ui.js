/* BA Labs Biological Assessment UI v0.1.0
 * Explicit user-triggered assessment and read-only history display.
 */
(function () {
  "use strict";
  const supported = ["mycology", "laboratory"];
  const domain = document.body && document.body.dataset.domain;
  if (!supported.includes(domain)) return;
  const historyRoot = () => document.getElementById("measurementHistory");
  const client = () => window.BA_LABS_SUPABASE_CLIENT;
  const organizationId = () => window.BA_LABS_GET_ORGANIZATION_ID && window.BA_LABS_GET_ORGANIZATION_ID();
  const store = () => window.BALabsBiologicalAssessmentStore;

  function statusLabel(status) {
    return ({
      normal: "Dans la plage de la règle examinée",
      out_of_range: "Hors de la plage de la règle examinée",
      insufficient_context: "Contexte insuffisant",
      not_assessed: "Non évalué",
      no_matching_rule: "Aucune règle applicable",
      ambiguous_rule: "Plusieurs règles candidates",
    })[status] || status || "État inconnu";
  }

  function renderRecords(records) {
    const root = historyRoot();
    if (!root) return;
    const groups = new Map();
    for (const record of records) {
      if (!groups.has(record.source_measurement_id)) groups.set(record.source_measurement_id, []);
      groups.get(record.source_measurement_id).push(record);
    }
    for (const [measurementId, rows] of groups) {
      const host = root.querySelector('[data-assessment-history="' + CSS.escape(measurementId) + '"]');
      if (!host) continue;
      host.replaceChildren();
      const title = document.createElement("strong");
      title.textContent = "Historique des évaluations";
      host.appendChild(title);
      for (const row of rows.slice(0, 5)) {
        const item = document.createElement("div");
        item.className = "biological-assessment-record status-" + row.status;
        const heading = document.createElement("strong");
        heading.textContent = statusLabel(row.status);
        const details = document.createElement("div");
        details.className = "measurement-meta";
        const stamp = row.assessed_at ? new Date(row.assessed_at).toLocaleString() : "Date inconnue";
        details.textContent = stamp + " · " + row.reason + " · moteur " + row.engine_version;
        const provenance = document.createElement("div");
        provenance.className = "measurement-meta";
        provenance.textContent = "Calcul client · non recalculé côté serveur";
        item.append(heading, details, provenance);
        host.appendChild(item);
      }
    }
  }

  async function loadVisibleHistory() {
    const root = historyRoot();
    const api = store();
    const org = organizationId();
    if (!root || !api || typeof api.loadHistoryBatch !== "function" || !org) return;
    const ids = [...root.querySelectorAll("[data-assessment-history]")].map(node => node.dataset.assessmentHistory);
    if (!ids.length) return;
    const result = await api.loadHistoryBatch({ client: client(), organizationId: org, measurementIds: ids });
    if (organizationId() !== org || result.status !== "loaded") return;
    renderRecords(result.records);
  }

  async function handleClick(event) {
    const button = event.target.closest("[data-biological-assess]");
    if (!button || !historyRoot()?.contains(button)) return;
    const assessment = window.BA_LABS_ASSESS_AND_RECORD_BIOLOGICAL_MEASUREMENT;
    if (typeof assessment !== "function") {
      button.textContent = "Moteur indisponible";
      return;
    }
    const measurementId = button.dataset.biologicalAssess;
    if (!button.dataset.assessmentIdempotencyKey) {
      if (!window.crypto || typeof window.crypto.randomUUID !== "function") {
        button.textContent = "Identifiant sécurisé indisponible";
        return;
      }
      button.dataset.assessmentIdempotencyKey = window.crypto.randomUUID();
    }
    const idempotencyKey = button.dataset.assessmentIdempotencyKey;
    const orgAtStart = organizationId();
    button.disabled = true;
    button.textContent = "Évaluation en cours…";
    try {
      const output = await assessment({ measurementId, idempotencyKey });
      // A workspace switch during the request must not update the newly active tenant's UI.
      if (organizationId() !== orgAtStart) return;
      if (output && output.status === "recorded") {
        delete button.dataset.assessmentIdempotencyKey;
        button.disabled = false;
        button.textContent = "Nouvelle évaluation";
        await loadVisibleHistory();
      } else {
        button.disabled = false;
        button.textContent = "Réessayer l’évaluation";
        const host = historyRoot()?.querySelector('[data-assessment-history="' + CSS.escape(measurementId) + '"]');
        if (host) host.textContent = "Évaluation non enregistrée : " + ((output && (output.reason || output.status)) || "réponse invalide");
      }
    } catch (error) {
      // Keep the same idempotency key: a network failure may happen after the RPC committed.
      if (organizationId() !== orgAtStart) return;
      button.disabled = false;
      button.textContent = "Réessayer l’évaluation";
      const host = historyRoot()?.querySelector('[data-assessment-history="' + CSS.escape(measurementId) + '"]');
      if (host) host.textContent = "Évaluation non enregistrée : erreur de communication. Réessayer conserve la même clé d’idempotence.";
    }
  }

  function initialize() {
    const root = historyRoot();
    if (!root) return;
    if (root.dataset.biologicalAssessmentUi !== "ready") {
      root.dataset.biologicalAssessmentUi = "ready";
      root.addEventListener("click", handleClick);
    }
    loadVisibleHistory().catch(() => {});
  }

  window.addEventListener("ba-labs-measurements-rendered", initialize);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();
})();
