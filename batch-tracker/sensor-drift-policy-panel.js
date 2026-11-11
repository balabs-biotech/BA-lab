/* BA Labs CultureOps — versioned sensor drift reference policy manager.
 * Writer-only read model + tenant-scoped RLS mutations; no raw device registry access.
 */
(() => {
  "use strict";
  if (!["mycology", "laboratory"].includes(document.body.dataset.domain)) return;
  const client = window.BALabsSupabaseClient;
  const root = document.getElementById("sensorDriftPolicyCard");
  if (!client || !root) return;

  const state = {
    organizationId: null, userId: null, revision: 0,
    devices: [], profile: null, policies: [], selectedPolicyId: null, busy: false
  };
  const $ = id => root.querySelector("#" + id);
  const make = (tag, text) => {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    return el;
  };
  const setStatus = (message, error = false) => {
    $("sensorDriftPolicyStatus").textContent = message;
    $("sensorDriftPolicyStatus").dataset.state = error ? "error" : "info";
  };
  const formIds = [
    "sensorDriftTarget", "sensorDriftReference", "sensorDriftVariable",
    "sensorDriftOffset", "sensorDriftMinimumPairs", "sensorDriftMinimumDuration",
    "sensorDriftMaximumRate", "sensorDriftCreateDraft", "sensorDriftPolicySelect",
    "sensorDriftVerificationMethod", "sensorDriftVerificationEvidence",
    "sensorDriftVerify", "sensorDriftActivate", "sensorDriftRetire"
  ];
  function disableAll() {
    formIds.forEach(id => { $(id).disabled = true; });
  }
  function reset() {
    state.revision += 1;
    state.organizationId = null;
    state.userId = null;
    state.devices = [];
    state.profile = null;
    state.policies = [];
    state.selectedPolicyId = null;
    state.busy = false;
    disableAll();
    $("sensorDriftTarget").replaceChildren(make("option", "Connexion requise"));
    $("sensorDriftReference").replaceChildren(make("option", "Connexion requise"));
    $("sensorDriftPolicySelect").replaceChildren(make("option", "Aucune politique chargée"));
    $("sensorDriftProfileValidity").textContent = "Sélectionnez un environnement dans le module d’analyse.";
    setStatus("En attente d’une session authentifiée.");
  }
  function deviceLabel(device) {
    return device.device_code + " · " + device.device_type;
  }
  function populateDeviceSelect(select, placeholder) {
    select.replaceChildren(make("option", placeholder));
    state.devices.forEach(device => {
      const option = make("option", deviceLabel(device));
      option.value = device.sensor_id;
      select.append(option);
    });
    select.disabled = state.devices.length < 2;
  }
  function selectedPolicy() {
    return state.policies.find(policy => policy.id === state.selectedPolicyId) || null;
  }
  function renderPolicies() {
    const select = $("sensorDriftPolicySelect");
    select.replaceChildren(make("option", "Sélectionner une politique…"));
    const labels = new Map(state.devices.map(device => [device.sensor_id, deviceLabel(device)]));
    state.policies.forEach(policy => {
      const target = labels.get(policy.target_sensor_id) || policy.target_sensor_id;
      const reference = labels.get(policy.reference_sensor_id) || policy.reference_sensor_id;
      const option = make("option",
        target + " ← " + reference + " · " + policy.variable_code + " · " + policy.status);
      option.value = policy.id;
      select.append(option);
    });
    select.disabled = !state.policies.length || state.busy;
    select.value = state.selectedPolicyId || "";
    updateActionState();
  }
  function updateActionState() {
    const policy = selectedPolicy();
    const canEdit = Boolean(policy && policy.status === "draft" && !state.busy);
    $("sensorDriftVerificationMethod").disabled = !canEdit || policy.reference_binding_verified;
    $("sensorDriftVerificationEvidence").disabled = !canEdit || policy.reference_binding_verified;
    $("sensorDriftVerify").disabled = !canEdit || policy.reference_binding_verified;
    $("sensorDriftActivate").disabled = !(policy && policy.status === "draft" && policy.reference_binding_verified && !state.busy);
    $("sensorDriftRetire").disabled = !(policy && policy.status === "active" && !state.busy);
  }
  async function loadPolicies(revision, organizationId, environmentId) {
    const { data, error } = await client.from("sensor_drift_reference_policies")
      .select("id,target_sensor_id,reference_sensor_id,variable_code,valid_from,valid_to,status,reference_binding_verified,reference_verification_method,reference_verification_evidence,maximum_pair_offset_seconds,minimum_pairs,minimum_duration_seconds,maximum_abs_drift_rate_per_hour,created_at")
      .eq("organization_id", organizationId)
      .eq("environment_id", environmentId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (revision !== state.revision) return;
    if (error) {
      setStatus("Lecture du registre des politiques impossible : " + error.message, true);
      return;
    }
    state.policies = data || [];
    if (!state.policies.some(policy => policy.id === state.selectedPolicyId)) {
      state.selectedPolicyId = state.policies[0]?.id || null;
    }
    renderPolicies();
  }
  async function loadManagementContext() {
    const revision = ++state.revision;
    const organizationId = state.organizationId;
    const environmentId = $("sensorEnvironment").value;
    state.devices = [];
    state.profile = null;
    state.policies = [];
    state.selectedPolicyId = null;
    disableAll();
    $("sensorDriftPolicySelect").replaceChildren(make("option", "Chargement…"));
    if (!organizationId || !environmentId) {
      setStatus("Sélectionnez un environnement dans le module d’analyse.");
      return;
    }
    setStatus("Résolution du profil capteur et des appareils autorisés…");
    const { data, error } = await client.rpc("list_sensor_drift_management_devices", {
      p_organization_id: organizationId,
      p_environment_id: environmentId
    });
    if (revision !== state.revision) return;
    if (error) {
      $("sensorDriftPolicySelect").replaceChildren(make("option", "Accès de gestion indisponible"));
      setStatus("Gestion réservée aux rédacteurs de l’organisation. Vérifiez aussi qu’un profil capteur actif contient des appareils activés. Détail : " + error.message, true);
      return;
    }
    const rows = data || [];
    if (!rows.length) {
      $("sensorDriftPolicySelect").replaceChildren(make("option", "Aucun profil capteur actif avec appareil activé"));
      setStatus("Aucun appareil activé n’est associé au profil capteur actif de cet environnement.", true);
      return;
    }
    const first = rows[0];
    state.profile = {
      id: first.profile_id, code: first.profile_code, version: first.profile_version,
      validFrom: first.profile_valid_from, validTo: first.profile_valid_to
    };
    state.devices = rows.map(row => ({
      sensor_id: row.sensor_id, device_code: row.device_code, device_type: row.device_type
    }));
    populateDeviceSelect($("sensorDriftTarget"), "Choisir le capteur cible…");
    populateDeviceSelect($("sensorDriftReference"), "Choisir la référence…");
    const end = state.profile.validTo || "sans date de fin";
    $("sensorDriftProfileValidity").textContent =
      "Profil " + state.profile.code + " v" + state.profile.version +
      " · période " + state.profile.validFrom + " → " + end +
      " · " + state.devices.length + " appareil(s) activé(s). Les politiques reprendront cette période.";
    ["sensorDriftVariable", "sensorDriftOffset", "sensorDriftMinimumPairs",
      "sensorDriftMinimumDuration", "sensorDriftMaximumRate"]
      .forEach(id => { $(id).disabled = false; });
    $("sensorDriftCreateDraft").disabled = state.devices.length < 2;
    await loadPolicies(revision, organizationId, environmentId);
    if (revision === state.revision) setStatus("Profil et appareils éligibles chargés. Les mutations restent protégées par RLS et les déclencheurs PostgreSQL.");
  }
  function positiveInteger(id, min, max) {
    const value = Number($(id).value);
    return Number.isSafeInteger(value) && value >= min && value <= max ? value : null;
  }
  async function withBusy(message, operation) {
    if (state.busy) return;
    state.busy = true;
    setStatus(message);
    updateActionState();
    $("sensorDriftCreateDraft").disabled = true;
    try {
      await operation();
    } catch (error) {
      setStatus(error?.message || "Opération impossible.", true);
    } finally {
      state.busy = false;
      $("sensorDriftCreateDraft").disabled = !state.profile || state.devices.length < 2;
      updateActionState();
    }
  }
  async function refreshPolicies(selectId = null) {
    const environmentId = $("sensorEnvironment").value;
    if (!environmentId) return;
    state.selectedPolicyId = selectId;
    await loadPolicies(state.revision, state.organizationId, environmentId);
  }
  async function createDraft() {
    await withBusy("Création du brouillon…", async () => {
      const target = $("sensorDriftTarget").value;
      const reference = $("sensorDriftReference").value;
      const variable = $("sensorDriftVariable").value.trim();
      const offset = positiveInteger("sensorDriftOffset", 1, 86400);
      const pairs = positiveInteger("sensorDriftMinimumPairs", 3, 5000);
      const duration = positiveInteger("sensorDriftMinimumDuration", 1, 2592000);
      const rate = Number($("sensorDriftMaximumRate").value);
      if (!target || !reference || target === reference) throw new Error("Choisissez deux capteurs distincts du profil actif.");
      if (!variable || variable.length > 120) throw new Error("Le code de variable est obligatoire (120 caractères maximum).");
      if (offset === null || pairs === null || duration === null || !Number.isFinite(rate) || rate <= 0) {
        throw new Error("Les seuils doivent être renseignés avec des valeurs positives dans les limites indiquées.");
      }
      const { data, error } = await client.from("sensor_drift_reference_policies").insert({
        organization_id: state.organizationId,
        environment_id: $("sensorEnvironment").value,
        target_sensor_id: target,
        reference_sensor_id: reference,
        variable_code: variable,
        valid_from: state.profile.validFrom,
        valid_to: state.profile.validTo,
        maximum_pair_offset_seconds: offset,
        minimum_pairs: pairs,
        minimum_duration_seconds: duration,
        maximum_abs_drift_rate_per_hour: rate,
        reference_binding_verified: false,
        status: "draft"
      }).select("id").single();
      if (error) throw error;
      await refreshPolicies(data.id);
      setStatus("Brouillon créé. Documentez maintenant la vérification physique du couple de capteurs.");
    });
  }
  async function verifyDraft() {
    const policy = selectedPolicy();
    if (!policy || policy.status !== "draft" || policy.reference_binding_verified) return;
    await withBusy("Enregistrement de la vérification authentifiée…", async () => {
      const evidence = $("sensorDriftVerificationEvidence").value.trim();
      if (!evidence) throw new Error("La preuve documentaire est obligatoire.");
      const { data, error } = await client.from("sensor_drift_reference_policies").update({
        reference_binding_verified: true,
        reference_verification_method: $("sensorDriftVerificationMethod").value,
        reference_verification_evidence: evidence
      }).eq("organization_id", state.organizationId)
        .eq("id", policy.id).eq("status", "draft")
        .eq("reference_binding_verified", false)
        .select("id").maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Le brouillon n’a pas été modifié ; vérifiez vos droits et son état.");
      await refreshPolicies(policy.id);
      setStatus("Vérification enregistrée. Le couple physique est désormais immuable ; l’activation est une étape distincte.");
    });
  }
  async function activateDraft() {
    const policy = selectedPolicy();
    if (!policy || policy.status !== "draft" || !policy.reference_binding_verified) return;
    await withBusy("Activation de la version vérifiée…", async () => {
      const { data, error } = await client.from("sensor_drift_reference_policies")
        .update({ status: "active" })
        .eq("organization_id", state.organizationId)
        .eq("id", policy.id).eq("status", "draft")
        .eq("reference_binding_verified", true)
        .select("id").maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("La politique n’a pas été activée ; vérifiez son état et les chevauchements de validité.");
      await refreshPolicies(policy.id);
      setStatus("Politique activée. Elle sera résolue côté serveur lors des analyses couvrant sa période.");
    });
  }
  async function retirePolicy() {
    const policy = selectedPolicy();
    if (!policy || policy.status !== "active") return;
    await withBusy("Retrait de la version active…", async () => {
      const { data, error } = await client.from("sensor_drift_reference_policies")
        .update({ status: "retired" })
        .eq("organization_id", state.organizationId)
        .eq("id", policy.id).eq("status", "active")
        .select("id").maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("La politique n’a pas été retirée ; vérifiez son état.");
      await refreshPolicies(policy.id);
      setStatus("Version retirée. Son historique est conservé ; créez un nouveau brouillon pour une nouvelle configuration.");
    });
  }
  async function activateContext(context) {
    state.revision += 1;
    state.organizationId = context?.organizationId || null;
    state.userId = context?.userId || null;
    if (!state.organizationId) { reset(); return; }
    await loadManagementContext();
  }

  $("sensorEnvironment").addEventListener("change", loadManagementContext);
  $("sensorDriftPolicySelect").addEventListener("change", event => {
    state.selectedPolicyId = event.target.value || null;
    const policy = selectedPolicy();
    $("sensorDriftVerificationEvidence").value = policy?.reference_verification_evidence || "";
    if (policy?.reference_verification_method) $("sensorDriftVerificationMethod").value = policy.reference_verification_method;
    updateActionState();
  });
  $("sensorDriftCreateDraft").addEventListener("click", createDraft);
  $("sensorDriftVerify").addEventListener("click", verifyDraft);
  $("sensorDriftActivate").addEventListener("click", activateDraft);
  $("sensorDriftRetire").addEventListener("click", retirePolicy);
  window.addEventListener("balabs:organization-context", event => activateContext(event.detail || {}));
  (async () => {
    try {
      const { data } = await client.auth.getSession();
      const organizationId = window.BALabsGetOrganizationId?.();
      if (data?.session?.user?.id && organizationId && !state.organizationId) {
        await activateContext({ organizationId, userId: data.session.user.id });
      }
    } catch (error) {
      console.warn("[sensor drift policy panel] Initial session check failed", error);
    }
  })();
})();
