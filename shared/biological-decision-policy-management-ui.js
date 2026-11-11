/* BA Labs Biological Decision Policy Management UI v0.1.0
 * Explicitly authored decision policies; no default thresholds or automatic actions.
 */
(function () {
  "use strict";
  const DOMAIN = document.body.dataset.domain;
  if (!["mycology","laboratory"].includes(DOMAIN)) return;
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  })[c]);

  function init() {
    if (document.getElementById("biologicalDecisionPolicyManager")) return;
    const anchor = document.getElementById("measurementCard");
    if (!anchor) return;
    const section = document.createElement("section");
    section.id = "biologicalDecisionPolicyManager";
    section.className = "card biological-rule-manager";
    section.innerHTML = `
      <div class="section-kicker"><span>MODULE SCIENTIFIQUE</span><span class="kicker-line"></span><span>GOUVERNANCE DES DÉCISIONS</span></div>
      <div class="rule-manager-heading"><div><h2>Politiques de décision</h2><p class="muted">Une politique relie une évaluation hors plage à une conduite documentée. Elle doit être rédigée et examinée par votre organisation.</p></div><button type="button" id="decisionPolicyRefresh" class="secondary-button small-button">Actualiser</button></div>
      <div id="decisionPolicyStatus" class="info" role="status" aria-live="polite">Chargement des politiques…</div>
      <div id="decisionPolicyPermission" class="rule-permission" aria-live="polite"></div>
      <details class="rule-create">
        <summary>Créer une politique (brouillon)</summary>
        <p class="muted">Aucune conduite ni gravité n’est préremplie. La politique doit être rattachée à une version de règle biologique déjà examinée.</p>
        <form id="decisionPolicyCreateForm">
          <div class="grid">
            <div><label for="decisionPolicyId">Identifiant stable</label><input id="decisionPolicyId" maxlength="120" required placeholder="mycology.inspect.temperature"></div>
            <div><label for="decisionPolicyVersion">Version</label><input id="decisionPolicyVersion" maxlength="40" required value="1.0.0"></div>
            <div><label for="decisionPolicyRule">Règle biologique examinée</label><select id="decisionPolicyRule" required><option value="">Chargement des règles…</option></select></div>
            <div><label for="decisionPolicyCode">Code de décision</label><input id="decisionPolicyCode" maxlength="120" required placeholder="inspect_environment"></div>
            <div><label for="decisionPolicyTitle">Titre</label><input id="decisionPolicyTitle" maxlength="180" required></div>
            <div><label for="decisionPolicySeverity">Niveau (facultatif, défini par BA Labs)</label><input id="decisionPolicySeverity" maxlength="60" placeholder="ex. review"></div>
          </div>
          <label for="decisionPolicyExplanation">Justification</label><textarea id="decisionPolicyExplanation" rows="3" maxlength="3000" required></textarea>
          <label for="decisionPolicyAction">Conduite recommandée (facultatif)</label><textarea id="decisionPolicyAction" rows="3" maxlength="3000"></textarea>
          <label for="decisionPolicySource">Source / protocole de référence</label><textarea id="decisionPolicySource" rows="2" maxlength="2000" required placeholder="Référence, version, date, DOI ou identifiant interne…"></textarea>
          <button type="submit">Enregistrer le brouillon</button>
        </form>
      </details>
      <div class="rule-history-heading"><h3>Historique des politiques</h3><span class="muted">200 dernières révisions maximum</span></div>
      <div id="decisionPolicyHistory" class="rule-history"><p class="muted">Aucune liste chargée.</p></div>`;
    anchor.appendChild(section);
    const $ = id => section.querySelector("#"+id);
    const client = () => window.BA_LABS_SUPABASE_CLIENT;
    const org = () => window.BA_LABS_GET_ORGANIZATION_ID?.();
    let canAdmin = false;
    let latestRules = [];

    function status(message, kind="") {
      $("decisionPolicyStatus").textContent = message;
      $("decisionPolicyStatus").className = "info"+(kind ? " "+kind : "");
    }

    async function loadRuleChoices(organizationId) {
      const store = window.BALabsBiologicalRuleStore;
      if (!store?.loadRuleHistory) return [];
      const result = await store.loadRuleHistory({client:client(),organizationId,domain:DOMAIN});
      if (result.status !== "loaded") return [];
      const latest = new Map();
      for (const row of result.records) if (!latest.has(row.rule_id)) latest.set(row.rule_id,row);
      return [...latest.values()].filter(row => row.status === "reviewed");
    }

    function renderRuleChoices() {
      $("decisionPolicyRule").innerHTML = '<option value="">Sélectionner une règle examinée…</option>' +
        latestRules.map(row => `<option value="${esc(row.id)}">${esc(row.rule_id)} · v${esc(row.version)} · ${esc(row.variable_code)} / ${esc(row.unit_code)}</option>`).join("");
      if (!latestRules.length) $("decisionPolicyRule").innerHTML = '<option value="">Aucune règle examinée disponible</option>';
    }

    function renderHistory(records) {
      const host = $("decisionPolicyHistory");
      if (!records.length) { host.innerHTML = '<p class="muted">Aucune politique enregistrée dans cet espace.</p>'; return; }
      const latest = new Map();
      for (const row of records) if (!latest.has(row.policy_id)) latest.set(row.policy_id,row.id);
      const groups = new Map();
      for (const row of records) {
        if (!groups.has(row.policy_id)) groups.set(row.policy_id,[]);
        groups.get(row.policy_id).push(row);
      }
      host.innerHTML = records.map((row,index) => {
        const isLatest = latest.get(row.policy_id) === row.id;
        const previous = (groups.get(row.policy_id)||[])[(groups.get(row.policy_id)||[]).findIndex(x=>x.id===row.id)+1];
        const actions = !canAdmin ? '<span class="muted">Consultation seule</span>' :
          row.status === "draft" ? (isLatest
            ? `<button type="button" class="small-button" data-policy-action="review" data-index="${index}">Examiner et publier</button>`
            : '<span class="muted">Brouillon dépassé — publication bloquée</span>') :
          row.status === "reviewed" ? (isLatest
            ? `<div class="rule-retire"><label for="decision-retire-${index}">Nouvelle version de retrait</label><input id="decision-retire-${index}" data-policy-version="${index}" maxlength="40" placeholder="2.0.0"><button type="button" class="small-button secondary-button" data-policy-action="retire" data-index="${index}">Retirer</button></div>`
            : '<span class="muted">Version remplacée — retrait bloqué</span>') :
          '<span class="muted">Politique retirée</span>';
        const diff = previous ? `<details class="rule-version-compare"><summary>Version précédente : ${esc(previous.version)}</summary><p>${esc(previous.title)} · ${esc(previous.decision_code)}</p></details>` : "";
        const rule = latestRules.find(r=>r.id===row.rule_version_id);
        return `<article class="rule-record"><div class="rule-record-top"><strong>${esc(row.policy_id)}</strong><span class="rule-status status-${esc(row.status)}">${esc(row.status)}</span></div><div class="muted">v${esc(row.version)} · révision ${esc(row.revision_seq)} · règle ${esc(rule ? rule.rule_id+" v"+rule.version : row.rule_version_id)}</div><h4>${esc(row.title)}</h4><p>${esc(row.explanation)}</p><p class="muted">Décision : ${esc(row.decision_code)} · examinateur : ${esc(row.reviewed_by || "non examiné")}</p>${diff}${actions}</article>`;
      }).join("");
      host.querySelectorAll("button[data-policy-action]").forEach(button => button.addEventListener("click", async () => {
        const row = records[Number(button.dataset.index)];
        if (!row) return;
        button.disabled = true;
        try {
          let result;
          if (button.dataset.policyAction === "review") {
            if (!window.confirm("Publier cette politique après examen ? Elle deviendra immuable.")) { button.disabled=false; return; }
            result = await window.BA_LABS_REVIEW_DECISION_POLICY_DRAFT({policyId:row.policy_id,version:row.version});
          } else {
            const version = host.querySelector('[data-policy-version="'+button.dataset.index+'"]')?.value?.trim();
            if (!version) { status("Saisissez une nouvelle version pour le retrait.","warning"); button.disabled=false; return; }
            if (!window.confirm("Créer une nouvelle version retirée ? La version examinée restera immuable.")) { button.disabled=false; return; }
            result = await window.BA_LABS_RETIRE_DECISION_POLICY({policy:row,newVersion:version});
          }
          if (["published","retired"].includes(result?.status)) {
            status(result.status==="published" ? "Politique examinée et publiée." : "Nouvelle version de retrait enregistrée.","success");
            await refresh();
          } else status("Opération refusée : "+(result?.reason||result?.status||"erreur inconnue"),"error");
        } catch (_) { status("Opération impossible. Vérifiez la session et les permissions.","error"); }
        finally { button.disabled=false; }
      }));
    }

    async function refresh() {
      const organizationId = org();
      if (!organizationId || !client()) return status("Session ou organisation indisponible. Connectez-vous puis actualisez.","warning");
      status("Vérification des droits et chargement de l’historique…");
      const capabilities = await window.BALabsBiologicalRuleStore.loadAuthoringCapabilities({client:client(),organizationId});
      if (org() !== organizationId) return status("Espace modifié pendant le chargement. Actualisez.","warning");
      canAdmin = capabilities.status==="loaded" && capabilities.isAdmin;
      $("decisionPolicyPermission").textContent = canAdmin
        ? "Rôle "+capabilities.role+" : création, examen et retrait autorisés. Les contrôles PostgreSQL restent souverains."
        : "Consultation seule : droits administrateur non confirmés.";
      $("decisionPolicyPermission").className = "rule-permission "+(canAdmin?"is-admin":"is-readonly");
      $("decisionPolicyCreateForm").querySelectorAll("input,select,textarea,button").forEach(el=>el.disabled=!canAdmin);
      latestRules = await loadRuleChoices(organizationId);
      if (org() !== organizationId) return status("Espace modifié pendant le chargement. Actualisez.","warning");
      renderRuleChoices();
      const store = window.BALabsBiologicalDecisionPolicyStore;
      const history = await store.loadPolicyHistory({client:client(),organizationId,domain:DOMAIN});
      if (org() !== organizationId) return status("Espace modifié pendant le chargement. Actualisez.","warning");
      if (history.status !== "loaded") return status("Historique indisponible : "+history.reason,"error");
      renderHistory(history.records);
      status(history.records.length+" révision(s) chargée(s) pour "+DOMAIN+".","success");
    }

    $("decisionPolicyRefresh").addEventListener("click",refresh);
    $("decisionPolicyCreateForm").addEventListener("submit",async event=>{
      event.preventDefault();
      if (!canAdmin) return status("Action réservée aux administrateurs et propriétaires.","error");
      const ruleId=$("decisionPolicyRule").value;
      const rule=latestRules.find(r=>r.id===ruleId);
      if (!rule || rule.status!=="reviewed") return status("Sélectionnez une version de règle actuellement examinée.","error");
      const source=$("decisionPolicySource").value.trim();
      const policy={
        policy_id:$("decisionPolicyId").value.trim(),
        version:$("decisionPolicyVersion").value.trim(),
        status:"draft",domain:DOMAIN,rule_version_id:rule.id,
        trigger_assessment_statuses:["out_of_range"],
        decision_code:$("decisionPolicyCode").value.trim(),
        title:$("decisionPolicyTitle").value.trim(),
        explanation:$("decisionPolicyExplanation").value.trim(),
        severity:$("decisionPolicySeverity").value.trim()||null,
        recommended_action:$("decisionPolicyAction").value.trim()||null,
        sources:[{type:"documented_protocol",citation:source}]
      };
      const submit=$("decisionPolicyCreateForm").querySelector('button[type="submit"]');
      submit.disabled=true;
      try {
        const result=await window.BA_LABS_CREATE_DECISION_POLICY_DRAFT(policy);
        if (result?.status==="created") {
          $("decisionPolicyCreateForm").reset();
          $("decisionPolicyVersion").value="1.0.0";
          status("Brouillon enregistré. Il ne peut pas déclencher de décision avant examen et publication.","success");
          await refresh();
        } else status("Création refusée : "+(result?.reason||result?.status||"erreur inconnue"),"error");
      } catch (_) { status("Création impossible. Vérifiez la session et les permissions.","error"); }
      finally { submit.disabled=!canAdmin; }
    });
    refresh();
  }
  if (document.readyState==="loading") document.addEventListener("DOMContentLoaded",init,{once:true});
  else init();
})();
