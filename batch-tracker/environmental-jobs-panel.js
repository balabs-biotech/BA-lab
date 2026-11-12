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
  const requestBox = node("div", "environmental-job-request");
  const requestHeading = node("h4", "", "Nouvelle analyse Sentinel-2");
  const startDate = node("input");
  startDate.type = "date";
  startDate.required = true;
  const endDate = node("input");
  endDate.type = "date";
  endDate.required = true;
  const cloudLimit = node("input");
  cloudLimit.type = "number";
  cloudLimit.min = "0";
  cloudLimit.max = "100";
  cloudLimit.step = "1";
  cloudLimit.value = "30";
  cloudLimit.required = true;
  const maxScenes = node("select");
  [3, 5, 10].forEach(value => {
    const option = node("option", "", String(value));
    option.value = String(value);
    if (value === 10) option.selected = true;
    maxScenes.append(option);
  });
  const dateField = (labelText, input) => {
    const wrap = node("label", "environmental-job-field", labelText);
    wrap.append(input);
    return wrap;
  };
  const enqueue = node("button", "primary-button", "Lancer l’analyse satellite");
  enqueue.type = "button";
  const enqueueStatus = node("p", "signals-status", "Choisissez un emplacement et une période.");
  enqueueStatus.setAttribute("role", "status");
  enqueueStatus.setAttribute("aria-live", "polite");
  requestBox.append(
    requestHeading,
    dateField("Date de début", startDate),
    dateField("Date de fin", endDate),
    dateField("Couverture nuageuse maximale (%)", cloudLimit),
    dateField("Nombre maximal de scènes", maxScenes),
    enqueue,
    enqueueStatus
  );
  const status = node("p", "signals-status", "En attente de la session.");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const summary = node("div", "overview-metrics");
  const list = node("div", "overview-observations");
  card.append(heading, controls, requestBox, status, summary, list);

  function setDefaultDates() {
    const today = new Date();
    today.setDate(today.getDate() - 1);
    const from = new Date(today);
    from.setDate(from.getDate() - 29);
    const iso = value => [
      value.getFullYear(),
      String(value.getMonth() + 1).padStart(2, "0"),
      String(value.getDate()).padStart(2, "0")
    ].join("-");
    const maximum = iso(today);
    startDate.max = maximum;
    endDate.max = maximum;
    startDate.value = iso(from);
    endDate.value = maximum;
  }

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
    setDefaultDates();
    enqueue.disabled = true;
    if (!state.organizationId) {
      setStatus("Connectez-vous pour consulter les exécutions.");
      enqueueStatus.textContent = "Connectez-vous pour lancer une analyse.";
      return;
    }
    await loadLocations(revision, state.organizationId);
    enqueue.disabled = false;
  }

  location.addEventListener("change", () => {
    state.locationId = location.value;
    enqueue.disabled = !state.locationId;
    enqueueStatus.textContent = state.locationId
      ? "Emplacement sélectionné. Définissez la période puis lancez l’analyse."
      : "Choisissez un emplacement pour lancer une analyse.";
    loadJobs();
  });

  enqueue.addEventListener("click", async () => {
    const selectedLocation = location.value;
    if (!selectedLocation) {
      enqueueStatus.textContent = "Sélectionnez d’abord un emplacement.";
      return;
    }
    if (!startDate.value || !endDate.value || startDate.value > endDate.value) {
      enqueueStatus.textContent = "La période demandée est invalide.";
      return;
    }
    const cloud = Number(cloudLimit.value);
    const scenes = Number(maxScenes.value);
    if (!Number.isFinite(cloud) || cloud < 0 || cloud > 100 ||
        !Number.isInteger(scenes) || scenes < 1 || scenes > 10) {
      enqueueStatus.textContent = "Vérifiez la couverture nuageuse et le nombre de scènes.";
      return;
    }
    const from = new Date(startDate.value + "T00:00:00Z");
    const to = new Date(endDate.value + "T00:00:00Z");
    const days = Math.floor((to.getTime() - from.getTime()) / 86400000) + 1;
    if (days > 90) {
      enqueueStatus.textContent = "La période ne peut pas dépasser 90 jours.";
      return;
    }
    enqueue.disabled = true;
    enqueueStatus.textContent = "Envoi de la demande au registre des traitements…";
    try {
      const { data, error } = await client.functions.invoke(
        "earth-search-sentinel2-enqueue",
        {
          body: {
            location_id: selectedLocation,
            start_date: startDate.value,
            end_date: endDate.value,
            max_cloud_cover_pct: cloud,
            max_scenes: scenes
          }
        }
      );
      if (error) {
        console.warn("[environmental jobs] Enqueue failed:", error.message);
        enqueueStatus.textContent = "Impossible de mettre l’analyse en file. Vérifiez le déploiement de la fonction et vos droits.";
        return;
      }
      if (!data?.ok || !data?.job_id) {
        enqueueStatus.textContent = "La demande n’a pas été confirmée par le serveur.";
        return;
      }
      enqueueStatus.textContent = "Analyse mise en file · identifiant " + data.job_id;
      state.locationId = selectedLocation;
      await loadJobs(state.revision, state.organizationId);
    } catch (error) {
      console.warn("[environmental jobs] Enqueue request failed:", error?.message || "unknown");
      enqueueStatus.textContent = "Erreur réseau lors de l’envoi de la demande.";
    } finally {
      enqueue.disabled = !state.organizationId || !location.value;
    }
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