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
  const methodLabels = {
    environmental_daily: "Climat quotidien (source externe)",
    sensor_series: "Résumé de série IoT",
    sensor_temporal: "Anomalie temporelle IoT (MAD robuste)"
  };
  const PAGE_SIZE = 100;
  const state = { userId: null, organizationId: null, domain: null, rows: [], filter: "active", severity: "all", method: "all", variable: "", request: 0, offset: 0, hasMore: false, loading: false, historyRequest: 0 };
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

  const flattenInterpretationPayload = (value, prefix = "", output = {}, depth = 0) => {
    if (depth > 6 || Object.keys(output).length >= 100) return output;
    if (value === null || value === undefined) {
      if (prefix) output[prefix] = value;
      return output;
    }
    if (Array.isArray(value)) {
      if (value.every(item => item === null || ["string", "number", "boolean"].includes(typeof item))) {
        output[prefix || "payload"] = JSON.stringify(value);
      } else {
        value.slice(0, 30).forEach((item, index) =>
          flattenInterpretationPayload(item, prefix + "[" + index + "]", output, depth + 1));
      }
      return output;
    }
    if (typeof value === "object") {
      Object.keys(value).sort().forEach(key => {
        if (["recorded_at", "created_at", "updated_at", "generated_at"].includes(key)) return;
        flattenInterpretationPayload(value[key], prefix ? prefix + "." + key : key, output, depth + 1);
      });
      return output;
    }
    if (prefix) output[prefix] = value;
    return output;
  };

  const compareInterpretationSnapshots = (older, newer) => {
    if (!older || !newer || older.source_signal_id !== newer.source_signal_id || older.engine_code !== newer.engine_code) return null;
    const before = flattenInterpretationPayload(older.interpretation_payload || {});
    const after = flattenInterpretationPayload(newer.interpretation_payload || {});
    const paths = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    const changes = paths.filter(path => JSON.stringify(before[path]) !== JSON.stringify(after[path]))
      .slice(0, 40).map(path => ({
        path,
        category: path.startsWith("evidence.") || path.includes(".evidence.") ? "preuves"
          : path.startsWith("finding.") ? "constat"
            : path.startsWith("interpretation.") ? "conclusion" : "contexte",
        previous: Object.prototype.hasOwnProperty.call(before, path) ? before[path] : "[absent]",
        current: Object.prototype.hasOwnProperty.call(after, path) ? after[path] : "[absent]"
      }));
    return {
      previous_engine_version: older.engine_version || "inconnue",
      current_engine_version: newer.engine_version || "inconnue",
      status_changed: older.interpretation_status !== newer.interpretation_status,
      previous_status: older.interpretation_status || "inconnu",
      current_status: newer.interpretation_status || "inconnu",
      category_counts: changes.reduce((counts, change) => {
        counts[change.category] = (counts[change.category] || 0) + 1;
        return counts;
      }, {}),
      changes,
      compared_field_count: paths.length,
      truncated: paths.length > 100 || changes.length >= 40
    };
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
      if (state.filter === "active" && !["open", "acknowledged"].includes(row.signal_status)) return false;
      if (state.filter === "resolved" && row.signal_status !== "resolved") return false;
      if (state.filter === "dismissed" && row.signal_status !== "dismissed") return false;
      if (state.severity !== "all" && row.severity !== state.severity) return false;
      if (state.method !== "all" && row.analysis_method !== state.method) return false;
      if (state.variable && !(row.variable_code || "").toLowerCase().includes(state.variable)) return false;
      return true;
    });
    const loadMore = $("signalsLoadMore");
    loadMore.classList.toggle("hidden", !state.hasMore);
    loadMore.disabled = state.loading;
    loadMore.textContent = state.loading ? "Chargement…" : "Charger 100 signaux supplémentaires";
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
        ["Règle", row.rule_id],
        ["Code recommandation", row.recommendation_code],
        ["Profil biologique", row.domain_profile_code && row.domain_profile_version ? row.domain_profile_code + " / v" + row.domain_profile_version : null],
        ["Profil environnemental", row.environment_profile_code && row.environment_profile_version ? row.environment_profile_code + " / v" + row.environment_profile_version : null],
        ["Analyse source", row.source_analysis_id],
        ["Constat source", row.source_finding_id],
        ["Observations sources", Array.isArray(row.source_observation_ids) && row.source_observation_ids.length
          ? row.source_observation_ids.slice(0, 5).join(", ") + (row.source_observation_ids.length > 5 ? " … (+" + (row.source_observation_ids.length - 5) + ")" : "")
          : null],
        ["Méthode d’analyse", methodLabels[row.analysis_method] || row.analysis_method],
        ["Médiane de référence", Number.isFinite(row.analysis_evidence?.baseline_median) ? String(row.analysis_evidence.baseline_median) + (row.unit ? " " + row.unit : "") : null],
        ["MAD de référence", Number.isFinite(row.analysis_evidence?.baseline_mad) ? String(row.analysis_evidence.baseline_mad) + (row.unit ? " " + row.unit : "") : null],
        ["Score robuste", Number.isFinite(row.analysis_evidence?.robust_z_score) ? String(row.analysis_evidence.robust_z_score) : null],
        ["Historique utilisé", Number.isInteger(row.analysis_evidence?.history_count) ? String(row.analysis_evidence.history_count) : null],
        ["Fenêtre temporelle", Number.isInteger(row.analysis_evidence?.temporal_window_seconds) ? String(row.analysis_evidence.temporal_window_seconds) + " s" : null],
        ["Historique minimum", Number.isInteger(row.analysis_evidence?.temporal_minimum_history) ? String(row.analysis_evidence.temporal_minimum_history) : null],
        ["Seuil statistique", Number.isFinite(row.analysis_evidence?.temporal_threshold) ? String(row.analysis_evidence.temporal_threshold) : null],
        ["Indicateurs statistiques", Array.isArray(row.analysis_evidence?.flags) && row.analysis_evidence.flags.length ? row.analysis_evidence.flags.join(", ") : null]
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
      const historyActions = element("div", "signal-history-actions");
      if (row.biological_subject_id) {
        const subjectButton = element("button", "secondary-button", "Historique du sujet");
        subjectButton.type = "button";
        subjectButton.addEventListener("click", () => loadHistory("biological_subject_id", row.biological_subject_id, "Sujet biologique"));
        historyActions.append(subjectButton);
      }
      if (row.environment_id) {
        const environmentButton = element("button", "secondary-button", "Historique de l’environnement");
        environmentButton.type = "button";
        environmentButton.addEventListener("click", () => loadHistory("environment_id", row.environment_id, "Environnement"));
        historyActions.append(environmentButton);
      }
      card.append(header, detail);
      if (metadata.childNodes.length) card.append(metadata);
      card.append(footer);
      if (historyActions.childNodes.length) card.append(historyActions);
      list.append(card);
    });
  }

  async function loadSignals({ append = false } = {}) {
    if (!state.userId || !state.organizationId || !state.domain || state.loading) return;
    if (!append) {
      state.request++;
      state.offset = 0;
      state.hasMore = false;
      state.rows = [];
    }
    const request = state.request;
    const pageOffset = state.offset;
    state.loading = true;
    render();
    notify("Chargement des signaux biologiques…");
    const { data, error } = await client
      .from("biological_signals")
      .select("signal_id,domain,signal_code,severity,message_code,recommendation_code,rule_id,source_analysis_id,source_finding_id,biological_context_id,biological_subject_id,environment_id,domain_profile_code,domain_profile_version,environment_profile_code,environment_profile_version,source_observation_ids,variable_code,observed_date,observed_value,unit,analysis_method,analysis_evidence,signal_status,first_seen_at,acknowledged_at,resolved_at,dismissed_at")
      .eq("organization_id", state.organizationId)
      .eq("domain", state.domain)
      .order("first_seen_at", { ascending: false })
      .range(pageOffset, pageOffset + PAGE_SIZE - 1);
    if (request !== state.request) return;
    state.loading = false;
    if (error) {
      console.error("[CultureOps signals] Read failed", error.message);
      render();
      notify("Impossible de charger les signaux. Vérifiez les droits d’accès et la connexion.", true);
      return;
    }
    const page = data || [];
    state.rows = append ? state.rows.concat(page) : page;
    state.offset += page.length;
    state.hasMore = page.length === PAGE_SIZE;
    render();
    notify(state.rows.length + " signal(aux) chargé(s)." + (state.hasMore ? " D’autres signaux sont disponibles." : ""));
  }

  async function resolveHistoryIdentity(kind, id, organizationId, domain) {
    if (kind === "environment_id") {
      const { data } = await client.from("environments")
        .select("name,location:locations(name,code)")
        .eq("organization_id", organizationId).eq("id", id).maybeSingle();
      const location = data?.location;
      return { title: data?.name || "Environnement", subtitle: location ? "Site : " + (location.name || location.code) : "Environnement de production" };
    }
    if (domain === "greentech") {
      const { data } = await client.from("plant_cultures")
        .select("code,crop_type,species_name,cultivar_name,status")
        .eq("organization_id", organizationId).eq("id", id).maybeSingle();
      return { title: data?.code || "Culture végétale", subtitle: [data?.species_name, data?.cultivar_name, data?.crop_type, data?.status].filter(Boolean).join(" · ") };
    }
    const [cultureResult, batchResult] = await Promise.all([
      client.from("cultures")
        .select("code,culture_type,material:materials(material_code,strain:strains(strain_code,designation,organism:organisms(scientific_name)))")
        .eq("organization_id", organizationId).eq("id", id).maybeSingle(),
      client.from("batches")
        .select("batch_code,name,status,current_stage")
        .eq("organization_id", organizationId).eq("culture_id", id)
        .order("created_at", { ascending: false }).limit(10)
    ]);
    const culture = cultureResult.data;
    const material = culture?.material;
    const strain = material?.strain;
    const organism = strain?.organism;
    const batches = (batchResult.data || []).map(batch => [batch.batch_code, batch.name, batch.status, batch.current_stage].filter(Boolean).join(" / "));
    return {
      title: culture?.code || "Culture biologique",
      subtitle: [culture?.culture_type, material?.material_code, strain?.strain_code || strain?.designation, organism?.scientific_name, batches.length ? "Lots : " + batches.join(", ") : null].filter(Boolean).join(" · ")
    };
  }

  async function resolveCultureLineage(cultureId, organizationId) {
    const columns = "id,code,culture_type,parent_culture_id,started_at,created_at,material:materials(id,material_code,material_type,parent_material_id,strain_id,generation,state,metadata,strain:strains(id,strain_code,designation,origin,supplier,source_description,organism:organisms(scientific_name)))";
    const MAX_ANCESTORS = 8;
    const MAX_DESCENDANT_DEPTH = 5;
    const MAX_CULTURES = 100;
    const qualityIssues = [];
    const markIncomplete = (stage, error) => qualityIssues.push({
      stage,
      code: error?.code || error?.name || "query_failed",
      message: error?.message || String(error || "Lecture incomplète")
    });
    const seen = new Set();
    const byId = new Map();
    let current = null;
    const currentResult = await client.from("cultures").select(columns)
      .eq("organization_id", organizationId).eq("id", cultureId).maybeSingle();
    if (currentResult.error || !currentResult.data) {
      if (currentResult.error) markIncomplete("current_culture", currentResult.error);
      return { cultures: [], materials: [], relationships: [], batches: [], events: [], unavailable: true,
        lineageQuality: { complete: false, issues: qualityIssues } };
    }
    current = currentResult.data;
    byId.set(current.id, current);
    seen.add(current.id);

    // Walk the parent chain, bounded and tenant-scoped.
    let cursor = current;
    for (let depth = 0; depth < MAX_ANCESTORS && cursor.parent_culture_id && byId.size < MAX_CULTURES; depth++) {
      const parentId = cursor.parent_culture_id;
      if (seen.has(parentId)) break;
      const result = await client.from("cultures").select(columns)
        .eq("organization_id", organizationId).eq("id", parentId).maybeSingle();
      if (result.error) { markIncomplete("culture_ancestors", result.error); break; }
      if (!result.data) { markIncomplete("culture_ancestor_missing", { message: "Culture parente référencée introuvable dans l’organisation" }); break; }
      cursor = result.data;
      seen.add(cursor.id);
      byId.set(cursor.id, cursor);
    }
    if (cursor.parent_culture_id && !seen.has(cursor.parent_culture_id) && byId.size < MAX_CULTURES && !qualityIssues.some(issue => issue.stage === "culture_ancestors")) {
      markIncomplete("culture_ancestor_depth_limit", { message: "Profondeur maximale des ancêtres atteinte" });
    }

    // Walk descendants breadth-first; one batched query per generation, not N+1.
    let frontier = [cursor.id];
    for (let depth = 0; depth < MAX_DESCENDANT_DEPTH && frontier.length && byId.size < MAX_CULTURES; depth++) {
      const room = MAX_CULTURES - byId.size;
      const result = await client.from("cultures").select(columns)
        .eq("organization_id", organizationId).in("parent_culture_id", frontier)
        .order("started_at", { ascending: true }).limit(Math.min(room, 100));
      if (result.error) { markIncomplete("culture_descendants", result.error); break; }
      const next = [];
      for (const child of result.data || []) {
        if (seen.has(child.id) || byId.size >= MAX_CULTURES) continue;
        seen.add(child.id);
        byId.set(child.id, child);
        next.push(child.id);
      }
      frontier = next;
    }
    if (frontier.length && byId.size < MAX_CULTURES && !qualityIssues.some(issue => issue.stage === "culture_descendants")) {
      markIncomplete("culture_descendant_depth_limit", { message: "Profondeur maximale des descendants atteinte" });
    }

    const cultures = [...byId.values()].sort((a, b) => {
      const ga = Number.isFinite(a.material?.generation) ? a.material.generation : Number.MAX_SAFE_INTEGER;
      const gb = Number.isFinite(b.material?.generation) ? b.material.generation : Number.MAX_SAFE_INTEGER;
      return ga - gb || String(a.started_at || a.created_at || "").localeCompare(String(b.started_at || b.created_at || ""));
    });
    const cultureIds = cultures.map(item => item.id);
    const materialById = new Map();
    const materialSeen = new Set();
    const initialMaterialIds = cultures.map(item => item.material?.id).filter(Boolean);
    let materialFrontier = [...new Set(initialMaterialIds)];
    const MAX_MATERIAL_DEPTH = 8;
    const MAX_MATERIALS = 150;
    // Material ancestry and descendants are independent of culture ancestry.
    for (let depth = 0; depth < MAX_MATERIAL_DEPTH && materialFrontier.length && materialById.size < MAX_MATERIALS; depth++) {
      const room = MAX_MATERIALS - materialById.size;
      const ids = materialFrontier.filter(id => !materialSeen.has(id)).slice(0, room);
      if (!ids.length) break;
      ids.forEach(id => materialSeen.add(id));
      const result = await client.from("materials")
        .select("id,material_code,material_type,parent_material_id,strain_id,generation,state,metadata,strain:strains(id,strain_code,designation,origin,supplier,source_description,organism:organisms(scientific_name))")
        .eq("organization_id", organizationId).in("id", ids);
      if (result.error) { markIncomplete("material_ancestors", result.error); break; }
      const rows = result.data || [];
      rows.forEach(row => materialById.set(row.id, row));
      materialFrontier = rows.map(row => row.parent_material_id).filter(id => id && !materialSeen.has(id));
    }
    if (materialFrontier.length && materialById.size < MAX_MATERIALS && !qualityIssues.some(issue => issue.stage === "material_ancestors")) {
      markIncomplete("material_ancestor_depth_limit", { message: "Profondeur maximale des matériaux parents atteinte" });
    }
    // Expand descendants from every material already linked to the culture family.
    materialFrontier = [...new Set(initialMaterialIds)];
    for (let depth = 0; depth < 5 && materialFrontier.length && materialById.size < MAX_MATERIALS; depth++) {
      const room = MAX_MATERIALS - materialById.size;
      const result = await client.from("materials")
        .select("id,material_code,material_type,parent_material_id,strain_id,generation,state,metadata,strain:strains(id,strain_code,designation,origin,supplier,source_description,organism:organisms(scientific_name))")
        .eq("organization_id", organizationId).in("parent_material_id", materialFrontier)
        .order("created_at", { ascending: true }).limit(Math.min(room, 100));
      if (result.error) { markIncomplete("material_descendants", result.error); break; }
      const next = [];
      for (const row of result.data || []) {
        if (materialSeen.has(row.id) || materialById.has(row.id) || materialById.size >= MAX_MATERIALS) continue;
        materialSeen.add(row.id);
        materialById.set(row.id, row);
        next.push(row.id);
      }
      materialFrontier = next;
    }
    if (materialFrontier.length && materialById.size < MAX_MATERIALS && !qualityIssues.some(issue => issue.stage === "material_descendants")) {
      markIncomplete("material_descendant_depth_limit", { message: "Profondeur maximale des descendants matière atteinte" });
    }
    // Expand the explicit material graph in both directions. The relationship table
    // supports multiple parents; parent_material_id remains a legacy single-parent edge.
    const MAX_RELATIONSHIP_DEPTH = 5;
    const MAX_RELATIONSHIPS = 300;
    const relationshipByKey = new Map();
    let relationshipFrontier = [...materialById.keys()];
    const relationshipSeen = new Set(relationshipFrontier);
    for (let depth = 0; depth < MAX_RELATIONSHIP_DEPTH && relationshipFrontier.length && materialById.size < MAX_MATERIALS; depth++) {
      const ids = relationshipFrontier.slice(0, 100);
      const result = await client.from("material_relationships")
        .select("parent_material_id,child_material_id,relationship_type,created_at")
        .eq("organization_id", organizationId)
        .or("parent_material_id.in.(" + ids.join(",") + "),child_material_id.in.(" + ids.join(",") + ")")
        .limit(MAX_RELATIONSHIPS);
      if (result.error) { markIncomplete("material_relationships", result.error); break; }
      const nextIds = new Set();
      for (const edge of result.data || []) {
        const key = [edge.parent_material_id, edge.child_material_id, edge.relationship_type].join(":");
        relationshipByKey.set(key, edge);
        for (const endpointId of [edge.parent_material_id, edge.child_material_id]) {
          if (!materialById.has(endpointId) && materialById.size + nextIds.size < MAX_MATERIALS) nextIds.add(endpointId);
        }
      }
      const hydrateIds = [...nextIds];
      if (hydrateIds.length) {
        const hydrated = await client.from("materials")
          .select("id,material_code,material_type,parent_material_id,strain_id,generation,state,metadata,strain:strains(id,strain_code,designation,origin,supplier,source_description,organism:organisms(scientific_name))")
          .eq("organization_id", organizationId).in("id", hydrateIds);
        if (hydrated.error) markIncomplete("relationship_material_hydration", hydrated.error);
        else (hydrated.data || []).forEach(material => materialById.set(material.id, material));
      }
      relationshipFrontier = hydrateIds.filter(id => !relationshipSeen.has(id));
      relationshipFrontier.forEach(id => relationshipSeen.add(id));
    }
    if (relationshipFrontier.length && materialById.size < MAX_MATERIALS && relationshipByKey.size < MAX_RELATIONSHIPS && !qualityIssues.some(issue => issue.stage === "material_relationships")) {
      markIncomplete("material_relationship_depth_limit", { message: "Profondeur maximale du graphe de relations atteinte" });
    }
    // Hydrate any legacy parent pointer not represented by an explicit relationship row.
    const unresolvedLegacyParents = [...new Set([...materialById.values()]
      .map(material => material.parent_material_id)
      .filter(id => id && !materialById.has(id)))].slice(0, MAX_MATERIALS - materialById.size);
    if (unresolvedLegacyParents.length) {
      const legacyParents = await client.from("materials")
        .select("id,material_code,material_type,parent_material_id,strain_id,generation,state,metadata,strain:strains(id,strain_code,designation,origin,supplier,source_description,organism:organisms(scientific_name))")
        .eq("organization_id", organizationId).in("id", unresolvedLegacyParents);
      if (legacyParents.error) markIncomplete("legacy_parent_hydration", legacyParents.error);
      else (legacyParents.data || []).forEach(material => materialById.set(material.id, material));
    }
    const materialIds = [...materialById.keys()];
    // Keep legacy parent pointers visible even when no explicit edge row exists.
    for (const material of materialById.values()) {
      if (!material.parent_material_id) continue;
      const keyPrefix = material.parent_material_id + ":" + material.id + ":";
      if (![...relationshipByKey.keys()].some(key => key.startsWith(keyPrefix))) {
        const parent = materialById.get(material.parent_material_id);
        relationshipByKey.set(keyPrefix + "parent_material_id", {
          parent_material_id: material.parent_material_id,
          child_material_id: material.id,
          relationship_type: "parent_material_id",
          created_at: null,
          legacy_pointer: true,
          parent_material_code: parent?.material_code || null
        });
      }
    }
    const relationships = [...relationshipByKey.values()].slice(0, MAX_RELATIONSHIPS);
    const [batchResult, cultureEventResult, materialEventResult, measurementResult, observationResult, signalResult, interpretationResult] = await Promise.all([
      client.from("batches").select("batch_code,name,status,current_stage,culture_id,material_id")
        .eq("organization_id", organizationId)
        .or("culture_id.in.(" + cultureIds.join(",") + "),material_id.in.(" + materialIds.join(",") + ")")
        .order("created_at", { ascending: false }).limit(100),
      client.from("events").select("id,event_type,occurred_at,culture_id,material_id,location_id,environment_id,payload")
        .eq("organization_id", organizationId).in("culture_id", cultureIds)
        .order("occurred_at", { ascending: true }).limit(200),
      client.from("events").select("id,event_type,occurred_at,culture_id,material_id,location_id,environment_id,payload")
        .eq("organization_id", organizationId).in("material_id", materialIds)
        .order("occurred_at", { ascending: true }).limit(200),
      client.from("measurements").select("id,variable_code,raw_value,raw_unit_code,normalized_value,normalized_unit_code,measured_at,method,instrument,quality_state,culture_id,event_id,result_id,metadata")
        .eq("organization_id", organizationId).in("culture_id", cultureIds)
        .order("measured_at", { ascending: true }).limit(500),
      client.from("observations").select("id,variable_code,value_text,observed_at,quality_state,culture_id,event_id,metadata")
        .eq("organization_id", organizationId).in("culture_id", cultureIds)
        .order("observed_at", { ascending: true }).limit(500),
      client.from("biological_signals").select("signal_id,biological_subject_id,environment_id,signal_code,severity,message_code,recommendation_code,rule_id,source_analysis_id,source_finding_id,source_observation_ids,variable_code,observed_date,observed_value,unit,analysis_method,analysis_evidence,first_seen_at")
        .eq("organization_id", organizationId).eq("domain", domainByWorkspace[document.body.dataset.domain] || "mycology")
        .in("biological_subject_id", cultureIds).order("first_seen_at", { ascending: true }).limit(200),
      client.from("biological_interpretations").select("interpretation_id,domain,biological_subject_id,source_signal_id,source_analysis_id,source_finding_id,engine_code,engine_version,interpretation_status,interpretation_payload,recorded_at")
        .eq("organization_id", organizationId).eq("domain", domainByWorkspace[document.body.dataset.domain] || "mycology")
        .in("biological_subject_id", cultureIds).order("recorded_at", { ascending: false }).limit(500)
    ]);
    if (batchResult.error) markIncomplete("batches", batchResult.error);
    if (cultureEventResult.error) markIncomplete("culture_events", cultureEventResult.error);
    if (materialEventResult.error) markIncomplete("material_events", materialEventResult.error);
    if (measurementResult.error) markIncomplete("measurements", measurementResult.error);
    if (observationResult.error) markIncomplete("observations", observationResult.error);
    if (signalResult.error) markIncomplete("biological_signals", signalResult.error);
    if (interpretationResult.error) markIncomplete("biological_interpretations", interpretationResult.error);
    const eventsById = new Map();
    [...(cultureEventResult.data || []), ...(materialEventResult.data || [])].forEach(event => eventsById.set(event.id, event));
    const events = [...eventsById.values()].sort((x, y) => String(x.occurred_at).localeCompare(String(y.occurred_at)));
    const locationIds = [...new Set(events.map(event => event.location_id).filter(Boolean))];
    let environmentalObservations = [];
    let environmentalAvailable = false;
    if (locationIds.length) {
      const eventTimes = events.map(event => new Date(event.occurred_at).getTime()).filter(Number.isFinite);
      const from = eventTimes.length ? new Date(Math.min(...eventTimes) - 86400000).toISOString() : null;
      const to = eventTimes.length ? new Date(Math.max(...eventTimes) + 86400000).toISOString() : null;
      let query = client.from("environmental_observations")
        .select("id,location_id,data_family,provider_code,dataset_code,variable_code,value,unit_code,observed_at,quality_flag,metadata")
        .eq("organization_id", organizationId).in("location_id", locationIds)
        .order("observed_at", { ascending: true }).limit(500);
      if (from && to) query = query.gte("observed_at", from).lte("observed_at", to);
      const environmentalResult = await query;
      environmentalAvailable = !environmentalResult.error;
      if (environmentalResult.error) markIncomplete("environmental_observations", environmentalResult.error);
      else environmentalObservations = environmentalResult.data || [];
    }
    const measurements = measurementResult.error ? [] : (measurementResult.data || []);
    const observations = observationResult.error ? [] : (observationResult.data || []);
    const biologicalSignals = signalResult.error ? [] : (signalResult.data || []);
    const biologicalInterpretations = interpretationResult.error ? [] : (interpretationResult.data || []);
    const interpretationIds = biologicalInterpretations.map(item => item.interpretation_id);
    let biologicalInterpretationEvents = [];
    let interpretationEventsAvailable = true;
    if (interpretationIds.length) {
      const interpretationEventResult = await client.from("biological_interpretation_events")
        .select("interpretation_id,event_id,event_type,actor_kind,actor_id,occurred_at,event_payload")
        .eq("organization_id", organizationId).in("interpretation_id", interpretationIds)
        .order("occurred_at", { ascending: false }).limit(2000);
      interpretationEventsAvailable = !interpretationEventResult.error;
      if (interpretationEventResult.error) {
        markIncomplete("biological_interpretation_events", interpretationEventResult.error);
      } else {
        biologicalInterpretationEvents = interpretationEventResult.data || [];
        if (biologicalInterpretationEvents.length >= 2000) {
          interpretationEventsAvailable = false;
          markIncomplete("biological_interpretation_events", {
            message: "Interpretation event history reached the 2000-row read limit."
          });
        }
      }
    }
    const resultIds = [...new Set(measurements.map(item => item.result_id).filter(Boolean))];
    let experimentalResults = [];
    let resultsAvailable = resultIds.length > 0;
    if (resultIds.length) {
      const resultQuery = await client.from("results")
        .select("id,code,result_type,value,quality_state,experiment_id,experimental_unit_id,created_at")
        .eq("organization_id", organizationId).in("id", resultIds).limit(200);
      resultsAvailable = !resultQuery.error;
      if (resultQuery.error) markIncomplete("experimental_results", resultQuery.error);
      else experimentalResults = resultQuery.data || [];
    }
    const evidenceAvailability = {
      measurements: !measurementResult.error,
      observations: !observationResult.error,
      biological_signals: !signalResult.error,
      biological_interpretations: !interpretationResult.error,
      biological_interpretation_events: interpretationEventsAvailable,
      experimental_results: resultsAvailable,
      environmental_observations: environmentalAvailable
    };
    return {
      cultures,
      materials: [...materialById.values()],
      relationships,
      batches: batchResult.error ? [] : (batchResult.data || []),
      events,
      evidence: {
        measurements, observations, biological_signals: biologicalSignals,
        biological_interpretations: biologicalInterpretations,
        biological_interpretation_events: biologicalInterpretationEvents,
        experimental_results: experimentalResults,
        environmental_observations: environmentalObservations
      },
      evidenceAvailability,
      lineageQuality: { complete: qualityIssues.length === 0, issues: qualityIssues },
      unavailable: false,
      truncated: byId.size >= MAX_CULTURES || materialById.size >= MAX_MATERIALS || relationshipByKey.size >= MAX_RELATIONSHIPS ||
        measurements.length >= 500 || observations.length >= 500 || biologicalSignals.length >= 200 ||
        biologicalInterpretations.length >= 500 || biologicalInterpretationEvents.length >= 2000 || environmentalObservations.length >= 500
    };
  }

  // Pure, bounded query layer over a loaded biological lineage snapshot.
  function buildBiologicalProvenanceIndex(lineage) {
    const materials = Array.isArray(lineage?.materials) ? lineage.materials : [];
    const edges = Array.isArray(lineage?.relationships) ? lineage.relationships : [];
    const events = Array.isArray(lineage?.events) ? lineage.events : [];
    const materialById = new Map(materials.map(material => [material.id, material]));
    const incoming = new Map();
    const outgoing = new Map();
    const edgeKeys = new Set();
    const graphPairKeys = new Set();
    const operationSourcePairs = new Set();
    const addEdge = (parentId, childId, type = "parent_material_id", legacy = false) => {
      if (!parentId || !childId || parentId === childId) return;
      const key = [parentId, childId, type].join(":");
      if (edgeKeys.has(key)) return;
      edgeKeys.add(key);
      const pairKey = [parentId, childId].join(":");
      // Typed records remain auditable, but a source→output pair is traversed once.
      if (graphPairKeys.has(pairKey)) return;
      graphPairKeys.add(pairKey);
      const edge = { parent_material_id: parentId, child_material_id: childId, relationship_type: type, legacy_pointer: legacy };
      if (!incoming.has(childId)) incoming.set(childId, []);
      if (!outgoing.has(parentId)) outgoing.set(parentId, []);
      incoming.get(childId).push(edge);
      outgoing.get(parentId).push(edge);
    };
    edges.forEach(edge => addEdge(edge.parent_material_id, edge.child_material_id, edge.relationship_type, Boolean(edge.legacy_pointer)));
    materials.forEach(material => {
      if (material.parent_material_id) addEdge(material.parent_material_id, material.id, "parent_material_id", true);
    });
    // Operation payloads provide a second, auditable path for multi-source provenance.
    // Keep these edges directional: each source material contributes to the event output.
    events.forEach(event => {
      const payload = event.payload && typeof event.payload === "object" ? event.payload : {};
      const sourceIds = Array.isArray(payload.source_material_ids) ? payload.source_material_ids : [];
      const operation = payload.operation || payload.operation_type || event.event_type || "unspecified";
      if (!event.material_id) return;
      sourceIds.forEach(sourceId => {
        operationSourcePairs.add([sourceId, event.material_id].join(":"));
        addEdge(sourceId, event.material_id, "operation_source:" + String(operation), false);
      });
    });
    const eventsByMaterial = new Map();
    events.forEach(event => {
      if (!event.material_id) return;
      if (!eventsByMaterial.has(event.material_id)) eventsByMaterial.set(event.material_id, []);
      eventsByMaterial.get(event.material_id).push(event);
    });
    const evidence = lineage?.evidence || {};
    const measurements = Array.isArray(evidence.measurements) ? evidence.measurements : [];
    const observations = Array.isArray(evidence.observations) ? evidence.observations : [];
    const biologicalSignals = Array.isArray(evidence.biological_signals) ? evidence.biological_signals : [];
    const biologicalInterpretations = Array.isArray(evidence.biological_interpretations) ? evidence.biological_interpretations : [];
    const biologicalInterpretationEvents = Array.isArray(evidence.biological_interpretation_events) ? evidence.biological_interpretation_events : [];
    const environmentalObservations = Array.isArray(evidence.environmental_observations) ? evidence.environmental_observations : [];
    const experimentalResults = Array.isArray(evidence.experimental_results) ? evidence.experimental_results : [];
    const cultures = Array.isArray(lineage?.cultures) ? lineage.cultures : [];
    const getCultureEvidence = cultureId => {
      const cultureEvents = events.filter(event => event.culture_id === cultureId);
      const cultureEventIds = new Set(cultureEvents.map(event => event.id));
      const locations = new Map(cultureEvents.filter(event => event.location_id).map(event => [event.location_id, cultureEvents
        .filter(candidate => candidate.location_id === event.location_id)]));
      const environmentalContext = [];
      locations.forEach((locationEvents, locationId) => {
        const matching = environmentalObservations.filter(item => item.location_id === locationId &&
          locationEvents.some(event => {
            const delta = Math.abs(new Date(item.observed_at).getTime() - new Date(event.occurred_at).getTime());
            return Number.isFinite(delta) && delta <= 86400000;
          }));
        matching.forEach(item => environmentalContext.push({ ...item, association_type: "temporal_location_context" }));
      });
      const cultureMeasurements = measurements.filter(item =>
        item.culture_id === cultureId || (item.event_id && cultureEventIds.has(item.event_id)));
      const cultureObservations = observations.filter(item =>
        item.culture_id === cultureId || (item.event_id && cultureEventIds.has(item.event_id)));
      const cultureSignals = biologicalSignals.filter(item => item.biological_subject_id === cultureId);
      const cultureInterpretations = biologicalInterpretations.filter(item => item.biological_subject_id === cultureId);
      const cultureInterpretationIds = new Set(cultureInterpretations.map(item => item.interpretation_id));
      const cultureInterpretationEvents = biologicalInterpretationEvents.filter(item => cultureInterpretationIds.has(item.interpretation_id));
      const cultureResults = experimentalResults.filter(result =>
        cultureMeasurements.some(item => item.result_id === result.id));
      const summarizeTimeSeries = (items, valueField, timeField, unitField) => {
        const groups = new Map();
        items.forEach(item => {
          const rawValue = item[valueField];
          const timestamp = item[timeField];
          if (rawValue === null || rawValue === undefined || rawValue === "") return;
          const value = Number(rawValue);
          if (!Number.isFinite(value) || !timestamp || !Number.isFinite(new Date(timestamp).getTime())) return;
          const variable = item.variable_code || "unspecified";
          const unit = item[unitField] || null;
          const key = variable + "::" + (unit || "");
          if (!groups.has(key)) groups.set(key, { variable_code: variable, unit, points: [] });
          groups.get(key).points.push({ value, observed_at: timestamp });
        });
        return [...groups.values()].map(group => {
          const points = group.points.sort((a, b) => new Date(a.observed_at) - new Date(b.observed_at));
          const values = points.map(point => point.value);
          const first = points[0];
          const last = points[points.length - 1];
          const delta = last.value - first.value;
          return {
            variable_code: group.variable_code,
            unit: group.unit,
            sample_count: points.length,
            first_observed_at: first.observed_at,
            last_observed_at: last.observed_at,
            first_value: first.value,
            last_value: last.value,
            minimum: Math.min(...values),
            maximum: Math.max(...values),
            delta,
            direction: delta > 0 ? "increasing" : delta < 0 ? "decreasing" : "stable_between_endpoints",
            temporal_resolution: points.length > 1 ? "multiple_observations" : "single_observation"
          };
        });
      };
      const culture = cultures.find(item => item.id === cultureId) || null;
      const cultureBatches = batches.filter(batch =>
        batch.culture_id === cultureId || (culture?.material?.id && batch.material_id === culture.material.id));
      const currentBatch = cultureBatches[0] || null;
      const biologicalContext = {
        culture_id: cultureId,
        culture_code: culture?.code || null,
        culture_type: culture?.culture_type || null,
        started_at: culture?.started_at || null,
        material_id: culture?.material?.id || null,
        material_code: culture?.material?.material_code || null,
        material_type: culture?.material?.material_type || null,
        generation: culture?.material?.generation ?? null,
        strain_id: culture?.material?.strain_id || culture?.material?.strain?.id || null,
        strain_code: culture?.material?.strain?.strain_code || null,
        organism_name: culture?.material?.strain?.organism?.scientific_name || null,
        batch_code: currentBatch?.batch_code || null,
        batch_status: currentBatch?.status || null,
        current_stage: currentBatch?.current_stage || null,
        batch_context_is_current: Boolean(currentBatch)
      };
      const measurementTrends = summarizeTimeSeries(cultureMeasurements, "normalized_value", "measured_at", "normalized_unit_code");
      const environmentalTrends = summarizeTimeSeries(environmentalContext, "value", "observed_at", "unit_code");
      const environmentalSummary = {
        observation_count: environmentalContext.length,
        temporal_trends: environmentalTrends,
        variables: [...new Set(environmentalContext.map(item => item.variable_code).filter(Boolean))],
        first_observed_at: environmentalContext.map(item => item.observed_at).filter(Boolean).sort()[0] || null,
        last_observed_at: environmentalContext.map(item => item.observed_at).filter(Boolean).sort().slice(-1)[0] || null,
        association_type: "temporal_location_context",
        causal_relationship_established: false
      };
      const observationById = new Map(cultureObservations.map(item => [item.id, item]));
      const temporalEvidenceForFinding = signal => {
        const anchor = signal.observed_date || signal.first_seen_at;
        const anchorTime = anchor ? new Date(anchor).getTime() : NaN;
        const withinWindow = (timestamp) => {
          const observedTime = timestamp ? new Date(timestamp).getTime() : NaN;
          return Number.isFinite(anchorTime) && Number.isFinite(observedTime) &&
            Math.abs(observedTime - anchorTime) <= 86400000;
        };
        const linkedObservations = (Array.isArray(signal.source_observation_ids) ? signal.source_observation_ids : [])
          .map(id => observationById.get(id)).filter(Boolean);
        const nearbyMeasurements = Number.isFinite(anchorTime) ?
          cultureMeasurements.filter(item => withinWindow(item.measured_at)) : [];
        const nearbyEnvironmental = Number.isFinite(anchorTime) ?
          environmentalContext.filter(item => withinWindow(item.observed_at)) : [];
        return {
          anchor_at: anchor || null,
          window_hours: 24,
          linked_observation_ids: linkedObservations.map(item => item.id),
          nearby_measurement_ids: nearbyMeasurements.map(item => item.id),
          nearby_environmental_observation_ids: nearbyEnvironmental.map(item => item.id),
          temporal_association_only: true,
          causal_relationship_established: false
        };
      };
      const compareFindingEvidence = (signal, temporalEvidence) => {
        const rawSignalValue = signal.observed_value;
        const signalValue = rawSignalValue === null || rawSignalValue === undefined || rawSignalValue === ""
          ? NaN : Number(rawSignalValue);
        const matchingMeasurements = cultureMeasurements.filter(item =>
          item.variable_code && item.variable_code === signal.variable_code &&
          temporalEvidence.nearby_measurement_ids.includes(item.id));
        const comparableMeasurements = Number.isFinite(signalValue)
          ? matchingMeasurements.filter(item =>
            item.normalized_value !== null && item.normalized_value !== undefined &&
            item.normalized_value !== "" && signal.unit && item.normalized_unit_code === signal.unit)
          : [];
        const numericComparisons = comparableMeasurements.map(item => ({
          measurement_id: item.id,
          measurement_value: Number(item.normalized_value),
          signal_value: signalValue,
          difference: Number(item.normalized_value) - signalValue,
          comparison_status: Number(item.normalized_value) === signalValue
            ? "same_numeric_value" : "different_numeric_value_no_tolerance_defined"
        })).filter(item => Number.isFinite(item.measurement_value));
        const linkedObservationIds = temporalEvidence.linked_observation_ids;
        const linkedObservations = linkedObservationIds.map(id => observationById.get(id)).filter(Boolean);
        const nearbyMeasurementIds = new Set(temporalEvidence.nearby_measurement_ids);
        const nearbyResultIds = [...new Set(cultureMeasurements
          .filter(item => nearbyMeasurementIds.has(item.id) && item.result_id)
          .map(item => item.result_id))];
        const linkedResults = cultureResults.filter(result => nearbyResultIds.includes(result.id));
        return {
          signal_value_is_numeric: Number.isFinite(signalValue),
          same_variable_measurement_count: matchingMeasurements.length,
          unit_compatible_measurement_count: numericComparisons.length,
          numeric_comparisons: numericComparisons,
          linked_descriptive_observation_count: linkedObservations.length,
          linked_descriptive_observation_ids: linkedObservations.map(item => item.id),
          measurement_quality_states: matchingMeasurements.map(item => ({
            measurement_id: item.id,
            quality_state: item.quality_state || null
          })),
          nearby_experimental_result_ids: linkedResults.map(result => result.id),
          comparison_status: !Number.isFinite(signalValue) ? "signal_value_not_numeric"
            : numericComparisons.length === 0 ? "no_unit_compatible_measurement"
            : numericComparisons.every(item => item.comparison_status === "same_numeric_value")
              ? "numeric_values_match" : "numeric_values_differ_no_tolerance_defined",
          environmental_evidence_role: "context_only_not_direct_biological_confirmation",
          evidence_interpretation: "descriptive_comparison_only_no_threshold_or_causal_inference"
        };
      };
      const contextFields = [
        "culture_type", "started_at", "material_id", "generation",
        "strain_id", "organism_name", "current_stage"
      ];
      const populatedContextFields = contextFields.filter(field => biologicalContext[field] !== null && biologicalContext[field] !== "");
      const contextCompleteness = {
        biological_fields_present: populatedContextFields,
        biological_fields_missing: contextFields.filter(field => !populatedContextFields.includes(field)),
        biological_field_count: contextFields.length,
        biological_field_coverage: populatedContextFields.length / contextFields.length,
        measurements_available: lineage?.evidenceAvailability?.measurements === true,
        environmental_observations_available: lineage?.evidenceAvailability?.environmental_observations === true,
        lineage_complete: lineage?.lineageQuality?.complete === true,
        interpretation_readiness: populatedContextFields.length >= 4 && cultureMeasurements.length > 0
          ? "context_available_for_review" : "insufficient_context_for_biological_interpretation"
      };
      // Adapt existing rule-engine outputs into the inference contract.
      // A signal is a finding, not an organism identification or a calibrated probability.
      const findings = cultureSignals.map(signal => {
        const temporalEvidence = temporalEvidenceForFinding(signal);
        return {
        finding_id: signal.signal_id,
        finding_type: signal.signal_code,
        severity: signal.severity || null,
        rule_id: signal.rule_id || null,
        source_analysis_id: signal.source_analysis_id || null,
        source_finding_id: signal.source_finding_id || null,
        recommendation_code: signal.recommendation_code || null,
        message_code: signal.message_code || null,
        variable_code: signal.variable_code || null,
        observed_value: signal.observed_value ?? null,
        unit: signal.unit || null,
        observed_at: signal.observed_date || signal.first_seen_at || null,
        analysis_method: signal.analysis_method || null,
        analysis_evidence: signal.analysis_evidence || {},
        source_observation_ids: Array.isArray(signal.source_observation_ids) ? signal.source_observation_ids : [],
        hypotheses: [],
        confidence: null,
        confirmation_status: "unconfirmed",
        composition_status: "not_assessed",
        biological_context: biologicalContext,
        environmental_context: environmentalSummary,
        temporal_evidence: temporalEvidence,
        evidence_assessment: compareFindingEvidence(signal, temporalEvidence)
        };
      });
      return {
        culture_id: cultureId,
        biological_context: biologicalContext,
        context_completeness: contextCompleteness,
        measurement_trends: measurementTrends,
        environmental_summary: environmentalSummary,
        temporal_context: {
          measurement_series_count: measurementTrends.length,
          environmental_series_count: environmentalTrends.length,
          trend_semantics: "descriptive_first_to_last_change_not_a_causal_or_threshold_assessment",
          temporal_association_is_causal: false,
          finding_window_hours: 24
        },
        measurements: cultureMeasurements,
        observations: cultureObservations,
        biological_signals: cultureSignals,
        interpretation_history: {
          snapshots: cultureInterpretations,
          events: cultureInterpretationEvents,
          snapshot_count: cultureInterpretations.length,
          event_count: cultureInterpretationEvents.length,
          events_available: lineage?.evidenceAvailability?.biological_interpretation_events === true,
          status: lineage?.evidenceAvailability?.biological_interpretations === true
            ? "available" : "unavailable"
        },
        findings,
        experimental_results: cultureResults,
        events: cultureEvents,
        environmental_context: environmentalContext,
        evidence_summary: {
          measurement_count: cultureMeasurements.length,
          observation_count: cultureObservations.length,
          biological_signal_count: cultureSignals.length,
          interpretation_snapshot_count: cultureInterpretations.length,
          interpretation_event_count: cultureInterpretationEvents.length,
          interpretation_history_events_available: lineage?.evidenceAvailability?.biological_interpretation_events === true,
          finding_count: findings.length,
          experimental_result_count: cultureResults.length,
          environmental_context_count: environmentalContext.length,
          measurement_interpretation: "quantitative_observation",
          observation_interpretation: "descriptive_observation",
          signal_interpretation: "rule_or_anomaly_output_not_identity_confirmation",
          result_interpretation: "experiment_result_requires_method_and_result_semantics_review",
          composition_status: "not_assessed",
          composition_evidence: [],
          environmental_context_is_causal: false
        },
        environmental_context_is_causal: false
      };
    };
    const traverse = (startId, adjacency, endpointField, maxNodes = 150) => {
      const visited = new Set([startId]);
      const queue = [startId];
      while (queue.length && visited.size < maxNodes) {
        const currentId = queue.shift();
        (adjacency.get(currentId) || []).forEach(edge => {
          const nextId = edge[endpointField];
          if (visited.has(nextId)) return;
          visited.add(nextId);
          if (visited.size < maxNodes) queue.push(nextId);
        });
      }
      return [...visited].filter(id => id !== startId);
    };
    const traceMaterial = materialId => {
      if (!materialById.has(materialId)) return {
        found: false, material_id: materialId, ancestors: [], descendants: [],
        source_materials: [], lineage_strains: [], strains: [],
        confirmed_composition: [], composition_status: "not_assessed",
        events: [], unresolved_material_ids: []
      };
      const ancestorIds = traverse(materialId, incoming, "parent_material_id");
      const descendantIds = traverse(materialId, outgoing, "child_material_id");
      const relatedIds = [materialId, ...ancestorIds];
      const directSourceIds = [...new Set((incoming.get(materialId) || []).map(edge => edge.parent_material_id))];
      const sourceMaterials = directSourceIds.map(id => materialById.get(id)).filter(Boolean);
      const strainMap = new Map();
      relatedIds.map(id => materialById.get(id)).filter(Boolean).forEach(material => {
        const strain = material.strain || {};
        const organism = strain.organism || {};
        const strainId = material.strain_id || strain.id;
        const label = [strain.strain_code || strain.designation, organism.scientific_name].filter(Boolean).join(" — ");
        if (label) strainMap.set(strainId || label, {
          strain_id: strainId || null,
          label,
          material_id: material.id,
          material_code: material.material_code || null,
          assignment_type: material.id === materialId ? "direct_material_assignment" : "ancestral_material_assignment"
        });
      });
      // A strain assignment or a source-material edge documents genealogy only.
      // Confirmed composition requires an explicit analytical result contract,
      // which is not yet represented in the current schema.
      const lineageStrains = [...strainMap.values()];
      const relatedEventIds = new Set([materialId, ...ancestorIds, ...descendantIds]);
      const relatedEvents = [...relatedEventIds].flatMap(id => eventsByMaterial.get(id) || [])
        .sort((a, b) => String(a.occurred_at || "").localeCompare(String(b.occurred_at || "")));
      const unresolved = [...new Set([...ancestorIds, ...descendantIds])].filter(id => !materialById.has(id));
      return {
        found: true,
        material_id: materialId,
        material: materialById.get(materialId),
        ancestors: ancestorIds.map(id => materialById.get(id)).filter(Boolean),
        descendants: descendantIds.map(id => materialById.get(id)).filter(Boolean),
        source_materials: sourceMaterials,
        lineage_strains: lineageStrains,
        // Backward-compatible alias; callers must not interpret this as measured composition.
        strains: lineageStrains,
        confirmed_composition: [],
        composition_status: "not_assessed",
        events: relatedEvents,
        culture_evidence: cultures.filter(culture => relatedIds.includes(culture.material?.id)).map(culture => getCultureEvidence(culture.id)),
        unresolved_material_ids: unresolved,
        truncated: ancestorIds.length + descendantIds.length >= 298
      };
    };
    const findMaterialsByStrain = strainId => materials.filter(material =>
      material.strain_id === strainId || material.strain?.id === strainId
    );
    const summarize = () => ({
      material_count: materials.length,
      measurement_count: measurements.length,
      observation_count: observations.length,
      biological_signal_count: biologicalSignals.length,
      experimental_result_count: experimentalResults.length,
      environmental_context_count: environmentalObservations.length,
      relationship_count: graphPairKeys.size,
      operation_source_edge_count: operationSourcePairs.size,
      event_count: events.length,
      root_count: materials.filter(material => !(incoming.get(material.id) || []).length && !material.parent_material_id).length,
      multi_parent_count: materials.filter(material => (incoming.get(material.id) || []).length > 1).length,
      unresolved_parent_count: [...incoming.values()].flat().filter(edge => !materialById.has(edge.parent_material_id)).length
    });
    return { traceMaterial, findMaterialsByStrain, getCultureEvidence, summarize };
  }

  window.BALabsBiologicalProvenance = {
    buildIndex: buildBiologicalProvenanceIndex
  };

  function renderCultureLineage(lineage, currentCultureId) {
    if (!lineage || lineage.unavailable || !lineage.cultures.length) return null;
    const section = element("section", "signal-lineage");
    section.append(element("h4", "", "Généalogie biologique"));
    const provenanceIndex = buildBiologicalProvenanceIndex(lineage);
    const provenanceSummary = provenanceIndex.summarize();
    if (lineage.lineageQuality && !lineage.lineageQuality.complete) {
      const quality = element("p", "signal-lineage-quality",
        "Généalogie partielle : " + lineage.lineageQuality.issues.length +
        " lecture(s) incomplète(s). Les relations absentes ne peuvent pas être interprétées comme inexistantes.");
      quality.setAttribute("role", "status");
      section.append(quality);
    } else if (lineage.truncated) {
      section.append(element("p", "signal-lineage-quality",
        "Généalogie partielle : limite de profondeur ou de volume atteinte."));
    } else {
      section.append(element("p", "signal-lineage-quality is-complete",
        "Chargement de la généalogie terminé."));
    }
    section.append(element("p", "signal-lineage-batches",
      provenanceSummary.material_count + " matériaux · " + provenanceSummary.relationship_count + " relations · " +
      provenanceSummary.event_count + " événements · " + provenanceSummary.multi_parent_count + " matériau(x) multi-source"));
    section.append(element("h4", "", "Preuves expérimentales associées"));
    section.append(element("p", "signal-lineage-batches",
      provenanceSummary.measurement_count + " mesures · " + provenanceSummary.observation_count + " observations · " +
      provenanceSummary.biological_signal_count + " signaux biologiques · " +
      provenanceSummary.environmental_context_count + " relevés environnementaux chargés"));
    const list = element("ol", "signal-lineage-list");
    lineage.cultures.forEach(culture => {
      const item = element("li", culture.id === currentCultureId ? "is-current" : "");
      const material = culture.material || {};
      const strain = material.strain || {};
      const organism = strain.organism || {};
      const parent = lineage.cultures.find(candidate => candidate.id === culture.parent_culture_id);
      const title = [culture.code, culture.id === currentCultureId ? "Culture consultée" : null].filter(Boolean).join(" — ");
      const detail = [
        culture.culture_type,
        material.material_code,
        strain.strain_code || strain.designation,
        organism.scientific_name,
        material.generation === null || material.generation === undefined ? null : "G" + material.generation,
        parent ? "Issue de " + parent.code : culture.parent_culture_id ? "Parent hors périmètre chargé" : "Origine de lignée"
      ].filter(Boolean).join(" · ");
      item.append(element("strong", "", title), element("small", "", detail || "Informations complémentaires indisponibles"));
      const linkedBatches = lineage.batches.filter(batch => batch.culture_id === culture.id);
      if (linkedBatches.length) item.append(element("small", "signal-lineage-batches", "Lots : " + linkedBatches.map(batch => [batch.batch_code, batch.status, batch.current_stage].filter(Boolean).join(" / ")).join(", ")));
      const cultureEvidence = provenanceIndex.getCultureEvidence(culture.id);
      const evidenceParts = [
        cultureEvidence.measurements.length ? cultureEvidence.measurements.length + " mesure(s)" : null,
        cultureEvidence.observations.length ? cultureEvidence.observations.length + " observation(s)" : null,
        cultureEvidence.biological_signals.length ? cultureEvidence.biological_signals.length + " signal(aux)" : null,
        cultureEvidence.experimental_results.length ? cultureEvidence.experimental_results.length + " résultat(s) expérimental(aux)" : null,
        cultureEvidence.environmental_context.length ? cultureEvidence.environmental_context.length + " relevé(s) environnemental(aux) contextualisé(s)" : null
      ].filter(Boolean);
      if (evidenceParts.length) item.append(element("small", "signal-lineage-batches", "Preuves associées : " + evidenceParts.join(" · ")));
      const history = cultureEvidence.interpretation_history || {};
      const snapshots = Array.isArray(history.snapshots) ? history.snapshots.slice()
        .sort((left, right) => new Date(right.recorded_at || 0).getTime() - new Date(left.recorded_at || 0).getTime()) : [];
      const historyEvents = Array.isArray(history.events) ? history.events : [];
      const historySection = element("div", "signal-interpretation-history");
      historySection.append(element("strong", "", "Historique des interprétations"));
      historySection.append(element("small", "", snapshots.length + " instantané(s) · " + historyEvents.length + " événement(s)"));
      if (history.status === "unavailable") {
        historySection.append(element("p", "signal-lineage-quality",
          "Historique indisponible : la lecture du registre n'a pas abouti."));
      } else if (history.events_available === false) {
        historySection.append(element("p", "signal-lineage-quality",
          "Instantanés disponibles, mais historique des événements incomplet."));
      }
      if (history.status !== "unavailable" && !snapshots.length) {
        historySection.append(element("p", "signal-lineage-batches",
          "Aucun instantané d'interprétation enregistré pour cette culture."));
      }
      snapshots.forEach((snapshot, snapshotIndex) => {
        const detail = element("details", "signal-interpretation-snapshot");
        const snapshotEvents = historyEvents.filter(event => event.interpretation_id === snapshot.interpretation_id)
          .slice().sort((left, right) =>
            new Date(left.occurred_at || 0).getTime() - new Date(right.occurred_at || 0).getTime());
        const supersededEvents = snapshotEvents.filter(event => event.event_type === "superseded");
        const latestSupersededEvent = supersededEvents[supersededEvents.length - 1] || null;
        const lifecycleLabel = history.events_available !== true ? "Cycle de vie non vérifié"
          : latestSupersededEvent ? "Version remplacée" : "Version courante";
        const summary = element("summary", "", [
          lifecycleLabel,
          snapshot.interpretation_status || "Statut inconnu",
          snapshot.engine_code || "Moteur non précisé",
          snapshot.engine_version || "Version inconnue"
        ].join(" · "));
        detail.append(summary);
        detail.append(element("small", "", "Enregistré le " + dateLabel(snapshot.recorded_at)));
        if (latestSupersededEvent) {
          const replacement = latestSupersededEvent.event_payload || {};
          detail.append(element("small", "signal-interpretation-lifecycle",
            "Remplacée le " + dateLabel(latestSupersededEvent.occurred_at) +
            (replacement.replaced_by_engine_version ? " par la version " + replacement.replaced_by_engine_version : "") +
            (replacement.replaced_by_interpretation_id ? " · Instantané " + replacement.replaced_by_interpretation_id : "")));
        } else if (history.events_available === true) {
          detail.append(element("small", "signal-interpretation-lifecycle",
            "Aucun événement de remplacement enregistré pour cet instantané."));
        }
        detail.append(element("small", "", "Signal : " + (snapshot.source_signal_id || "non référencé") +
          " · Analyse : " + (snapshot.source_analysis_id || "non référencée")));
        const payload = snapshot.interpretation_payload || {};
        const finding = payload.finding || {};
        const interpretation = payload.interpretation || {};
        if (finding.signal_code || finding.variable_code || finding.finding_status) {
          detail.append(element("p", "", [
            finding.signal_code,
            finding.variable_code,
            finding.finding_status
          ].filter(Boolean).join(" · ")));
        }
        if (snapshotIndex < snapshots.length - 1) {
          const olderSnapshot = snapshots.slice(snapshotIndex + 1).find(candidate =>
            candidate.source_signal_id === snapshot.source_signal_id &&
            candidate.engine_code === snapshot.engine_code);
          const comparison = compareInterpretationSnapshots(olderSnapshot, snapshot);
          if (comparison) {
            const comparisonPanel = element("div", "signal-interpretation-comparison");
            comparisonPanel.append(element("strong", "", "Évolution depuis la version précédente"));
            comparisonPanel.append(element("small", "", "Moteur " + comparison.previous_engine_version +
              " → " + comparison.current_engine_version));
            const comparisonCategories = [
              ["preuves", "preuves"],
              ["constat", "constats"],
              ["conclusion", "conclusions"],
              ["contexte", "éléments de contexte"]
            ].filter(([key]) => comparison.category_counts[key])
              .map(([key, label]) => comparison.category_counts[key] + " " + label);
            comparisonPanel.append(element("small", "", comparison.compared_field_count +
              " champ(s) comparé(s)" + (comparisonCategories.length ? " · " + comparisonCategories.join(" · ") : "")));
            if (comparison.status_changed) {
              comparisonPanel.append(element("p", "", "Statut : " + comparison.previous_status +
                " → " + comparison.current_status));
            } else {
              comparisonPanel.append(element("small", "", "Statut inchangé : " + comparison.current_status));
            }
            if (!comparison.changes.length) {
              comparisonPanel.append(element("small", "", "Aucune différence détectée dans les champs comparables du contenu enregistré."));
            } else {
              const changeList = element("ul", "signal-interpretation-diff-list");
              comparison.changes.forEach(change => {
                const changeItem = element("li", "");
                changeItem.append(element("strong", "", change.category + " · " + change.path));
                changeItem.append(element("small", "", "Avant : " + String(change.previous)));
                changeItem.append(element("small", "", "Après : " + String(change.current)));
                changeList.append(changeItem);
              });
              comparisonPanel.append(changeList);
            }
            if (comparison.truncated) comparisonPanel.append(element("small", "", "Comparaison limitée : certains champs n’ont pas été affichés."));
            comparisonPanel.append(element("small", "", "Comparaison descriptive des instantanés — aucune validation scientifique ou causalité déduite."));
            detail.append(comparisonPanel);
          }
        }
        const reviewPanel = element("div", "signal-interpretation-review");
        reviewPanel.append(element("strong", "", "Revue scientifique humaine"));
        reviewPanel.append(element("small", "", "La revue ajoute un événement au dossier sans modifier l’instantané moteur."));
        const reviewNote = element("textarea", "signal-interpretation-review-note");
        reviewNote.rows = 2;
        reviewNote.maxLength = 2000;
        reviewNote.placeholder = "Note de revue (facultative, 2 000 caractères maximum)";
        reviewPanel.append(reviewNote);
        const reviewStatus = element("small", "signal-interpretation-review-status");
        const reviewActions = element("div", "signal-interpretation-review-actions");
        const decisions = [
          ["accepted", "Accepter"],
          ["contested", "Contester"],
          ["reassessment_requested", "Demander une réévaluation"]
        ];
        decisions.forEach(([decision, label]) => {
          const button = element("button", "secondary-button", label);
          button.type = "button";
          button.addEventListener("click", async () => {
            if (!state.organizationId || !state.userId) {
              reviewStatus.textContent = "Session ou organisation indisponible.";
              return;
            }
            reviewActions.querySelectorAll("button").forEach(control => { control.disabled = true; });
            reviewStatus.textContent = "Enregistrement de la revue…";
            const { data, error } = await client.rpc("review_biological_interpretation", {
              p_organization_id: state.organizationId,
              p_interpretation_id: snapshot.interpretation_id,
              p_decision: decision,
              p_note: reviewNote.value.trim() || null
            });
            if (error) {
              console.error("[CultureOps interpretation review] Write failed", error.message);
              reviewStatus.textContent = "Échec de l’enregistrement. Vérifiez les droits et réessayez.";
              reviewActions.querySelectorAll("button").forEach(control => { control.disabled = false; });
              return;
            }
            const event = {
              event_id: data?.event_id,
              interpretation_id: snapshot.interpretation_id,
              event_type: "reviewed",
              actor_kind: "user",
              actor_id: state.userId,
              occurred_at: new Date().toISOString(),
              event_payload: { decision, note: reviewNote.value.trim() || null }
            };
            historyEvents.push(event);
            const eventList = detail.querySelector(".signal-interpretation-events") || element("ol", "signal-interpretation-events");
            if (!eventList.isConnected) detail.append(eventList);
            const eventItem = element("li", "");
            eventItem.append(element("strong", "", "Revue : " + label));
            eventItem.append(element("small", "", dateLabel(event.occurred_at) + " · Action utilisateur"));
            if (event.event_payload.note) eventItem.append(element("small", "", event.event_payload.note));
            eventList.append(eventItem);
            reviewStatus.textContent = "Revue enregistrée dans l’historique.";
            reviewNote.value = "";
            reviewActions.querySelectorAll("button").forEach(control => { control.disabled = false; });
          });
          reviewActions.append(button);
        });
        reviewPanel.append(reviewActions, reviewStatus);
        detail.append(reviewPanel);
        if (snapshotEvents.length) {
          const eventList = element("ol", "signal-interpretation-events");
          snapshotEvents.forEach(event => {
            const eventItem = element("li", "");
            const decisionLabels = { accepted: "acceptée", contested: "contestée", reassessment_requested: "réévaluation demandée" };
            const eventLabel = event.event_type === "reviewed" && event.event_payload?.decision
              ? "Revue : " + (decisionLabels[event.event_payload.decision] || event.event_payload.decision)
              : event.event_type === "superseded" ? "Instantané remplacé"
                : event.event_type === "recorded" ? "Instantané enregistré"
                  : event.event_type || "Événement";
            eventItem.append(element("strong", "", eventLabel));
            eventItem.append(element("small", "", dateLabel(event.occurred_at) + " · " +
              (event.actor_kind === "user" ? "Action utilisateur" : "Événement système")));
            if (event.event_payload && event.event_payload.note) {
              eventItem.append(element("small", "", String(event.event_payload.note)));
            }
            if (event.event_type === "superseded" && event.event_payload?.replaced_by_engine_version) {
              eventItem.append(element("small", "", "Remplacé par la version " + String(event.event_payload.replaced_by_engine_version)));
            }
            eventList.append(eventItem);
          });
          detail.append(eventList);
        }
        historySection.append(detail);
      });
      item.append(historySection);
      if (cultureEvidence.environmental_context.length) item.append(element("small", "signal-lineage-event",
        "Contexte environnemental temporel et géographique uniquement — aucune causalité établie"));
      const operations = lineage.events.filter(event => event.culture_id === culture.id);
      operations.forEach(event => {
        const payload = event.payload || {};
        const operation = payload.operation || payload.operation_type || event.event_type;
        const childCodes = Array.isArray(payload.child_codes) ? payload.child_codes.join(", ") : "";
        item.append(element("small", "signal-lineage-event",
          dateLabel(event.occurred_at) + " · " + operation + (childCodes ? " · Descendants : " + childCodes : "")));
      });
      list.append(item);
    });
    section.append(list);

    if (lineage.materials && lineage.materials.length) {
      section.append(element("h4", "", "Généalogie des matériaux"));
      const materialList = element("ol", "signal-lineage-list");
      const materialMap = new Map(lineage.materials.map(material => [material.id, material]));
      const incomingByChild = new Map();
      (lineage.relationships || []).forEach(edge => {
        if (!incomingByChild.has(edge.child_material_id)) incomingByChild.set(edge.child_material_id, []);
        incomingByChild.get(edge.child_material_id).push(edge);
      });
      lineage.materials.slice().sort((left, right) =>
        (left.generation ?? Number.MAX_SAFE_INTEGER) - (right.generation ?? Number.MAX_SAFE_INTEGER)
      ).forEach(material => {
        const item = element("li", "");
        const strain = material.strain || {};
        const organism = strain.organism || {};
        const incoming = incomingByChild.get(material.id) || [];
        const parentIds = new Set(incoming.map(edge => edge.parent_material_id));
        if (material.parent_material_id) parentIds.add(material.parent_material_id);
        const parents = [...parentIds].map(id => materialMap.get(id)).filter(Boolean);
        const missingParentCount = parentIds.size - parents.length;
        const detail = [
          material.material_type,
          material.generation === null || material.generation === undefined ? null : "G" + material.generation,
          material.state,
          parents.length ? parents.map(parent => parent.material_code || "Matériau sans code").join(" + ") : parentIds.size || material.parent_material_id ? "Parent(s) hors périmètre chargé" : "Matériau source"
        ].filter(Boolean).join(" · ");
        item.append(element("strong", "", material.material_code || "Matériau sans code"));
        item.append(element("small", "", detail));
        const relationLabels = incoming.map(edge => {
          const parent = materialMap.get(edge.parent_material_id);
          return (parent?.material_code || "Parent hors périmètre") + " → " + (edge.relationship_type || "relation");
        });
        if (relationLabels.length) item.append(element("small", "signal-lineage-event", "Relations entrantes : " + relationLabels.join(" ; ")));
        if (missingParentCount) item.append(element("small", "signal-lineage-event", missingParentCount + " parent(s) non résolu(s) dans le périmètre chargé"));
        const inheritedStrains = new Map();
        // Reuse the canonical provenance traversal so SQL edges and event-derived
        // source links produce the same contributor list without duplicate strains.
        const materialTrace = provenanceIndex.traceMaterial(material.id);
        [material, ...(materialTrace.ancestors || [])].forEach(source => {
          const sourceStrain = source.strain || {};
          const sourceOrganism = sourceStrain.organism || {};
          const label = [sourceStrain.strain_code || sourceStrain.designation, sourceOrganism.scientific_name].filter(Boolean).join(" — ");
          if (label) inheritedStrains.set(source.strain_id || sourceStrain.id || label, {
            label,
            origin: sourceStrain.origin,
            supplier: sourceStrain.supplier
          });
        });
        if (inheritedStrains.size) {
          item.append(element("small", "signal-lineage-batches",
            "Souches documentées dans la généalogie (non confirmées dans le produit) : " +
            [...inheritedStrains.values()].map(source =>
              [source.label, source.origin ? "Origine : " + source.origin : null, source.supplier ? "Fournisseur : " + source.supplier : null].filter(Boolean).join(" · ")
            ).join(" ; ")));
        }
        item.append(element("small", "signal-lineage-composition",
          "Composition biologique confirmée : non évaluée (aucun résultat analytique structuré associé)."));
        const linkedBatches = lineage.batches.filter(batch => batch.material_id === material.id);
        if (linkedBatches.length) item.append(element("small", "signal-lineage-batches", "Lots matière : " +
          linkedBatches.map(batch => [batch.batch_code, batch.status, batch.current_stage].filter(Boolean).join(" / ")).join(", ")));
        lineage.events.filter(event => event.material_id === material.id).forEach(event => {
          const payload = event.payload || {};
          const operationLabel = payload.operation || payload.operation_type || event.event_type;
          item.append(element("small", "signal-lineage-event",
            dateLabel(event.occurred_at) + " · " + operationLabel));
          const sourceIds = Array.isArray(payload.source_material_ids) ? payload.source_material_ids : [];
          if (sourceIds.length) {
            const sourceLabels = sourceIds.map(sourceId => {
              const source = materialMap.get(sourceId);
              return source?.material_code || ("Source non résolue (" + String(sourceId).slice(0, 8) + ")");
            });
            item.append(element("small", "signal-lineage-batches",
              "Matériaux composants (" + sourceIds.length + ") : " + sourceLabels.join(" + ")));
          }
          const note = typeof payload.note === "string" ? payload.note.trim() : "";
          if (note) item.append(element("small", "signal-lineage-event", "Note de préparation : " + note));
          const details = payload.details && typeof payload.details === "object" ? payload.details : {};
          if (details.domain) item.append(element("small", "signal-lineage-event", "Univers d’origine : " + details.domain));
        });
        materialList.append(item);
      });
      section.append(materialList);
    }
    if (lineage.truncated) section.append(element("p", "signals-empty", "Affichage limité aux plafonds de généalogie ; la lignée peut continuer au-delà."));
    return section;
  }

  async function loadHistory(kind, id, label) {
    if (!state.userId || !state.organizationId || !state.domain || !["biological_subject_id", "environment_id"].includes(kind)) return;
    const request = ++state.historyRequest;
    const organizationId = state.organizationId;
    const domain = state.domain;
    const panel = $("signalsHistory");
    panel.classList.remove("hidden");
    $("signalsHistoryTitle").textContent = "Historique — " + label;
    $("signalsHistoryStatus").textContent = "Résolution de l’objet biologique…";
    $("signalsHistoryList").replaceChildren(element("p", "signals-empty", "Chargement de l’historique…"));
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
    const identity = await resolveHistoryIdentity(kind, id, organizationId, domain);
    const lineage = kind === "biological_subject_id" && domain !== "greentech"
      ? await resolveCultureLineage(id, organizationId)
      : null;
    if (request !== state.historyRequest) return;
    $("signalsHistoryTitle").textContent = "Historique — " + identity.title;
    $("signalsHistoryStatus").textContent = identity.subtitle || "Objet métier associé";
    const { data, error } = await client.from("biological_signals")
      .select("signal_id,signal_code,severity,variable_code,observed_date,observed_value,unit,analysis_method,signal_status,first_seen_at,rule_id")
      .eq("organization_id", organizationId).eq("domain", domain).eq(kind, id)
      .order("observed_date", { ascending: false }).order("first_seen_at", { ascending: false }).limit(50);
    if (request !== state.historyRequest) return;
    const list = $("signalsHistoryList");
    list.replaceChildren();
    const lineageNode = renderCultureLineage(lineage, id);
    if (lineageNode) list.append(lineageNode);
    if (error) {
      console.error("[CultureOps signals] History read failed", error.message);
      list.append(element("p", "signals-empty", "Impossible de charger cet historique. Vérifiez les droits d’accès et la connexion."));
      return;
    }
    if (!data?.length) {
      list.append(element("p", "signals-empty", "Aucun historique disponible pour ce contexte."));
      return;
    }
    data.forEach(item => {
      const entry = element("article", "signal-history-entry");
      const heading = element("div", "signal-history-heading");
      heading.append(element("strong", "", item.signal_code || "Signal biologique"), element("span", "signal-state", labels[item.signal_status] || item.signal_status));
      const detail = element("p", "", [item.observed_date, item.variable_code, item.observed_value === null ? null : String(item.observed_value) + (item.unit ? " " + item.unit : ""), severityLabels[item.severity] || item.severity, methodLabels[item.analysis_method] || item.analysis_method].filter(Boolean).join(" · "));
      entry.append(heading, detail, element("small", "", "Règle : " + (item.rule_id || "—") + " · Détecté : " + dateLabel(item.first_seen_at)));
      list.append(entry);
    });
    $("signalsHistoryStatus").textContent = [identity.subtitle, data.length === 50 ? "50 événements affichés au maximum." : data.length + " événement(s) dans cet historique."].filter(Boolean).join(" · ");
  }

  $("signalsHistoryClose").addEventListener("click", () => {
    state.historyRequest++;
    $("signalsHistory").classList.add("hidden");
    $("signalsHistoryList").replaceChildren();
  });

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
    state.loading = false;
    state.userId = session?.user?.id || null;
    state.organizationId = window.BALabsGetOrganizationId?.() || null;
    state.rows = [];
    state.offset = 0;
    state.hasMore = false;
    state.historyRequest++;
    $("signalsHistory").classList.add("hidden");
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
  $("signalsSeverityFilter").addEventListener("change", event => {
    state.severity = event.target.value;
    render();
  });
  $("signalsMethodFilter").addEventListener("change", event => {
    state.method = event.target.value;
    render();
  });
  $("signalsVariableFilter").addEventListener("input", event => {
    state.variable = event.target.value.trim().toLowerCase();
    render();
  });
  $("signalsRefresh").addEventListener("click", () => loadSignals());
  $("signalsLoadMore").addEventListener("click", () => loadSignals({ append: true }));

  client.auth.getSession().then(({ data }) => applySession(data.session));
  client.auth.onAuthStateChange((_event, session) => {
    // Defer SDK calls until the auth callback has returned.
    setTimeout(() => applySession(session), 0);
  });
  window.addEventListener("balabs:organization-context", event => {
    state.request++;
    state.loading = false;
    state.organizationId = event.detail?.organizationId || null;
    state.userId = event.detail?.userId || null;
    state.historyRequest++;
    $("signalsHistory").classList.add("hidden");
    if (!state.userId) {
      state.rows = [];
      state.offset = 0;
      state.hasMore = false;
      render();
      root.classList.add("hidden");
      return;
    }
    root.classList.remove("hidden");
    if (!state.organizationId) {
      state.rows = [];
      state.offset = 0;
      state.hasMore = false;
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
    state.request++;
    state.loading = false;
    state.domain = domainByWorkspace[nextDomain] || null;
    state.historyRequest++;
    $("signalsHistory").classList.add("hidden");
    state.rows = [];
    state.offset = 0;
    state.hasMore = false;
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
