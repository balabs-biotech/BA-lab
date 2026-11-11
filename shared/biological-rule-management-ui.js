/* BA Labs Biological Rule Management UI v0.1.0
 * Tenant-scoped rule lifecycle interface. Database RLS/trigger remain authoritative.
 */
(function () {
  "use strict";
  const DOMAIN = document.body.dataset.domain;
  if (!["mycology", "laboratory"].includes(DOMAIN)) return;

  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);

  function init() {
    if (document.getElementById("biologicalRuleManager")) return;
    const anchor = document.getElementById("resultCard");
    if (!anchor || !anchor.parentNode) return;
    const section = document.createElement("section");
    section.id = "biologicalRuleManager";
    section.className = "card biological-rule-manager";
    section.innerHTML = `
      <div class="section-kicker"><span>MODULE SCIENTIFIQUE</span><span class="kicker-line"></span><span>GOUVERNANCE DES RÈGLES</span></div>
      <div class="rule-manager-heading"><div><h2>Règles biologiques</h2><p class="muted">Référentiel versionné. Seules les règles examinées peuvent alimenter le moteur d’interprétation.</p></div><button type="button" id="ruleRefresh" class="secondary-button small-button">Actualiser</button></div>
      <div id="ruleManagerStatus" class="info" role="status" aria-live="polite">Connectez-vous pour charger les règles de cet espace.</div>
      <details class="rule-create">
        <summary>Créer une nouvelle règle (brouillon)</summary>
        <p class="muted">Les seuils doivent provenir d’une source vérifiable. Aucun seuil biologique n’est prérempli.</p>
        <form id="ruleCreateForm">
          <div class="grid">
            <div><label for="ruleId">Identifiant stable</label><input id="ruleId" maxlength="120" required placeholder="mycology.temperature.pleurotus"></div>
            <div><label for="ruleVersion">Version</label><input id="ruleVersion" maxlength="40" required value="1.0.0"></div>
            <div><label for="ruleVariable">Paramètre</label><select id="ruleVariable" required><option value="">Chargement du catalogue…</option></select></div>
            <div><label for="ruleUnit">Unité</label><select id="ruleUnit" required><option value="">Choisir le paramètre d’abord</option></select></div>
            <div><label for="ruleMin">Borne minimale</label><input id="ruleMin" type="number" step="any" required></div>
            <div><label for="ruleMax">Borne maximale</label><input id="ruleMax" type="number" step="any" required></div>
            <div><label for="ruleTaxon">Code taxonomique (facultatif si souche renseignée)</label><input id="ruleTaxon" maxlength="120" placeholder="ncbi:..."></div>
            <div><label for="ruleStrain">Code exact de souche (facultatif si taxon renseigné)</label><input id="ruleStrain" maxlength="120" placeholder="P80"></div>
            <div><label for="ruleStage">Stade de croissance (facultatif)</label><input id="ruleStage" maxlength="120" placeholder="fructification"></div>
            <div><label for="ruleSourceType">Type de source</label><select id="ruleSourceType" required><option value="publication">Publication scientifique</option><option value="standard">Norme</option><option value="validated_internal_protocol">Protocole interne validé</option><option value="dataset">Jeu de données</option><option value="expert_review">Expertise documentée</option></select></div>
          </div>
          <label for="ruleCitation">Référence complète / citation</label><textarea id="ruleCitation" rows="3" maxlength="2000" required placeholder="Auteurs, titre, revue ou organisme, année, DOI ou URL…"></textarea>
          <button type="submit">Enregistrer le brouillon</button>
        </form>
      </details>
      <div class="rule-history-heading"><h3>Historique des versions</h3><span class="muted">200 dernières révisions maximum</span></div>
      <div id="ruleHistory" class="rule-history"><p class="muted">Aucune liste chargée.</p></div>`;
    anchor.parentNode.insertBefore(section, anchor);

    const $ = (id) => section.querySelector("#" + id);
    const status = (message, kind = "") => {
      $("ruleManagerStatus").textContent = message;
      $("ruleManagerStatus").className = "info" + (kind ? " " + kind : "");
    };
    const client = () => window.BA_LABS_SUPABASE_CLIENT;
    const organizationId = () => window.BA_LABS_GET_ORGANIZATION_ID?.();
    const domain = DOMAIN;

    function populateCatalogue() {
      const catalogue = window.BA_LABS_GET_MEASUREMENT_CATALOGUE?.();
      const vars = Array.isArray(catalogue?.variables) ? catalogue.variables : [];
      const units = Array.isArray(catalogue?.units) ? catalogue.units : [];
      const visibleCodes = new Set(Array.from(document.querySelectorAll("#measurementVariable option")).map(o => o.value).filter(Boolean));
      const relevant = vars.filter(v => !visibleCodes.size || visibleCodes.has(v.code));
      $("ruleVariable").innerHTML = '<option value="">Sélectionner…</option>' + relevant.map(v => `<option value="${esc(v.code)}" data-dimension="${esc(v.dimension)}">${esc(v.label)} · ${esc(v.code)}</option>`).join("");
      $("ruleVariable").addEventListener("change", () => {
        const selected = vars.find(v => v.code === $("ruleVariable").value);
        const matching = units.filter(u => selected && u.dimension === selected.dimension);
        $("ruleUnit").innerHTML = '<option value="">Sélectionner…</option>' + matching.map(u => `<option value="${esc(u.code)}">${esc(u.label)} · ${esc(u.code)}</option>`).join("");
      });
      if (!relevant.length) status("Catalogue de variables indisponible ou non chargé. Réessayez après le chargement des données.", "warning");
    }

    async function refresh() {
      const org = organizationId();
      const store = window.BALabsBiologicalRuleStore;
      if (!org || !client() || !store?.loadRuleHistory) {
        status("Session ou organisation indisponible. Connectez-vous puis actualisez.", "warning");
        return;
      }
      status("Chargement de l’historique des règles…");
      const result = await store.loadRuleHistory({ client: client(), organizationId: org, domain });
      if (organizationId() !== org) return status("Espace modifié pendant le chargement. Actualisez.", "warning");
      if (result.status !== "loaded") return status("Historique indisponible : " + result.reason, "error");
      renderHistory(result.records);
      status(result.records.length + " version(s) chargée(s) pour " + domain + ". Les règles restent limitées à votre organisation.", "success");
    }

    function renderHistory(records) {
      const host = $("ruleHistory");
      if (!records.length) { host.innerHTML = '<p class="muted">Aucune règle enregistrée dans cet espace.</p>'; return; }
      host.innerHTML = records.map((row, index) => {
        const r = row.rule;
        const target = [r.target?.taxon_code, r.target?.strain_code, r.target?.growth_stage].filter(Boolean).join(" · ");
        const review = row.reviewed_by ? " · examinateur " + row.reviewed_by : "";
        const actions = row.status === "draft"
          ? `<button type="button" class="small-button" data-action="review" data-index="${index}">Examiner et publier</button>`
          : row.status === "reviewed"
            ? `<div class="rule-retire"><label for="retire-${index}">Nouvelle version de retrait</label><input id="retire-${index}" data-version-input="${index}" maxlength="40" placeholder="2.0.0"><button type="button" class="small-button secondary-button" data-action="retire" data-index="${index}">Retirer cette règle</button></div>`
            : '<span class="muted">Version retirée — non exécutable</span>';
        return `<article class="rule-record"><div class="rule-record-top"><strong>${esc(row.rule_id)}</strong><span class="rule-status status-${esc(row.status)}">${esc(row.status)}</span></div><div class="muted">v${esc(row.version)} · ${esc(row.variable_code)} / ${esc(row.unit_code)}</div><p>Intervalle enregistré : <strong>${esc(r.min)} à ${esc(r.max)}</strong></p><p class="muted">Cible : ${esc(target || "non spécifiée")}${esc(review)}</p><p class="muted">Source : ${esc(r.sources?.[0]?.citation || "non renseignée")}</p>${actions}</article>`;
      }).join("");
      host.querySelectorAll("button[data-action]").forEach(button => button.addEventListener("click", async () => {
        const row = records[Number(button.dataset.index)];
        if (!row) return;
        button.disabled = true;
        try {
          let result;
          if (button.dataset.action === "review") {
            const note = window.prompt("Note d’examen (facultative) :") || "";
            result = await window.BA_LABS_REVIEW_BIOLOGICAL_RULE_DRAFT({ ruleId: row.rule_id, version: row.version, reviewNote: note });
          } else {
            const version = host.querySelector('[data-version-input="' + button.dataset.index + '"]')?.value?.trim();
            if (!version) { status("Saisissez un identifiant de nouvelle version pour le retrait.", "warning"); button.disabled = false; return; }
            if (!window.confirm("Créer une nouvelle version retirée ? La version examinée restera immuable.")) { button.disabled = false; return; }
            result = await window.BA_LABS_RETIRE_BIOLOGICAL_RULE({ rule: row.rule, newVersion: version });
          }
          if (result?.status === "published" || result?.status === "retired") {
            status(result.status === "published" ? "Règle examinée et publiée." : "Nouvelle version de retrait enregistrée.", "success");
            await refresh();
          } else status("Opération refusée : " + (result?.reason || result?.status || "erreur inconnue") + ". Vérifiez vos droits et l’état du brouillon.", "error");
        } catch (_) { status("Opération impossible. La base de données reste l’autorité pour les permissions.", "error"); }
        finally { button.disabled = false; }
      }));
    }

    $("ruleRefresh").addEventListener("click", refresh);
    $("ruleCreateForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const variable = $("ruleVariable").value, unit = $("ruleUnit").value;
      const taxon = $("ruleTaxon").value.trim(), strain = $("ruleStrain").value.trim();
      const rule = {
        rule_id: $("ruleId").value.trim(), version: $("ruleVersion").value.trim(),
        status: "draft", domain, variable_code: variable, unit_code: unit,
        min: Number($("ruleMin").value), max: Number($("ruleMax").value),
        target: { ...(taxon ? { taxon_code: taxon } : {}), ...(strain ? { strain_code: strain } : {}), ...($("ruleStage").value.trim() ? { growth_stage: $("ruleStage").value.trim() } : {}) },
        sources: [{ type: $("ruleSourceType").value, citation: $("ruleCitation").value.trim() }]
      };
      const registry = window.BALabsBiologicalRuleRegistry;
      const validation = registry?.validate?.(rule);
      if (!validation?.valid) return status("Brouillon invalide : " + (validation?.errors || ["registre indisponible"]).join(", "), "error");
      const submit = $("ruleCreateForm").querySelector('button[type="submit"]');
      submit.disabled = true;
      try {
        const result = await window.BA_LABS_CREATE_BIOLOGICAL_RULE_DRAFT(rule);
        if (result?.status === "created") {
          $("ruleCreateForm").reset();
          $("ruleVersion").value = "1.0.0";
          status("Brouillon enregistré. Il n’est pas exécutable avant examen et publication.", "success");
          await refresh();
        } else status("Création refusée : " + (result?.reason || result?.status || "erreur inconnue") + ". Vérifiez les droits d’écriture.", "error");
      } catch (_) { status("Création impossible. Vérifiez la session et les permissions de l’organisation.", "error"); }
      finally { submit.disabled = false; }
    });

    populateCatalogue();
    $("ruleRefresh").addEventListener("click", () => populateCatalogue());
    refresh();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();