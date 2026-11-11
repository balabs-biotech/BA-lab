/* BA Labs CultureOps — independent IoT sensor analysis panel.
 * The core tracker remains usable if this optional module or its engine fails.
 */
(() => {
  "use strict";
  const workspace = document.body.dataset.domain;
  if (!["mycology", "laboratory"].includes(workspace)) return;
  const client = window.BALabsSupabaseClient;
  const root = document.getElementById("sensorAnalysisCard");
  if (!client || !root) return;

  const domain = workspace === "mycology" ? "mycology" : "lab";
  const state = { organizationId: null, userId: null, requestRevision: 0, loading: false };
  const $ = id => root.querySelector("#" + id);
  const node = (tag, className, text) => {
    const item = document.createElement(tag);
    if (className) item.className = className;
    if (text !== undefined) item.textContent = text;
    return item;
  };
  const localDate = date => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
  const today = localDate(new Date());

  function status(message, error = false) {
    $("sensorAnalysisStatus").textContent = message;
    $("sensorAnalysisStatus").dataset.state = error ? "error" : "info";
  }
  function clearResults() {
    $("sensorAnalysisResults").replaceChildren();
  }
  function resetTenant() {
    state.requestRevision += 1;
    state.organizationId = null;
    state.userId = null;
    state.loading = false;
    $("sensorEnvironment").replaceChildren(node("option", "", "Connectez-vous pour charger les environnements"));
    $("sensorSubject").replaceChildren(node("option", "", "Analyse environnementale seule"));
    $("sensorRun").disabled = true;
    clearResults();
    status("En attente d’une session authentifiée.");
  }

  async function loadEnvironments(revision, organizationId) {
    status("Chargement des environnements…");
    const { data, error } = await client.from("environments")
      .select("id,name,location_id,location:locations(name,code)")
      .eq("organization_id", organizationId)
      .order("name", { ascending: true });
    if (revision !== state.requestRevision || organizationId !== state.organizationId) return;
    if (error) {
      status("Impossible de charger les environnements de cette organisation.", true);
      console.error("[sensor panel] Environment lookup failed", error.message);
      return;
    }
    const select = $("sensorEnvironment");
    select.replaceChildren(node("option", "", "Sélectionner un environnement…"));
    (data || []).forEach(environment => {
      const location = Array.isArray(environment.location) ? environment.location[0] : environment.location;
      const option = node("option", "", environment.name + (location?.name ? " — " + location.name : ""));
      option.value = environment.id;
      option.dataset.locationId = environment.location_id || "";
      select.append(option);
    });
    $("sensorRun").disabled = !(data || []).length;
    status((data || []).length ? "Sélectionnez un environnement et une période. Le profil capteur doit être activé." : "Aucun environnement enregistré pour cette organisation.");
  }

  async function loadBiologicalContexts() {
    const revision = state.requestRevision;
    const organizationId = state.organizationId;
    const environmentId = $("sensorEnvironment").value;
    const select = $("sensorSubject");
    select.replaceChildren(node("option", "", "Analyse environnementale seule"));
    if (!environmentId || !organizationId) return;
    const { data, error } = await client.from("biological_contexts")
      .select("id,culture_id,plant_culture_id,domain,culture_stage,strain_code,cultivar_code,culture:cultures!biological_contexts_culture_fk(code),plant_culture:plant_cultures!biological_contexts_plant_culture_fk(code)")
      .eq("organization_id", organizationId)
      .eq("environment_id", environmentId)
      .eq("domain", domain)
      .order("valid_from", { ascending: false });
    if (revision !== state.requestRevision || organizationId !== state.organizationId || environmentId !== $("sensorEnvironment").value) return;
    if (error) {
      status("Les contextes biologiques ne sont pas disponibles. L’analyse descriptive reste accessible.", true);
      console.warn("[sensor panel] Biological context lookup failed", error.message);
      return;
    }
    (data || []).forEach(context => {
      const relation = context.culture || context.plant_culture;
      const subjectCode = Array.isArray(relation) ? relation[0]?.code : relation?.code;
      const subjectId = context.culture_id || context.plant_culture_id;
      if (!subjectId) return;
      const option = node("option", "", [subjectCode || "Sujet biologique", context.culture_stage, context.strain_code || context.cultivar_code].filter(Boolean).join(" · "));
      option.value = subjectId;
      select.append(option);
    });
  }

  function renderAnalysis(payload) {
    const output = $("sensorAnalysisResults");
    output.replaceChildren();
    const analysis = payload?.analysis;
    if (!analysis) {
      status("Le serveur n’a retourné aucun résultat d’analyse.", true);
      return;
    }
    const series = Array.isArray(analysis.series) ? analysis.series : [];
    const temporal = Array.isArray(payload.temporal_screening?.assessments) ? payload.temporal_screening.assessments : [];
    const flatlines = Array.isArray(payload.instrument_health?.flatline_diagnostics?.assessments) ? payload.instrument_health.flatline_diagnostics.assessments : [];
    const transmissions = Array.isArray(payload.instrument_health?.transmission_diagnostics?.assessments) ? payload.instrument_health.transmission_diagnostics.assessments : [];
    const signals = Array.isArray(payload.domain_interpretation?.signals) ? payload.domain_interpretation.signals : [];
    const summary = node("div", "sensor-summary");
    [["Observations", analysis.total_observations ?? 0], ["Séries", series.length], ["Lectures suspectes", payload.temporal_screening?.status === "completed" ? temporal.filter(item => item.status === "suspect").length : "Non demandé"], ["Alertes instrumentales", payload.instrument_health?.flatline_diagnostics?.status === "completed" ? flatlines.filter(item => item.status === "suspected").length : "Non demandé"], ["Appareils silencieux", payload.instrument_health?.transmission_diagnostics?.status === "completed" ? transmissions.filter(item => item.status === "silent").length : "Non demandé"], ["Signaux biologiques", signals.length]].forEach(([label, value]) => {
      const metric = node("article", "sensor-metric");
      metric.append(node("span", "", label), node("strong", "", String(value)));
      summary.append(metric);
    });
    output.append(summary);
    if (payload.interpretation_status === "context_invalid") {
      output.append(node("p", "sensor-notice", "Les mesures ont été analysées, mais le contexte biologique n’a pas pu être validé. Aucun signal biologique n’a été publié."));
    } else if (payload.interpretation_status === "not_requested") {
      output.append(node("p", "sensor-notice", "Analyse descriptive uniquement : aucun contexte biologique n’a été sélectionné."));
    } else if (payload.interpretation_status === "interpreted") {
      output.append(node("p", "sensor-notice", "Contexte biologique validé. Persistance des signaux : " + (analysis.signal_persistence_status || "statut non communiqué") + "."));
    }
    if (series.length) {
      const table = node("table", "sensor-series-table");
      const head = node("thead");
      const header = node("tr");
      ["Variable", "n utilisable", "Exclues", "Moyenne", "Min–max", "Couverture", "Ruptures", "Écart max", "État"].forEach(label => header.append(node("th", "", label)));
      head.append(header);
      const body = node("tbody");
      series.forEach(item => {
        const row = node("tr");
        const values = [item.variable_code, item.usable_count ?? "—", item.excluded_count ?? 0, item.mean ?? "—", item.minimum == null || item.maximum == null ? "—" : item.minimum + " – " + item.maximum, item.availability_ratio == null ? "Non déterminée" : Math.round(item.availability_ratio * 100) + "%", item.gap_count == null ? "Non déterminées" : item.gap_count, item.maximum_gap_seconds == null ? "—" : Math.round(item.maximum_gap_seconds) + " s", item.status || "—"];
        values.forEach(value => row.append(node("td", "", String(value))));
        body.append(row);
      });
      table.append(head, body);
      output.append(table);
      const qualityRows = series.filter(item => item.quality_counts && Object.keys(item.quality_counts).length);
      if (qualityRows.length) {
        const qualityDetails = node("details", "sensor-detail");
        qualityDetails.append(node("summary", "", "Répartition de la qualité des mesures"));
        qualityRows.forEach(item => {
          const counts = Object.entries(item.quality_counts).map(([quality, count]) => quality + " : " + count).join(" · ");
          qualityDetails.append(node("p", "", [item.variable_code, counts].filter(Boolean).join(" — ")));
        });
        output.append(qualityDetails);
      }
    }
    if (temporal.length) {
      const details = node("details", "sensor-detail");
      details.append(node("summary", "", "Détails du dépistage temporel (" + temporal.length + ")"));
      temporal.forEach(item => details.append(node("p", "", [item.variable_code, item.status, item.observed_value, item.unit_code, item.observed_at, item.history_count === undefined ? null : "historique n=" + item.history_count, item.robust_z_score == null ? null : "z robuste=" + Number(item.robust_z_score).toFixed(2)].filter(value => value !== undefined && value !== null).join(" · "))));
      output.append(details);
    }
    if (payload.instrument_health?.flatline_diagnostics?.status === "completed") {
      const details = node("details", "sensor-detail");
      details.append(node("summary", "", "Fiabilité instrumentale — répétitions exactes (" + flatlines.length + " capteur(s)/variable(s))"));
      flatlines.forEach(item => details.append(node("p", "", [
        item.variable_code, item.status,
        "plus longue séquence=" + (item.longest_repeated_run ?? 0),
        item.longest_repeated_duration_seconds == null ? null : "durée=" + Math.round(item.longest_repeated_duration_seconds) + " s",
        "observations utilisables=" + (item.observation_count ?? 0)
      ].filter(value => value !== undefined && value !== null).join(" · "))));
      details.append(node("p", "sensor-notice", "Une séquence identique est un indice instrumental à examiner, pas un diagnostic de panne ni une anomalie biologique."));
      output.append(details);
    }
    if (payload.instrument_health?.transmission_diagnostics?.status === "completed") {
      const details = node("details", "sensor-detail");
      details.append(node("summary", "", "État des transmissions IoT (" + transmissions.length + " appareil(s))"));
      transmissions.forEach(item => details.append(node("p", "", [
        item.device_code, item.status,
        "reçus=" + (item.receipt_count ?? 0),
        item.gap_count == null ? null : "ruptures=" + item.gap_count,
        item.maximum_gap_seconds == null ? null : "écart max=" + Math.round(item.maximum_gap_seconds) + " s",
        item.trailing_silence_seconds == null ? null : "silence=" + Math.round(item.trailing_silence_seconds) + " s"
      ].filter(value => value !== undefined && value !== null).join(" · "))));
      details.append(node("p", "sensor-notice", "Une absence de transmission est un diagnostic de transport, distinct de la qualité des mesures et de l’état biologique. Les périodes historiques ne sont pas qualifiées de silencieuses."));
      output.append(details);
    }
    if (signals.length) {
      const details = node("details", "sensor-detail");
      details.append(node("summary", "", "Signaux biologiques interprétés (" + signals.length + ")"));
      signals.forEach(signal => details.append(node("p", "", [signal.signal_code, signal.severity, signal.message_code, signal.variable_code, signal.finding_status].filter(Boolean).join(" · "))));
      output.append(details);
    }
    status("Analyse terminée. Les résultats descriptifs ne constituent pas, à eux seuls, un diagnostic biologique.");
  }

  async function runAnalysis() {
    if (!state.organizationId || state.loading) return;
    const environmentId = $("sensorEnvironment").value;
    const startDate = $("sensorStartDate").value;
    const endDate = $("sensorEndDate").value;
    const subjectId = $("sensorSubject").value || undefined;
    if (!environmentId || !startDate || !endDate || startDate > endDate) {
      status("Sélectionnez un environnement et une période valide.", true);
      return;
    }
    const revision = state.requestRevision;
    state.loading = true;
    $("sensorRun").disabled = true;
    clearResults();
    status("Analyse des mesures IoT en cours…");
    try {
      const expectedIntervalMinutes = $("sensorExpectedIntervalMinutes").value.trim();
      const temporalWindowMinutes = $("sensorTemporalWindowMinutes").value.trim();
      const temporalMinimumHistory = $("sensorTemporalMinimumHistory").value.trim();
      const temporalThreshold = $("sensorTemporalThreshold").value.trim();
      const flatlineMinimumObservations = $("sensorFlatlineMinimumObservations").value.trim();
      const flatlineMinimumDurationSeconds = $("sensorFlatlineMinimumDurationSeconds").value.trim();
      const transmissionIntervalMinutes = $("sensorTransmissionIntervalMinutes").value.trim();
      const transmissionToleranceFactor = $("sensorTransmissionToleranceFactor").value.trim();
      const flatlineValues = [flatlineMinimumObservations, flatlineMinimumDurationSeconds];
      const flatlineRequested = flatlineValues.some(value => value !== "");
      if (flatlineRequested && flatlineValues.some(value => value === "")) {
        status("Pour activer le dépistage des répétitions exactes, renseignez ensemble le nombre minimal de lectures et la durée minimale.", true);
        return;
      }
      const body = { environment_id: environmentId, start_date: startDate, end_date: endDate, subject_id: subjectId };
      const transmissionValues = [transmissionIntervalMinutes, transmissionToleranceFactor];
      const transmissionRequested = transmissionValues.some(value => value !== "");
      if (transmissionRequested && transmissionValues.some(value => value === "")) {
        status("Pour activer la surveillance des transmissions, renseignez ensemble la cadence attendue et le multiplicateur de tolérance.", true);
        return;
      }
      if (transmissionRequested) {
        const intervalMinutes = Number(transmissionIntervalMinutes);
        const toleranceFactor = Number(transmissionToleranceFactor);
        if (!Number.isSafeInteger(intervalMinutes) || intervalMinutes <= 0 || intervalMinutes > 1440 ||
            !Number.isFinite(toleranceFactor) || toleranceFactor <= 1 || toleranceFactor > 10) {
          status("Réglages de transmission invalides : cadence entière de 1 à 1 440 minutes et tolérance supérieure à 1, jusqu’à 10.", true);
          return;
        }
        body.transmission_expected_interval_seconds = intervalMinutes * 60;
        body.transmission_gap_tolerance_factor = toleranceFactor;
      }

      if (flatlineRequested) {
        const minimumObservations = Number(flatlineMinimumObservations);
        const minimumDurationSeconds = Number(flatlineMinimumDurationSeconds);
        if (!Number.isSafeInteger(minimumObservations) || minimumObservations < 2 ||
            !Number.isSafeInteger(minimumDurationSeconds) || minimumDurationSeconds <= 0) {
          status("Réglages de fiabilité invalides : au moins 2 lectures identiques et une durée entière positive en secondes.", true);
          return;
        }
        body.flatline_minimum_repeated_observations = minimumObservations;
        body.flatline_minimum_duration_seconds = minimumDurationSeconds;
      }
      const temporalValues = [temporalWindowMinutes, temporalMinimumHistory, temporalThreshold];
      const temporalRequested = temporalValues.some(value => value !== "");
      if (temporalRequested && temporalValues.some(value => value === "")) {
        status("Pour activer le dépistage temporel, renseignez ensemble la fenêtre, le minimum historique et le seuil robuste.", true);
        return;
      }
      if (expectedIntervalMinutes !== "") {
        const minutes = Number(expectedIntervalMinutes);
        if (!Number.isSafeInteger(minutes) || minutes <= 0 || minutes > 1440) {
          status("L’intervalle d’échantillonnage attendu doit être un nombre entier de minutes, entre 1 et 1 440.", true);
          return;
        }
        body.expected_interval_seconds = minutes * 60;
      }
      if (temporalRequested) {
        const windowMinutes = Number(temporalWindowMinutes);
        const minimumHistory = Number(temporalMinimumHistory);
        const threshold = Number(temporalThreshold);
        if (!Number.isSafeInteger(windowMinutes) || windowMinutes <= 0 || windowMinutes > 43200 ||
            !Number.isSafeInteger(minimumHistory) || minimumHistory <= 0 ||
            !Number.isFinite(threshold) || threshold <= 0) {
          status("Réglages invalides : fenêtre de 1 à 43 200 minutes, minimum entier positif et seuil robuste positif.", true);
          return;
        }
        body.temporal_window_seconds = windowMinutes * 60;
        body.temporal_minimum_history = minimumHistory;
        body.temporal_threshold = threshold;
      }
      const { data, error } = await client.functions.invoke("sensor-analysis", { body });
      if (revision !== state.requestRevision) return;
      if (error || !data?.ok) {
        const code = data?.error || error?.message || "sensor_analysis_failed";
        const explanations = {
          sensor_profile_unavailable: "Aucun profil de capteurs actif ne couvre toute cette période.",
          sensor_profile_has_no_bound_devices: "Aucun capteur n’est associé au profil environnemental.",
          no_sensor_measurements_in_scope: "Aucune mesure IoT disponible pour cet environnement et cette période.",
          biological_context_unavailable_for_subject_and_scope: "Aucun contexte biologique valide ne couvre cette période pour ce sujet.",
          domain_interpretation_profile_unavailable: "Aucun profil d’interprétation biologique actif ne couvre cette période."
        };
        status(explanations[code] || "Analyse indisponible : " + code, true);
        return;
      }
      renderAnalysis(data.analysis);
    } catch (error) {
      if (revision === state.requestRevision) {
        console.error("[sensor panel] Analysis request failed", error);
        status("Le service d’analyse est momentanément indisponible. Les autres modules restent accessibles.", true);
      }
    } finally {
      if (revision === state.requestRevision) {
        state.loading = false;
        $("sensorRun").disabled = false;
      }
    }
  }

  async function activateContext(context) {
    state.requestRevision += 1;
    const revision = state.requestRevision;
    state.organizationId = context?.organizationId || null;
    state.userId = context?.userId || null;
    state.loading = false;
    if (!state.organizationId) {
      resetTenant();
      return;
    }
    clearResults();
    $("sensorEnvironment").replaceChildren(node("option", "", "Chargement…"));
    $("sensorSubject").replaceChildren(node("option", "", "Analyse environnementale seule"));
    $("sensorRun").disabled = true;
    await loadEnvironments(revision, state.organizationId);
  }

  $("sensorEnvironment").addEventListener("change", loadBiologicalContexts);
  $("sensorRun").addEventListener("click", runAnalysis);
  $("sensorStartDate").value = today;
  $("sensorEndDate").value = today;
  window.addEventListener("balabs:organization-context", event => activateContext(event.detail || {}));

  (async () => {
    try {
      const { data } = await client.auth.getSession();
      const organizationId = window.BALabsGetOrganizationId?.();
      if (data?.session?.user?.id && organizationId && !state.organizationId) {
        await activateContext({ organizationId, userId: data.session.user.id });
      }
    } catch (error) {
      console.warn("[sensor panel] Initial session check failed", error);
    }
  })();
})();