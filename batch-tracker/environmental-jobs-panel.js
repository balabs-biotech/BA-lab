/* BA Labs CultureOps — Sentinel-2 ingestion execution history.
 * Optional read-only module: failures here never block the Green Tech workspace.
 */
(() => {
  "use strict";
  if (document.body.dataset.domain !== "agronomy") return;
  const client = window.BALabsSupabaseClient;
  if (!client) return;

  const state = { organizationId: null, revision: 0, locationId: "" };
  const node = (tag, className, text) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  };
  const card = node("section", "card environmental-jobs-card");
  card.id = "environmentalJobsCard";
  card.setAttribute("aria-labelledby", "environmentalJobsTitle");
  const heading = node("div", "signals-heading");
  const titleWrap = node("div");
  titleWrap.append(
    node("h3", "", "Exécutions Sentinel-2"),
    node("p", "muted", "Historique des traitements satellite et état de chaque lot d’ingestion.")
  );
  const refresh = node("button", "secondary-button", "Actualiser");
  refresh.type = "button";
  heading.append(titleWrap, refresh);
  const controls = node("div", "grid");
  const locationLabel = node("label", "", "Emplacement");
  const location = node("select");
  locationLabel.append(location);
  controls.append(locationLabel);
  const status = node("p", "signals-status", "En attente de la session.");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const summary = node("div", "overview-metrics");
  const list = node("div", "overview-observations");
  card.append(heading, controls, status, summary, list);

  function mount() {
    const target = document.getElementById("environmentalCard");
    if (target && !document.getElementById(card.id)) target.append(card);
  }
  function setStatus(message, error = false) {
    status.textContent = message;
    status.dataset.state = error ? "error" : "info";
  }
  function metric(label, value) {
    const item = node("article", "overview-metric");
    item.append(node("span", "overview-metric-label", label), node("strong", "", String(value)));
    return item;
  }
  function dateLabel(value) {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
  }
  function statusLabel(value) {
    return ({
      queued: "En attente",
      processing: "En cours",
      succeeded: "Réussi",
      partial_failed: "Partiellement échoué",
      failed: "Échec"
    })[value] || value || "Inconnu";
  }
  function render(rows) {
    summary.replaceChildren();
    list.replaceChildren();
    const counts = { processing: 0, succeeded: 0, partial_failed: 0, failed: 0 };
    rows.forEach(row => { if (Object.hasOwn(counts, row.status)) counts[row.status] += 1; });
    summary.append(
      metric("En cours", counts.processing),
      metric("Réussis", counts.succeeded),
      metric("Partiels", counts.partial_failed),
      metric("Échecs", counts.failed)
    );
    if (!rows.length) {
      list.append(node("p", "muted", "Aucune exécution enregistrée pour cet emplacement."));
      return;
    }
    rows.forEach(row => {
      const item = node("article", "overview-observation");
      const top = node("div", "overview-section-heading");
      top.append(node("strong", "", statusLabel(row.status)), node("span", "muted", dateLabel(row.created_at)));
      const counters = [
        ["Scènes sélectionnées", row.scenes_selected],
        ["Traitées", row.scenes_processed],
        ["Échouées", row.scenes_failed],
        ["Doublons", row.scenes_duplicated],
        ["Observations envoyées", row.observations_submitted]
      ].map(([label, value]) => label + " : " + (value ?? 0)).join(" · ");
      item.append(top, node("p", "muted", counters));
      if (row.error_code) item.append(node("p", "signals-status", "Code : " + row.error_code));
      if (row.completed_at) item.append(node("p", "muted", "Terminé : " + dateLabel(row.completed_at)));
      list.append(item);
    });
  }

  async function loadLocations(revision, organizationId) {
    const { data, error } = await client.from("locations")
      .select("id,name,code")
      .eq("organization_id", organizationId)
      .order("name", { ascending: true });
    if (revision !== state.revision || organizationId !== state.organizationId) return;
    if (error) {
      setStatus("Impossible de charger les emplacements de l’organisation.", true);
      return;
    }
    location.replaceChildren(node("option", "", "Tous les emplacements"));
    (data || []).forEach(row => {
      const option = node("option", "", row.name || row.code || row.id);
      option.value = row.id;
      location.append(option);
    });
    await loadJobs(revision, organizationId);
  }

  async function loadJobs(revision = state.revision, organizationId = state.organizationId) {
    if (!organizationId) return;
    setStatus("Chargement de l’historique des traitements…");
    refresh.disabled = true;
    let query = client.from("environmental_ingestion_jobs")
      .select("id,location_id,status,created_at,started_at,completed_at,error_code,items_seen,scenes_selected,scenes_processed,scenes_failed,scenes_duplicated,observations_submitted")
      .eq("organization_id", organizationId)
      .eq("job_type", "sentinel2_scene_ingestion")
      .order("created_at", { ascending: false })
      .limit(50);
    if (state.locationId) query = query.eq("location_id", state.locationId);
    const { data, error } = await query;
    if (revision !== state.revision || organizationId !== state.organizationId) return;
    refresh.disabled = false;
    if (error) {
      console.warn("[environmental jobs] Read failed:", error.message);
      setStatus("Historique indisponible. Vérifiez que la migration du registre est appliquée et que votre session est membre de l’organisation.", true);
      list.replaceChildren();
      summary.replaceChildren();
      return;
    }
    render(data || []);
    setStatus((data || []).length + " exécution(s) chargée(s), maximum 50.");
  }

  async function activate(context = {}) {
    state.revision += 1;
    const revision = state.revision;
    state.organizationId = context.organizationId || window.BALabsGetOrganizationId?.() || null;
    state.locationId = "";
    location.replaceChildren(node("option", "", "Chargement…"));
    summary.replaceChildren();
    list.replaceChildren();
    if (!state.organizationId) {
      setStatus("Connectez-vous pour consulter les exécutions.");
      return;
    }
    await loadLocations(revision, state.organizationId);
  }

  location.addEventListener("change", () => {
    state.locationId = location.value;
    loadJobs();
  });
  refresh.addEventListener("click", () => loadJobs());
  window.addEventListener("balabs:organization-context", event => activate(event.detail || {}));
  const observer = new MutationObserver(mount);
  observer.observe(document.body, { childList: true, subtree: true });
  mount();
  client.auth.getSession().then(({ data }) => {
    if (data?.session?.user?.id) activate({ organizationId: window.BALabsGetOrganizationId?.(), userId: data.session.user.id });
  }).catch(error => console.warn("[environmental jobs] Session check failed:", error));
})();