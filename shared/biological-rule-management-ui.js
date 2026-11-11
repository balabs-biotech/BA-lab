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
    const anchor = document.getElementById("measurementCard");
    if (!anchor) return;
    const section = document.createElement("section");
    section.id = "biologicalRuleManager";
    section.className = "card biological-rule-manager";
    section.innerHTML = `
      <div class="section-kicker"><span>MODULE SCIENTIFIQUE</span><span class="kicker-line"></span><span>GOUVERNANCE DES RÈGLES</span></div>
      <div class="rule-manager-heading"><div><h2>Règles biologiques</h2><p class="muted">Référentiel versionné. Seules les règles examinées peuvent alimenter le moteur d’interprétation.</p></div><button type="button" id="ruleRefresh" class="secondary-button small-button">Actualiser</button></div>
      <div id="ruleManagerStatus" class="info" role="status" aria-live="polite">Vérification de la session et des droits…</div><div id="rulePermission" class="rule-permission" aria-live="polite"></div>
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
    anchor.appendChild(section);

    const $ = (id) => section.querySelector("#" + id);
    const status = (message, kind = "") => {
      $("ruleManagerStatus").textContent = message;
      $("ruleManagerStatus").className = "info" + (kind ? " " + kind : "");
    };
    const client = () => window.BA_LABS_SUPABASE_CLIENT;
    const organizationId = () => window.BA_LABS_GET_ORGANIZATION_ID?.();
    const domain = DOMAIN;
    let capabilities = { status: "unavailable", isAdmin: false, role: null };

    function populateCatalogue() {
      const catalogue = window.BA_LABS_GET_MEASUREMENT_CATALOGUE?.();
      const vars = Array.isArray(catalogue?.variables) ? catalogue.variables : [];
      const units = Array.isArray(catalogue?.units) ? catalogue.units : [];
      const visibleCodes = new Set(Array.from(document.querySelectorAll("#measurementVariable option")).map(o => o.value).filter(Boolean));
      const relevant = vars.filter(v => !visibleCodes.size || visibleCodes.has(v.code));
      $("ruleVariable").innerHTML = '<option value="">Sélectionner…</option>' + relevant.map(v => `<option value="${esc(v.code)}" data-dimension="${esc(v.dimension)}">${esc(v.label)} · ${esc(v.code)}</option>`).join("");
      $("ruleVariable").onchange = () => {
        const selected = vars.find(v => v.code === $("ruleVariable").value);
        const matching = units.filter(u => selected && u.dimension === selected.dimension);
        $("ruleUnit").innerHTML = '<option value="">Sélectionner…</option>' + matching.map(u => `<option value="${esc(u.code)}">${esc(u.label)} · ${esc(u.code)}</option>`).join("");
      };
      if (!relevant.length) status("Catalogue de variables indisponible ou non chargé. Réessayez après le chargement des données.", "warning");
    }

    async function refresh() {
      const org = organizationId();
      const store = window.BALabsBiologicalRuleStore;
      if (!org || !client() || !store?.loadRuleHistory) {
        status("Session ou organisation indisponible. Connectez-vous puis actualisez.", "warning");
        return;
      }
      status("Vérification des droits et chargement de l’historique…");
      capabilities = await store.loadAuthoringCapabilities({ client: client(), organizationId: org });
      if (organizationId() !== org) return status("Espace modifié pendant la vérification. Actualisez.", "warning");
      $("ruleCreateForm").querySelectorAll("input,select,textarea,button").forEach(control => { control.disabled = !capabilities.isAdmin; });
      $("rulePermission").textContent = capabilities.status === "loaded"
        ? (capabilities.isAdmin ? "Rôle " + capabilities.role + " : gestion autorisée. La base de données reste l’autorité finale." : "Rôle " + capabilities.role + " : consultation uniquement. La création, la publication et le retrait sont réservés aux administrateurs et propriétaires.")
        : "Droits non vérifiables : mode consultation seule.";
      $("rulePermission").className = "rule-permission " + (capabilities.isAdmin ? "is-admin" : "is-readonly");
      const result = await store.loadRuleHistory({ client: client(), organizationId: org, domain });
      if (organizationId() !== org) return status("Espace modifié pendant le chargement. Actualisez.", "warning");
      if (result.status !== "loaded") return status("Historique indisponible : " + result.reason, "error");
      renderHistory(result.records, capabilities.isAdmin);
      status(result.records.length + " version(s) chargée(s) pour " + domain + ". Les règles restent limitées à votre organisation.", "success");
    }

    function renderHistory(records, canAdmin) {
      const host = $("ruleHistory");
      if (!records.length) { host.innerHTML = '<p class="muted">Aucune règle enregistrée dans cet espace.</p>'; return; }
      const latestByRule = new Map();
      for (const record of records) if (!latestByRule.has(record.rule_id)) latestByRule.set(record.rule_id, record.id);
      const byRule = new Map();
      for (const record of records) { if (!byRule.has(record.rule_id)) byRule.set(record.rule_id, []); byRule.get(record.rule_id).push(record); }
      host.innerHTML = records.map((row, index) => {
        const r = row.rule;
        const target = [r.target?.taxon_code, r.target?.strain_code, r.target?.growth_stage].filter(Boolean).join(" · ");
        const review = row.reviewed_by ? " · examinateur " + row.reviewed_by : "";
        const versions = byRule.get(row.rule_id) || [];
        const position = versions.findIndex(candidate => candidate.id === row.id);
        const previous = versions[position + 1];
        const isLatest = latestByRule.get(row.rule_id) === row.id;
        const actions = !canAdmin ? '<span class="muted">Consultation seule</span>' : row.status === "draft"
          ? (isLatest ? `<button type="button" class="small-button" data-action="review" data-index="${index}">Examiner et publier</button>` : '<span class="muted">Brouillon dépassé par une révision plus récente — publication bloquée</span>')
          : row.status === "reviewed"
            ? (isLatest ? `<div class="rule-retire"><label for="retire-${index}">Nouvelle version de retrait</label><input id="retire-${index}" data-version-input="${index}" maxlength="40" placeholder="2.0.0"><button type="button" class="small-button secondary-button" data-action="retire" data-index="${index}">Retirer cette règle</button></div>` : '<span class="muted">Version remplacée — retrait bloqué</span>')
            : '<span class="muted">Version retirée — non exécutable</span>';
        const comparison = previous ? `<details class="rule-version-compare"><summary>Comparer avec v${esc(previous.version)}</summary><dl><dt>Intervalle</dt><dd>${esc(previous.rule.min)}–${esc(previous.rule.max)} → ${esc(r.min)}–${esc(r.max)}</dd><dt>Variable / unité</dt><dd>${esc(previous.variable_code)} / ${esc(previous.unit_code)} → ${esc(row.variable_code)} / ${esc(row.unit_code)}</dd><dt>Cible</dt><dd>${esc(JSON.stringify(previous.rule.target))} → ${esc(JSON.stringify(r.target))}</dd><dt>Sources</dt><dd>${esc(JSON.stringify(previous.rule.sources))} → ${esc(JSON.stringify(r.sources))}</dd></dl></details>` : '<p class="muted">Première version connue dans l’historique chargé.</p>';
        const conflict = !isLatest && row.status !== "retired" ? '<p class="rule-conflict">Conflit de cycle de vie : une révision plus récente existe pour cet identifiant.</p>' : '';
        return `<article class="rule-record"><div class="rule-record-top"><strong>${esc(row.rule_id)}</strong><span class="rule-status status-${esc(row.status)}">${esc(row.status)}</span></div><div class="muted">v${esc(row.version)} · ${esc(row.variable_code)} / ${esc(row.unit_code)} · révision ${esc(row.revision_seq)}</div><p>Intervalle enregistré : <strong>${esc(r.min)} à ${esc(r.max)}</strong></p><p class="muted">Cible : ${esc(target || "non spécifiée")}${esc(review)}</p><p class="muted">Source : ${esc(r.sources?.[0]?.citation || "non renseignée")}</p>${conflict}${comparison}${actions}</article>`;
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
      if (!capabilities.isAdmin) return status("Action réservée aux administrateurs et propriétaires de l’organisation.", "error");
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
    section.querySelector(".rule-create").addEventListener("toggle", () => {
      if (section.querySelector(".rule-create").open) populateCatalogue();
    });
    refresh();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();