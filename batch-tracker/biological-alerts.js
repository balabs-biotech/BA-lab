/* BA Labs CultureOps — shared biological signal inbox.
 * Reads are tenant-scoped by RLS; state changes use the narrow writer RPC.
 */
(() => {
  "use strict";
  if (!window.supabase || !window.supabase.createClient) return;

  const client = window.BALabsSupabaseClient || window.supabase.createClient(
    "https://axcouwiodqsauwnsiotn.supabase.co",
    "sb_publishable_8H4XRh8V07Hlo0WwdfOXwg_2RXRX992"
  );
  const domainByWorkspace = { mycology: "mycology", agronomy: "greentech", laboratory: "lab" };
  const labels = {
    open: "Ouverte",
    acknowledged: "Prise en compte",
    resolved: "Résolue",
    dismissed: "Écartée"
  };
  const severityLabels = { critical: "Critique", high: "Élevée", moderate: "Modérée", low: "Faible", info: "Information" };
  const state = { userId: null, organizationId: null, domain: null, rows: [], filter: "active", request: 0 };
  const root = document.getElementById("biologicalSignalsCard");
  if (!root) return;

  const $ = id => root.querySelector("#" + id);
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const dateLabel = value => {
    if (!value) return "Date inconnue";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat(
      document.documentElement.lang || "fr",
      { dateStyle: "medium", timeStyle: "short" }
    ).format(date);
  };
  const notify = (message, isError = false) => {
    const node = $("signalsStatus");
    node.textContent = message;
    node.dataset.state = isError ? "error" : "info";
  };

  function render() {
    const list = $("signalsList");
    list.replaceChildren();
    const activeCount = state.rows.filter(row => row.signal_status === "open" || row.signal_status === "acknowledged").length;
    const criticalCount = state.rows.filter(row => row.severity === "critical" && row.signal_status !== "resolved" && row.signal_status !== "dismissed").length;
    $("signalsActiveCount").textContent = String(activeCount);
    $("signalsCriticalCount").textContent = String(criticalCount);
    $("signalsTotalCount").textContent = String(state.rows.length);

    const visible = state.rows.filter(row => {
      if (state.filter === "active") return row.signal_status === "open" || row.signal_status === "acknowledged";
      if (state.filter === "resolved") return row.signal_status === "resolved";
      if (state.filter === "dismissed") return row.signal_status === "dismissed";
      return true;
    });
    if (!visible.length) {
      list.append(element("p", "signals-empty", state.rows.length
        ? "Aucun signal dans cette catégorie."
        : "Aucun signal biologique enregistré pour cet espace."));
      return;
    }

    visible.forEach(row => {
      const card = element("article", "signal-item");
      card.dataset.severity = row.severity || "info";
      const header = element("div", "signal-item-header");
      const title = element("div", "signal-title-group");
      title.append(
        element("span", "signal-severity", severityLabels[row.severity] || row.severity || "Signal"),
        element("h3", "signal-code", row.signal_code || row.message_code || "Signal biologique")
      );
      header.append(title, element("span", "signal-state", labels[row.signal_status] || row.signal_status));
      const detail = element("p", "signal-message", row.message_code ? "Code du message : " + row.message_code : "Interprétation enregistrée par le moteur biologique.");
      const metadata = element("dl", "signal-metadata");
      const pairs = [
        ["Variable", row.variable_code],
        ["Observation", row.observed_value === null || row.observed_value === undefined ? null : String(row.observed_value) + (row.unit ? " " + row.unit : "")],
        ["Date", row.observed_date || null],
        ["Sujet biologique", row.biological_subject_id],
        ["Contexte biologique", row.biological_context_id],
        ["Environnement", row.environment_id],
        ["Règle", row.rule_id],
        ["Code du message", row.message_code],
        ["Recommandation", row.recommendation_code],
        ["Profil biologique", row.domain_profile_code && row.domain_profile_version ? row.domain_profile_code + " / v" + row.domain_profile_version : null],
        ["Profil environnemental", row.environment_profile_code && row.environment_profile_version ? row.environment_profile_code + " / v" + row.environment_profile_version : null],
        ["Analyse source", row.source_analysis_id],
        ["Constat source", row.source_finding_id],
        ["Observations sources", Array.isArray(row.source_observation_ids) && row.source_observation_ids.length ? row.source_observation_ids.join(", ") : null]
      ];
      pairs.filter(([, value]) => value).forEach(([term, value]) => {
        metadata.append(element("dt", "", term), element("dd", "", String(value)));
      });
      const footer = element("div", "signal-item-footer");
      footer.append(element("span", "signal-time", "Détecté : " + dateLabel(row.first_seen_at)));
      const actions = element("div", "signal-actions");
      const addAction = (label, nextStatus, className = "secondary-button") => {
        const button = element("button", className, label);
        button.type = "button";
        button.addEventListener("click", () => changeStatus(row.signal_id, nextStatus, button));
        actions.append(button);
      };
      if (row.signal_status === "open") {
        addAction("Prendre en compte", "acknowledged");
        addAction("Résoudre", "resolved");
        addAction("Écarter", "dismissed");
      } else if (row.signal_status === "acknowledged") {
        addAction("Rouvrir", "open");
        addAction("Résoudre", "resolved");
        addAction("Écarter", "dismissed");
      } else {
        addAction("Rouvrir", "open");
      }
      footer.append(actions);
      card.append(header, detail);
      if (metadata.childNodes.length) card.append(metadata);
      card.append(footer);
      list.append(card);
    });
  }

  async function loadSignals() {
    if (!state.userId || !state.organizationId || !state.domain) return;
    const request = ++state.request;
    notify("Chargement des signaux biologiques…");
    const { data, error } = await client
      .from("biological_signals")
      .select("signal_id,domain,signal_code,severity,message_code,recommendation_code,rule_id,source_analysis_id,source_finding_id,biological_context_id,biological_subject_id,environment_id,domain_profile_code,domain_profile_version,environment_profile_code,environment_profile_version,source_observation_ids,variable_code,observed_date,observed_value,unit,signal_status,first_seen_at,acknowledged_at,resolved_at,dismissed_at")
      .eq("organization_id", state.organizationId)
      .eq("domain", state.domain)
      .order("first_seen_at", { ascending: false })
      .limit(100);
    if (request !== state.request) return;
    if (error) {
      console.error("[CultureOps signals] Read failed", error.message);
      notify("Impossible de charger les signaux. Vérifiez les droits d’accès et la connexion.", true);
      return;
    }
    state.rows = data || [];
    render();
    notify(state.rows.length + " signal(aux) chargé(s).");
  }

  async function changeStatus(signalId, nextStatus, button) {
    if (!state.organizationId || button.disabled) return;
    button.disabled = true;
    const { error } = await client.rpc("set_biological_signal_status", {
      p_organization_id: state.organizationId,
      p_signal_id: signalId,
      p_status: nextStatus
    });
    button.disabled = false;
    if (error) {
      console.error("[CultureOps signals] Status transition failed", error.message);
      notify("Modification refusée. Vérifiez votre rôle dans l’organisation.", true);
      return;
    }
    notify("État de l’alerte mis à jour.");
    await loadSignals();
  }


  async function applySession(session) {
    state.request++;
    state.userId = session?.user?.id || null;
    state.organizationId = window.BALabsGetOrganizationId?.() || null;
    state.rows = [];
    if (!state.userId) {
      root.classList.add("hidden");
      return;
    }
    try {
      state.domain = domainByWorkspace[document.body.dataset.domain] || null;
      if (!state.domain) throw new Error("unsupported_workspace_domain");
      root.classList.remove("hidden");
      if (!state.organizationId) {
        notify("En attente du rattachement à l’organisation BA-LABS…");
        return;
      }
      await loadSignals();
    } catch (error) {
      console.error("[CultureOps signals] Workspace initialization failed", error);
      root.classList.remove("hidden");
      notify("Le centre des alertes n’a pas pu identifier l’organisation active.", true);
    }
  }

  $("signalsFilter").addEventListener("change", event => {
    state.filter = event.target.value;
    render();
  });
  $("signalsRefresh").addEventListener("click", loadSignals);

  client.auth.getSession().then(({ data }) => applySession(data.session));
  client.auth.onAuthStateChange((_event, session) => {
    // Defer SDK calls until the auth callback has returned.
    setTimeout(() => applySession(session), 0);
  });
  window.addEventListener("balabs:organization-context", event => {
    state.organizationId = event.detail?.organizationId || null;
    state.userId = event.detail?.userId || null;
    if (!state.userId) {
      state.rows = [];
      render();
      root.classList.add("hidden");
      return;
    }
    root.classList.remove("hidden");
    if (!state.organizationId) {
      state.rows = [];
      render();
      notify("En attente du rattachement à l’organisation BA-LABS…");
      return;
    }
    void loadSignals();
  });
  let previousDomain = document.body.dataset.domain;
  new MutationObserver(() => {
    const nextDomain = document.body.dataset.domain;
    if (nextDomain === previousDomain) return;
    previousDomain = nextDomain;
    state.domain = domainByWorkspace[nextDomain] || null;
    state.rows = [];
    render();
    if (state.domain && state.organizationId) void loadSignals();
  }).observe(document.body, { attributes: true, attributeFilter: ["data-domain"] });

  window.BALabsBiologicalSignals = {
    refresh: loadSignals,
    setDomain(domain) {
      state.domain = domainByWorkspace[domain] || domain;
      return loadSignals();
    }
  };
})();
