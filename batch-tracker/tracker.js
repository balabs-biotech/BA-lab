

/* ============================================================
   CONFIGURATION SUPABASE
   ============================================================ */

const SUPABASE_URL =
  "https://axcouwiodqsauwnsiotn.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_8H4XRh8V07Hlo0WwdfOXwg_2RXRX992";

const supabaseClient =
  supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
  );


/* ============================================================
   ETAT GLOBAL
   ============================================================ */

let organizationId = null;

let organization = null;

let strainOptions = [];

let referenceData = [];

let cultureOptions = [];

let latestBatches = [];

let selectedBatchId = null;

let selectedBatch = null;

let initializationInProgress = false;
let measurementVariables = [];
let measurementUnits = [];
let recentObservations = [];


/* ============================================================
   ETAPES STANDARD DU BATCH
   ============================================================ */

const BATCH_STAGES = [
  "preparation",
  "sterilization",
  "inoculation",
  "incubation",
  "cultivation",
  "harvest",
  "formulation",
  "packaging",
  "qc",
  "release"
];


const BATCH_STAGE_LABELS = {

  preparation:
    "Préparation",

  sterilization:
    "Stérilisation",

  inoculation:
    "Inoculation",

  incubation:
    "Incubation",

  cultivation:
    "Cultivation",

  harvest:
    "Récolte",

  formulation:
    "Formulation",

  packaging:
    "Packaging",

  qc:
    "Contrôle qualité",

  release:
    "Libération"

};


const STAGE_STATUS_LABELS = {

  pending: "À venir",
  active: "En cours",
  completed: "Terminée",
  failed: "Échec"

};


/* ============================================================
   ELEMENTS DOM
   ============================================================ */

const message =
  document.getElementById("message");

const authCard =
  document.getElementById("authCard");

const authEmail =
  document.getElementById("authEmail");

const authPassword =
  document.getElementById("authPassword");

const authStatus =
  document.getElementById("authStatus");

const signInButton =
  document.getElementById("signInButton");

const signUpButton =
  document.getElementById("signUpButton");

const signOutButton =
  document.getElementById("signOutButton");

const trackerCard =
  document.getElementById("trackerCard");

const batchCard =
  document.getElementById("batchCard");

const resultCard =
  document.getElementById("resultCard");

const strainSelect =
  document.getElementById("strain");

const strainInfo =
  document.getElementById("strainInfo");

const cultureCodeInput =
  document.getElementById("cultureCode");

const cultureTypeSelect =
  document.getElementById("cultureType");

const protocolSelect =
  document.getElementById("protocol");

const startedAtInput =
  document.getElementById("startedAt");

const generationInfo =
  document.getElementById("generationInfo");

const createButton =
  document.getElementById("createButton");

const termsAcceptedCheckbox =
  document.getElementById("termsAccepted");

const researchStatisticsConsentCheckbox =
  document.getElementById("researchStatisticsConsent");

const result =
  document.getElementById("result");

const batchCodeInput =
  document.getElementById("batchCode");

const batchNameInput =
  document.getElementById("batchName");

const batchTypeSelect =
  document.getElementById("batchType");

const batchCultureSelect =
  document.getElementById("batchCulture");

const batchQuantityInput =
  document.getElementById("batchQuantity");

const batchUnitInput =
  document.getElementById("batchUnit");

const createBatchButton =
  document.getElementById("createBatchButton");

const batchList =
  document.getElementById("batchList");

const batchInfo =
  document.getElementById("batchInfo");

const batchStages =
  document.getElementById("batchStages");

const batchStageList =
  document.getElementById("batchStageList");

const advanceBatchButton =
  document.getElementById("advanceBatchButton");

const reloadBatchButton =
  document.getElementById("reloadBatchButton");

const batchQc =
  document.getElementById("batchQc");

const batchQcList =
  document.getElementById("batchQcList");

const releaseBatchButton =
  document.getElementById("releaseBatchButton");

const measurementCard = document.getElementById("measurementCard");
const measurementTargetSelect = document.getElementById("measurementTarget");
const measurementVariableSelect = document.getElementById("measurementVariable");
const measurementUnitSelect = document.getElementById("measurementUnit");
const measurementValueInput = document.getElementById("measurementValue");
const measurementAtInput = document.getElementById("measurementAt");
const measurementInstrumentInput = document.getElementById("measurementInstrument");
const measurementMethodInput = document.getElementById("measurementMethod");
const measurementNoteInput = document.getElementById("measurementNote");
const saveMeasurementButton = document.getElementById("saveMeasurementButton");
const reloadMeasurementsButton = document.getElementById("reloadMeasurementsButton");
const measurementHistory = document.getElementById("measurementHistory");
const observationVariableSelect = document.getElementById("observationVariable");
const observationAtInput = document.getElementById("observationAt");
const observationValueInput = document.getElementById("observationValue");
const observationMethodInput = document.getElementById("observationMethod");
const observationInstrumentInput = document.getElementById("observationInstrument");
const observationNoteInput = document.getElementById("observationNote");
const saveObservationButton = document.getElementById("saveObservationButton");
const observationHistory = document.getElementById("observationHistory");


/* ============================================================
   OUTILS UI
   ============================================================ */

function showMessage(
  text,
  type = "success"
) {

  message.innerHTML = "";

  const div =
    document.createElement("div");

  div.className =
    `card ${type}`;

  div.setAttribute(
    "role",
    type === "error" || type === "warning"
      ? "alert"
      : "status"
  );

  div.textContent =
    text;

  message.appendChild(div);

  const reduceMotion =
    window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

  message.scrollIntoView({
    block: "nearest",
    behavior: reduceMotion ? "auto" : "smooth"
  });
}


function clearMessage() {

  message.innerHTML = "";

}


function showElement(element) {

  element.classList.remove("hidden");

}


function hideElement(element) {

  element.classList.add("hidden");

}


/* ============================================================
   SECURITE AFFICHAGE
   ============================================================ */

function escapeHtml(value) {

  if (
    value === null ||
    value === undefined
  ) {

    return "";

  }

  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

}


/* ============================================================
   AUTHENTIFICATION
   ============================================================ */

async function getCurrentSession() {

  const {
    data,
    error
  } =
    await supabaseClient.auth.getSession();

  if (error) {

    throw error;

  }

  return data.session;

}


/* ============================================================
   CLAIM BA-LABS
   ============================================================ */

async function claimBALabs() {

  const session =
    await getCurrentSession();


  if (!session) {

    throw new Error(
      "Aucune session Supabase active."
    );

  }


  const {
    data,
    error
  } =
    await supabaseClient.functions.invoke(
      "claim-ba-labs",
      {
        body: {}
      }
    );


  if (error) {

    throw new Error(
      error.message ||
      "L'appel à claim-ba-labs a échoué."
    );

  }


  if (!data) {

    throw new Error(
      "claim-ba-labs n'a retourné aucune donnée."
    );

  }


  if (!data.ok) {

    throw new Error(
      data.error ||
      "Le compte n'a pas pu être rattaché à BA-LABS."
    );

  }


  if (
    !data.organization ||
    !data.organization.id
  ) {

    throw new Error(
      "claim-ba-labs n'a pas retourné l'organisation BA-LABS."
    );

  }


  organization =
    data.organization;

  organizationId =
    data.organization.id;


  return data;

}


/* ============================================================
   CONNEXION
   ============================================================ */

async function signIn() {

  clearMessage();

  signInButton.disabled = true;
  signUpButton.disabled = true;


  try {

    const email =
      authEmail.value.trim();

    const password =
      authPassword.value;


    if (!email) {

      throw new Error(
        "Entrez une adresse email."
      );

    }


    if (!password) {

      throw new Error(
        "Entrez le mot de passe."
      );

    }


    const {
      error
    } =
      await supabaseClient.auth.signInWithPassword({

        email,
        password

      });


    if (error) {

      throw error;

    }


    await refreshAuthUI();

  }

  catch (error) {

    console.error(
      "Erreur connexion:",
      error
    );

    showMessage(
      error.message ||
      "Connexion impossible.",
      "error"
    );

  }

  finally {

    signInButton.disabled = false;
    signUpButton.disabled = false;

  }

}


/* ============================================================
   CREATION DE COMPTE
   ============================================================ */

async function signUp() {

  clearMessage();

  signInButton.disabled = true;
  signUpButton.disabled = true;


  try {

    const email =
      authEmail.value.trim();

    const password =
      authPassword.value;


    if (!email) {

      throw new Error(
        "Entrez une adresse email."
      );

    }


    if (!password) {

      throw new Error(
        "Entrez un mot de passe."
      );

    }


    if (password.length < 6) {

      throw new Error(
        "Le mot de passe doit comporter au moins 6 caractères."
      );

    }


    const {
      data,
      error
    } =
      await supabaseClient.auth.signUp({

        email,

        password,

        options: {

          emailRedirectTo:
            window.location.href

        }

      });


    if (error) {

      throw error;

    }


    if (
      data &&
      data.session
    ) {

      await refreshAuthUI();

      return;

    }


    showMessage(
      "Compte créé. Vérifiez l'email de confirmation Supabase, puis revenez ici et connectez-vous.",
      "success"
    );

  }

  catch (error) {

    console.error(
      "Erreur création compte:",
      error
    );

    showMessage(
      error.message ||
      "Création du compte impossible.",
      "error"
    );

  }

  finally {

    signInButton.disabled = false;
    signUpButton.disabled = false;

  }

}


/* ============================================================
   DECONNEXION
   ============================================================ */

async function signOut() {

  clearMessage();


  try {

    await supabaseClient.auth.signOut();

  }

  catch (error) {

    console.error(
      "Erreur déconnexion:",
      error
    );

  }


  organizationId = null;
  organization = null;
  strainOptions = [];
  referenceData = [];
  cultureOptions = [];
  latestBatches = [];
  selectedBatchId = null;
  selectedBatch = null;


  hideElement(trackerCard);
  hideElement(batchCard);
  hideElement(measurementCard);
  hideElement(document.getElementById("statisticsCard"));
  hideElement(document.getElementById("overviewCard"));
  hideElement(resultCard);
  hideElement(signOutButton);


  authStatus.textContent =
    "Non connecté.";

}


/* ============================================================
   AUTH UI
   ============================================================ */

async function refreshAuthUI() {

  const session =
    await getCurrentSession();


  if (!session) {

    hideElement(trackerCard);
    hideElement(batchCard);
    hideElement(measurementCard);
    hideElement(document.getElementById("statisticsCard"));
    hideElement(document.getElementById("overviewCard"));
    hideElement(resultCard);
    hideElement(signOutButton);

    authStatus.textContent =
      "Non connecté.";

    return;

  }


  authStatus.textContent =
    `Session détectée : ${
      session.user.email ||
      session.user.id
    }`;


  showElement(signOutButton);


  await initializeAuthenticatedTracker(
    session
  );

}


/* ============================================================
   INITIALISATION AUTHENTIFIEE
   ============================================================ */

async function initializeAuthenticatedTracker(
  session
) {

  if (
    initializationInProgress
  ) {

    return;

  }


  initializationInProgress =
    true;


  try {

    clearMessage();


    authStatus.textContent =
      `Connexion BA-LABS : ${
        session.user.email ||
        session.user.id
      }`;


    const claim =
      await claimBALabs();


    if (!organizationId) {

      throw new Error(
        "L'organisation BA-LABS n'a pas fourni d'identifiant."
      );

    }


    authStatus.textContent =
      `Connecté : ${
        session.user.email ||
        session.user.id
      } — ${
        organization.code
      } — rôle : ${
        claim.role ||
        "owner"
      }`;


    await loadStrainOptions();

    await loadReferenceData();

    await loadCultureOptions();

    await syncPendingCultures();

    await loadLatestBatches();

    try {
      await loadMeasurementReferences();
      saveMeasurementButton.disabled = false;
      saveObservationButton.disabled = false;
      try { await loadRecentMeasurements(); }
      catch (historyError) {
        console.error("Historique des mesures indisponible :", historyError);
        measurementHistory.textContent = "Impossible de charger l’historique des mesures. L’enregistrement reste disponible.";
      }
      try { await loadRecentObservations(); }
      catch (observationHistoryError) {
        console.error("Historique des observations indisponible :", observationHistoryError);
        observationHistory.textContent = "Impossible de charger l’historique des observations. L’enregistrement reste disponible.";
      }
    } catch (measurementError) {
      console.error("Initialisation du catalogue de mesures :", measurementError);
      measurementHistory.textContent = "Le catalogue des mesures est indisponible ; les modules de culture et de production restent utilisables.";
      observationHistory.textContent = "Le catalogue des observations est indisponible ; les modules de culture et de production restent utilisables.";
      saveMeasurementButton.disabled = true;
      saveObservationButton.disabled = true;
    }

    setDefaultDate();


    showElement(trackerCard);

    showElement(batchCard);
    showElement(measurementCard);
    showElement(document.getElementById("statisticsCard"));
    showElement(document.getElementById("overviewCard"));
    updateOverview();


    showMessage(
      `BA-LABS chargée — organisation ${organization.code}.`
    );

  }

  catch (error) {

    console.error(
      "Initialisation BA-LABS:",
      error
    );


    hideElement(trackerCard);
    hideElement(batchCard);
    hideElement(measurementCard);
    hideElement(document.getElementById("statisticsCard"));
    hideElement(document.getElementById("overviewCard"));


    showMessage(
      error.message ||
      "Initialisation impossible.",
      "error"
    );

  }

  finally {

    initializationInProgress =
      false;

  }

}


/* ============================================================
   DATE PAR DEFAUT
   ============================================================ */

function setDefaultDate() {

  const now =
    new Date();


  now.setMinutes(
    now.getMinutes() -
    now.getTimezoneOffset()
  );


  startedAtInput.value =
    now.toISOString()
      .slice(0, 16);

  if (measurementAtInput) {
    measurementAtInput.value = now.toISOString().slice(0, 16);
  }
  if (observationAtInput) {
    observationAtInput.value = now.toISOString().slice(0, 16);
  }

}


/* ============================================================
   SOUCHES / MATERIAUX
   ============================================================ */

async function loadStrainOptions() {

  if (!organizationId) {

    throw new Error(
      "Organisation absente avant chargement des souches."
    );

  }


  const {
    data,
    error
  } =
    await supabaseClient
      .from(
        "v_culture_creation_options"
      )
      .select(`
        organization_id,
        material_id,
        material_code,
        generation,
        material_state,
        strain_id,
        strain_code,
        strain_designation,
        organism_id,
        scientific_name,
        common_name
      `)
      .eq(
        "organization_id",
        organizationId
      )
      .order(
        "strain_code"
      );


  if (error) {

    throw new Error(
      `Chargement des souches impossible : ${error.message}`
    );

  }


  strainOptions =
    data || [];


  strainSelect.innerHTML =
    "";


  const defaultOption =
    document.createElement(
      "option"
    );


  defaultOption.value =
    "";


  defaultOption.textContent =
    strainOptions.length
      ? "Sélectionner une souche..."
      : "Aucune souche disponible";


  strainSelect.appendChild(
    defaultOption
  );


  for (
    const item of strainOptions
  ) {

    const option =
      document.createElement(
        "option"
      );


    option.value =
      item.material_id;


    const designation =
      item.strain_designation ||
      item.scientific_name ||
      item.common_name ||
      "—";


    option.textContent =
      `${item.strain_code} — ${designation} — G${item.generation}`;


    strainSelect.appendChild(
      option
    );

  }


  updateGenerationPreview();

}


/* ============================================================
   REFERENCES CULTURE
   ============================================================ */

async function loadReferenceData() {

  if (!organizationId) {

    throw new Error(
      "Organisation absente avant chargement des références."
    );

  }


  const {
    data,
    error
  } =
    await supabaseClient
      .from(
        "v_culture_creation_reference"
      )
      .select("*")
      .order(
        "reference_type"
      )
      .order(
        "code"
      );


  if (error) {

    throw new Error(
      `Chargement des références impossible : ${error.message}`
    );

  }


  referenceData =
    data || [];


  loadCultureTypes();

  loadProtocols();

}


/* ============================================================
   TYPES DE CULTURE
   ============================================================ */

function loadCultureTypes() {

  cultureTypeSelect.innerHTML =
    "";


  const defaultOption =
    document.createElement(
      "option"
    );


  defaultOption.value =
    "";


  defaultOption.textContent =
    "Sélectionner...";


  cultureTypeSelect.appendChild(
    defaultOption
  );


  const types =
    referenceData.filter(
      row =>
        row.reference_type ===
          "culture_type" ||
        row.reference_type ===
          "culture_types"
    );


  for (
    const item of types
  ) {

    const option =
      document.createElement(
        "option"
      );


    option.value =
      item.code;


    option.textContent =
      item.label ||
      item.name ||
      item.code;


    cultureTypeSelect.appendChild(
      option
    );

  }

}


/* ============================================================
   PROTOCOLES
   ============================================================ */

function loadProtocols() {

  protocolSelect.innerHTML =
    "";


  const defaultOption =
    document.createElement(
      "option"
    );


  defaultOption.value =
    "";


  defaultOption.textContent =
    "Aucun protocole";


  protocolSelect.appendChild(
    defaultOption
  );


  const protocols =
    referenceData.filter(
      row =>
        row.reference_type ===
        "protocol"
    );


  for (
    const item of protocols
  ) {

    const option =
      document.createElement(
        "option"
      );


    option.value =
      item.code;


    option.textContent =
      `${item.code} — ${
        item.name ||
        item.label ||
        ""
      }`;


    protocolSelect.appendChild(
      option
    );

  }

}


/* ============================================================
   APERCU GENERATION
   ============================================================ */

function updateGenerationPreview() {

  const materialId =
    strainSelect.value;


  const selected =
    strainOptions.find(
      item =>
        item.material_id ===
        materialId
    );


  if (!selected) {

    strainInfo.textContent =
      "Sélectionnez une souche.";

    generationInfo.textContent =
      "Génération : —";

    return;

  }


  strainInfo.innerHTML = `

    <strong>
      ${escapeHtml(
        selected.strain_code
      )}
    </strong>

    <br>

    Organisme :
    ${escapeHtml(
      selected.scientific_name ||
      selected.common_name ||
      "—"
    )}

    <br>

    Désignation :
    ${escapeHtml(
      selected.strain_designation ||
      "—"
    )}

    <br>

    Matériel parent :
    <code>
      ${escapeHtml(
        selected.material_code
      )}
    </code>

    <br>

    Génération actuelle :
    <strong>
      G${escapeHtml(
        selected.generation
      )}
    </strong>

  `;


  const nextGeneration =
    Number(
      selected.generation
    ) + 1;


  generationInfo.innerHTML = `

    Matériel parent :
    <code>
      ${escapeHtml(
        selected.material_code
      )}
    </code>

    →

    nouvelle culture :

    <strong>
      G${escapeHtml(
        nextGeneration
      )}
    </strong>

  `;

}


/* ============================================================
   PROTOCOLE → VERSION
   ============================================================ */

async function getProtocolVersionId(
  protocolCode
) {

  if (!protocolCode) {

    return null;

  }


  const {
    data: protocol,
    error: protocolError
  } =
    await supabaseClient
      .from("protocols")
      .select("id")
      .eq(
        "organization_id",
        organizationId
      )
      .eq(
        "code",
        protocolCode
      )
      .maybeSingle();


  if (protocolError) {

    throw new Error(
      `Erreur protocole : ${protocolError.message}`
    );

  }


  if (!protocol) {

    return null;

  }


  const {
    data: versions,
    error: versionError
  } =
    await supabaseClient
      .from("protocol_versions")
      .select(
        "id, version, created_at"
      )
      .eq(
        "organization_id",
        organizationId
      )
      .eq(
        "protocol_id",
        protocol.id
      )
      .order(
        "created_at",
        {
          ascending: false
        }
      )
      .limit(1);


  if (versionError) {

    throw new Error(
      `Erreur version protocole : ${versionError.message}`
    );

  }


  if (
    !versions ||
    versions.length === 0
  ) {

    return null;

  }


  return versions[0].id;

}


/* ============================================================
   CREATION CULTURE
   ============================================================ */

let syncInProgress = false;


function setSyncStatus(
  text,
  showRetry
) {

  const statusEl =
    document.getElementById("syncStatus");

  const retryEl =
    document.getElementById("retrySyncButton");

  if (statusEl) {
    statusEl.textContent = text;
  }

  if (retryEl) {
    retryEl.classList.toggle(
      "hidden",
      !showRetry
    );
  }
}


async function syncPendingCultures() {
  if (!organizationId) return;

  if (syncInProgress) return;

  syncInProgress = true;

  setSyncStatus(
    "Synchronisation Notion en cours...",
    false
  );

  try {

    // Les cultures en erreur sont reprises : la fonction serveur est
    // idempotente (elle retrouve la page Notion existante avant d'en créer une).
    const { data: cultures, error } = await supabaseClient
      .from("cultures")
      .select("id, code")
      .eq("organization_id", organizationId)
      .in("notion_sync_status", ["pending", "error"])
      .order("created_at", { ascending: true })
      .limit(20);

    if (error) {
      console.error(
        "Erreur lors du chargement des cultures à synchroniser :",
        error.message
      );

      setSyncStatus(
        "État de synchronisation Notion indisponible.",
        true
      );

      return;
    }

    let synced = 0;
    let failed = 0;
    let lastError = "";

    for (const culture of cultures || []) {
      try {
        const { data, error: syncError } =
          await supabaseClient.functions.invoke(
            "sync-culture-to-notion",
            { body: { culture_id: culture.id } }
          );

        if (syncError || !data?.ok) {
          failed += 1;

          lastError =
            data?.error ||
            syncError?.message ||
            "Erreur inconnue";

          console.error(
            "Échec de synchronisation Notion :",
            culture.code,
            lastError
          );
        } else {
          synced += 1;

          console.info(
            "Culture synchronisée avec Notion :",
            culture.code
          );
        }
      } catch (err) {
        failed += 1;

        lastError =
          err?.message ||
          "Erreur inattendue";

        console.error(
          "Erreur inattendue de synchronisation :",
          culture.code,
          err
        );
      }
    }

    if (failed > 0) {
      setSyncStatus(
        `Synchronisation Notion : ${failed} culture(s) en échec. Dernière erreur : ${lastError}`,
        true
      );
    } else if (synced > 0) {
      setSyncStatus(
        `Synchronisation Notion terminée (${synced} culture(s)).`,
        false
      );
    } else {
      setSyncStatus(
        "Synchronisation Notion à jour.",
        false
      );
    }

  } finally {

    syncInProgress = false;

  }
}


async function createCulture() {

  clearMessage();


  const materialId =
    strainSelect.value;

  const cultureCode =
    cultureCodeInput.value.trim();

  const cultureType =
    cultureTypeSelect.value;

  const protocolCode =
    protocolSelect.value;

  const startedAt =
    startedAtInput.value;


  if (!organizationId) {

    showMessage(
      "Organisation BA-LABS absente. Rechargez la page et reconnectez-vous.",
      "error"
    );

    return;

  }


  if (!materialId) {

    showMessage(
      "Sélectionnez une souche.",
      "error"
    );

    return;

  }


  if (!cultureCode) {

    showMessage(
      "Entrez un code de culture.",
      "error"
    );

    return;

  }


  if (!cultureType) {

    showMessage(
      "Sélectionnez un type de culture.",
      "error"
    );

    return;

  }

  if (!termsAcceptedCheckbox.checked) {
    showMessage(
      "Vous devez accepter les conditions d’utilisation pour créer une culture. Le consentement statistique reste facultatif.",
      "error"
    );
    termsAcceptedCheckbox.focus();
    return;
  }

  const session =
    await getCurrentSession();


  if (!session) {

    showMessage(
      "Votre session a expiré. Reconnectez-vous.",
      "error"
    );

    return;

  }


  createButton.disabled =
    true;

  createButton.textContent =
    "Création...";


  try {

    // Enregistrer l’acceptation des conditions et le choix statistique séparément.
    const researchStatisticsOptIn =
      researchStatisticsConsentCheckbox.checked;

    const consentTable =
      supabaseClient.from("culture_data_consents");

    const {
      data: existingConsent,
      error: consentLookupError
    } = await consentTable
      .select("id")
      .eq("organization_id", organizationId)
      .eq("user_id", session.user.id)
      .eq("terms_version", "2026-10-09-v1")
      .maybeSingle();

    if (consentLookupError) {
      throw new Error(
        `Impossible de vérifier le consentement : ${consentLookupError.message}`
      );
    }

    const consentValues = {
      research_statistics_opt_in: researchStatisticsOptIn,
      research_opt_in_at: researchStatisticsOptIn
        ? new Date().toISOString()
        : null
    };

    let consentError;

    if (existingConsent) {
      // Conserver la date de première acceptation des conditions.
      const updateResult = await consentTable
        .update(consentValues)
        .eq("id", existingConsent.id);
      consentError = updateResult.error;
    } else {
      const insertResult = await consentTable
        .insert({
          organization_id: organizationId,
          user_id: session.user.id,
          terms_version: "2026-10-09-v1",
          terms_accepted_at: new Date().toISOString(),
          ...consentValues
        });
      consentError = insertResult.error;
    }

    if (consentError) {
      throw new Error(
        `Impossible d’enregistrer votre choix de consentement : ${consentError.message}`
      );
    }

    const protocolVersionId =
      await getProtocolVersionId(
        protocolCode
      );


    const {
      data,
      error
    } =
      await supabaseClient.rpc(
        "create_culture_with_generation",
        {

          p_organization_id:
            organizationId,

          p_code:
            cultureCode,

          p_culture_type:
            cultureType,

          p_parent_material_id:
            materialId,

          p_parent_culture_id:
            null,

          p_protocol_version_id:
            protocolVersionId,

          p_environment_id:
            null,

          p_experiment_id:
            null,

          p_experimental_unit_id:
            null,

          p_started_at:
            startedAt
              ? new Date(
                  startedAt
                ).toISOString()
              : null,

          p_metadata: {

            source:
              "BA Labs Culture Tracker",

            interface_version:
              "2.0"

          }

        }
      );


    if (error) {

      throw new Error(
        error.message
      );

    }


    const created =
      (Array.isArray(data) ? data[0] : data) || {};

    // La culture reste créée dans Supabase même si la synchronisation Notion échoue.
    let notionSyncMessage =
      "Synchronisation Notion en cours ou en attente.";

    if (created.culture_id) {
      try {
        const { data: syncData, error: syncError } =
          await supabaseClient.functions.invoke(
            "sync-culture-to-notion",
            {
              body: {
                culture_id: created.culture_id
              }
            }
          );

        if (syncError) {
          notionSyncMessage =
            `Culture enregistrée dans Supabase. Synchronisation Notion à vérifier : ${syncError.message}`;
        } else if (syncData && syncData.ok) {
          notionSyncMessage =
            "Culture synchronisée avec Notion.";
        } else {
          notionSyncMessage =
            `Culture enregistrée dans Supabase. Notion : ${
              syncData?.error || "synchronisation non confirmée"
            }.`;
        }
      } catch (syncError) {
        console.error("Synchronisation Notion:", syncError);
        notionSyncMessage =
          "Culture enregistrée dans Supabase, mais la synchronisation Notion a échoué. Vérifiez le statut dans Supabase.";
      }
    } else {
      notionSyncMessage =
        "Culture enregistrée dans Supabase. L’identifiant de culture n’a pas été retourné ; la synchronisation Notion n’a pas été lancée.";
    }

    showElement(
      resultCard
    );


    result.className =
      "info success";


    result.innerHTML = `

      <strong>
        Culture créée avec succès.
      </strong>

      <br><br>

      Culture :
      <code>
        ${escapeHtml(
          created.culture_code ||
          cultureCode
        )}
      </code>

      <br>

      Matériel dérivé :
      <code>
        ${escapeHtml(
          created.material_code ||
          "—"
        )}
      </code>

      <br>

      Génération :
      <strong>
        G${escapeHtml(
          created.generation ??
          "—"
        )}
      </strong>

      <br>

      ID culture :
      <code>
        ${escapeHtml(
          created.culture_id ||
          "—"
        )}
      </code>

      <br>

      ID matériel :
      <code>
        ${escapeHtml(
          created.material_id ||
          "—"
        )}
      </code>

      <br><br>

      <strong>Synchronisation :</strong>
      ${escapeHtml(notionSyncMessage)}

    `;


    showMessage(
      notionSyncMessage,
      notionSyncMessage.includes("échoué") ||
      notionSyncMessage.includes("à vérifier") ||
      notionSyncMessage.includes("pas été lancée")
        ? "warning"
        : "success"
    );


    cultureCodeInput.value =
      "";


    await loadStrainOptions();

    await loadCultureOptions();

  }

  catch (error) {

    console.error(
      "Création culture:",
      error
    );


    showElement(
      resultCard
    );


    result.className =
      "info error";


    result.innerHTML = `

      <strong>
        Création impossible
      </strong>

      <br><br>

      ${escapeHtml(
        error.message ||
        String(error)
      )}

    `;


    showMessage(
      error.message ||
      "La création de la culture a échoué.",
      "error"
    );

  }

  finally {

    createButton.disabled =
      false;

    createButton.textContent =
      "Créer la culture";

  }

}


/* ============================================================
   CULTURES DISPONIBLES POUR LES BATCHS
   ============================================================ */

async function loadCultureOptions() {

  if (!organizationId) {

    return;

  }


  const {
    data,
    error
  } =
    await supabaseClient
      .from("cultures")
      .select(`
        id,
        code,
        culture_type,
        material_id,
        started_at
      `)
      .eq(
        "organization_id",
        organizationId
      )
      .order(
        "created_at",
        {
          ascending: false
        }
      )
      .limit(100);


  if (error) {

    throw new Error(
      `Chargement des cultures impossible : ${error.message}`
    );

  }


  cultureOptions =
    data || [];

  renderCultureCatalog();
  renderMeasurementTargets();
  renderStatisticsFilters();
  updateOverview();

  batchCultureSelect.innerHTML =
    "";


  const defaultOption =
    document.createElement(
      "option"
    );


  defaultOption.value =
    "";


  defaultOption.textContent =
    cultureOptions.length
      ? "Sélectionner une culture..."
      : "Aucune culture disponible";


  batchCultureSelect.appendChild(
    defaultOption
  );


  for (
    const culture of cultureOptions
  ) {

    const option =
      document.createElement(
        "option"
      );


    option.value =
      culture.id;


    option.textContent =
      `${culture.code} — ${
        culture.culture_type ||
        "culture"
      }`;


    batchCultureSelect.appendChild(
      option
    );

  }

}


/* ============================================================
   BATCHS EXISTANTS
   ============================================================ */

async function loadLatestBatches() {

  if (!organizationId) {

    return;

  }


  const {
    data,
    error
  } =
    await supabaseClient
      .from("batches")
      .select(`
        id,
        batch_code,
        name,
        batch_type,
        status,
        current_stage,
        culture_id,
        material_id,
        planned_at,
        quantity_planned,
        quantity_actual,
        quantity_unit_code,
        created_at
      `)
      .eq(
        "organization_id",
        organizationId
      )
      .order(
        "created_at",
        {
          ascending: false
        }
      )
      .limit(30);


  if (error) {

    throw new Error(
      `Chargement des batchs impossible : ${error.message}`
    );

  }


  latestBatches =
    data || [];


  renderBatchList();
  renderMeasurementTargets();
  renderStatisticsFilters();
  renderComparisonBatchOptions();

}


/* ============================================================
   LISTE BATCHS
   ============================================================ */

function renderBatchList() {

  batchList.innerHTML =
    "";


  if (
    latestBatches.length === 0
  ) {

    batchList.innerHTML = `

      <div class="info muted">
        Aucun batch créé pour le moment.
      </div>

    `;

    return;

  }


  for (
    const batch of latestBatches
  ) {

    const button =
      document.createElement(
        "button"
      );


    button.type =
      "button";

    button.className =
      "batch-item";


    button.innerHTML = `

      <strong>
        ${escapeHtml(
          batch.batch_code
        )}
      </strong>

      <br>

      <span class="muted">
        ${escapeHtml(
          batch.name ||
          "Sans nom"
        )}
        —
        ${escapeHtml(
          batch.batch_type ||
          "—"
        )}
        —
        ${escapeHtml(
          batch.current_stage ||
          "—"
        )}
        —
        ${escapeHtml(
          batch.status ||
          "—"
        )}
      </span>

    `;


    button.addEventListener(
      "click",
      () =>
        loadBatch(
          batch.id
        )
    );


    batchList.appendChild(
      button
    );

  }

}


/* ============================================================
   CHARGEMENT D'UN BATCH
   ============================================================ */

let batchDetailRequestId = 0;

async function loadBatch(
  batchId
) {

  if (!organizationId) {

    return;

  }


  const requestId = ++batchDetailRequestId;
  selectedBatchId =
    batchId;


  clearMessage();


  const {
    data: batch,
    error: batchError
  } =
    await supabaseClient
      .from("batches")
      .select(`
        id,
        organization_id,
        batch_code,
        name,
        batch_type,
        status,
        current_stage,
        material_id,
        culture_id,
        protocol_version_id,
        location_id,
        environment_id,
        planned_at,
        started_at,
        completed_at,
        quantity_planned,
        quantity_actual,
        quantity_unit_code,
        metadata,
        created_at
      `)
      .eq(
        "organization_id",
        organizationId
      )
      .eq(
        "id",
        batchId
      )
      .single();

  if (requestId !== batchDetailRequestId) return;

  if (batchError) {

    showMessage(
      `Chargement du batch impossible : ${batchError.message}`,
      "error"
    );

    return;

  }


  selectedBatch =
    batch;


  const {
    data: stages,
    error: stagesError
  } =
    await supabaseClient
      .from("batch_stages")
      .select(`
        id,
        batch_id,
        stage_code,
        sequence_no,
        status,
        planned_start_at,
        started_at,
        completed_at,
        notes,
        metadata
      `)
      .eq(
        "organization_id",
        organizationId
      )
      .eq(
        "batch_id",
        batchId
      )
      .order(
        "sequence_no"
      );

  if (requestId !== batchDetailRequestId) return;

  if (stagesError) {

    showMessage(
      `Chargement des étapes impossible : ${stagesError.message}`,
      "error"
    );

    return;

  }


  const {
    data: qcChecks,
    error: qcError
  } =
    await supabaseClient
      .from("batch_qc_checks")
      .select(`
        id,
        batch_id,
        check_code,
        label,
        status,
        value_text,
        measured_value,
        unit_code,
        notes,
        checked_at,
        checked_by
      `)
      .eq(
        "organization_id",
        organizationId
      )
      .eq(
        "batch_id",
        batchId
      )
      .order(
        "check_code"
      );

  if (requestId !== batchDetailRequestId) return;

  if (qcError) {

    showMessage(
      `Chargement du QC impossible : ${qcError.message}`,
      "error"
    );

    return;

  }


  renderBatchInfo(
    batch
  );

  renderBatchStages(
    stages || []
  );

  renderBatchQc(
    qcChecks || []
  );


  showElement(
    batchInfo
  );

  showElement(
    batchStages
  );

  showElement(
    batchQc
  );


  updateBatchActionState(
    batch,
    stages || [],
    qcChecks || []
  );

}


/* ============================================================
   INFORMATIONS BATCH
   ============================================================ */

function renderBatchInfo(
  batch
) {

  const plannedQuantity =
    batch.quantity_planned === null ||
    batch.quantity_planned === undefined
      ? "—"
      : `${batch.quantity_planned} ${
          batch.quantity_unit_code ||
          ""
        }`;


  const actualQuantity =
    batch.quantity_actual === null ||
    batch.quantity_actual === undefined
      ? "—"
      : `${batch.quantity_actual} ${
          batch.quantity_unit_code ||
          ""
        }`;


  batchInfo.className =
    "info";


  batchInfo.innerHTML = `

    <strong>
      ${escapeHtml(
        batch.batch_code
      )}
    </strong>

    <div class="batch-grid">

      <div class="batch-stat">

        <div class="batch-stat-label">
          Nom
        </div>

        <div class="batch-stat-value">
          ${escapeHtml(
            batch.name ||
            "—"
          )}
        </div>

      </div>


      <div class="batch-stat">

        <div class="batch-stat-label">
          Type
        </div>

        <div class="batch-stat-value">
          ${escapeHtml(
            batch.batch_type ||
            "—"
          )}
        </div>

      </div>


      <div class="batch-stat">

        <div class="batch-stat-label">
          Statut
        </div>

        <div class="batch-stat-value">
          ${escapeHtml(
            batch.status ||
            "—"
          )}
        </div>

      </div>


      <div class="batch-stat">

        <div class="batch-stat-label">
          Étape actuelle
        </div>

        <div class="batch-stat-value">
          ${escapeHtml(
            BATCH_STAGE_LABELS[
              batch.current_stage
            ] ||
            batch.current_stage ||
            "—"
          )}
        </div>

      </div>


      <div class="batch-stat">

        <div class="batch-stat-label">
          Quantité prévue
        </div>

        <div class="batch-stat-value">
          ${escapeHtml(
            plannedQuantity
          )}
        </div>

      </div>


      <div class="batch-stat">

        <div class="batch-stat-label">
          Quantité réelle
        </div>

        <div class="batch-stat-value">
          ${escapeHtml(
            actualQuantity
          )}
        </div>

      </div>

    </div>

  `;

}


/* ============================================================
   ETAPES BATCH
   ============================================================ */

function renderBatchStages(
  stages
) {

  batchStageList.innerHTML =
    "";


  const stageMap =
    new Map(
      stages.map(
        stage =>
          [
            stage.stage_code,
            stage
          ]
      )
    );


  for (
    let index = 0;
    index < BATCH_STAGES.length;
    index++
  ) {

    const stageCode =
      BATCH_STAGES[index];


    const stage =
      stageMap.get(
        stageCode
      );


    const div =
      document.createElement(
        "div"
      );


    const status =
      stage
        ? stage.status
        : "pending";


    div.className =
      `stage ${
        status === "active"
          ? "active"
          : status === "completed"
            ? "completed"
            : status === "failed"
              ? "failed"
              : ""
      }`;


    const statusClass =
      status === "active"
        ? "status-active"
        : status === "completed"
          ? "status-completed"
          : status === "failed"
            ? "status-failed"
            : "status-pending";


    div.innerHTML = `

      <div class="stage-number">
        ${index + 1}
      </div>

      <div>

        <div class="stage-name">
          ${escapeHtml(
            BATCH_STAGE_LABELS[
              stageCode
            ] ||
            stageCode
          )}
        </div>

        <div class="muted">
          ${escapeHtml(
            stageCode
          )}
        </div>

      </div>

      <div class="stage-status ${statusClass}">
        ${escapeHtml(
          STAGE_STATUS_LABELS[status] || status
        )}
      </div>

    `;


    batchStageList.appendChild(
      div
    );

  }

}


/* ============================================================
   QC
   ============================================================ */

function renderBatchQc(
  qcChecks
) {

  batchQcList.innerHTML =
    "";


  if (
    qcChecks.length === 0
  ) {

    batchQcList.innerHTML = `

      <div class="info warning">
        Aucun contrôle QC n'a été généré pour ce batch.
        La libération sera donc refusée par Supabase.
      </div>

    `;

    return;

  }


  for (
    const check of qcChecks
  ) {

    const row =
      document.createElement(
        "div"
      );


    row.className =
      "qc-row";


    const status =
      check.status ||
      "pending";


    row.innerHTML = `

      <div>

        <div class="qc-label">
          ${escapeHtml(
            check.label ||
            check.check_code
          )}
        </div>

        <span class="qc-code">
          ${escapeHtml(
            check.check_code
          )}
        </span>

      </div>


      <select
        data-qc-status="${escapeHtml(
          check.id
        )}"
        aria-label="Statut du contrôle ${escapeHtml(
          check.label || check.check_code
        )}"
      >

        <option
          value="pending"
          ${status === "pending" ? "selected" : ""}
        >
          En attente
        </option>

        <option
          value="pass"
          ${status === "pass" ? "selected" : ""}
        >
          Conforme
        </option>

        <option
          value="fail"
          ${status === "fail" ? "selected" : ""}
        >
          Échec
        </option>

        <option
          value="waived"
          ${status === "waived" ? "selected" : ""}
        >
          Dérogation
        </option>

      </select>


      <button
        type="button"
        class="small-button qc-save"
        data-qc-save="${escapeHtml(
          check.id
        )}"
      >
        Enregistrer
      </button>

    `;


    batchQcList.appendChild(
      row
    );

  }


  const saveButtons =
    batchQcList.querySelectorAll(
      "[data-qc-save]"
    );


  for (
    const button of saveButtons
  ) {

    button.addEventListener(
      "click",
      () =>
        saveQcCheck(
          button.dataset.qcSave
        )
    );

  }

}


/* ============================================================
   ENREGISTREMENT QC
   ============================================================ */

const qcSavesInFlight =
  new Set();


async function saveQcCheck(
  checkId
) {

  if (qcSavesInFlight.has(checkId)) {

    return;

  }

  qcSavesInFlight.add(checkId);

  const button =
    batchQcList.querySelector(
      `[data-qc-save="${CSS.escape(checkId)}"]`
    );

  const label =
    button
      ? button.textContent
      : "";

  if (button) {

    button.disabled = true;

    button.textContent =
      "Enregistrement...";

  }

  try {

    await saveQcCheckNow(
      checkId
    );

  }

  finally {

    qcSavesInFlight.delete(checkId);

    // Après un enregistrement réussi la liste est re-rendue : l'ancien bouton n'est plus dans le DOM.
    if (button && button.isConnected) {

      button.disabled = false;

      button.textContent = label;

    }

  }

}


async function saveQcCheckNow(
  checkId
) {

  if (!organizationId) {

    return;

  }


  const select =
    batchQcList.querySelector(
      `[data-qc-status="${CSS.escape(checkId)}"]`
    );


  if (!select) {

    return;

  }


  const newStatus =
    select.value;


  const {
    data: sessionData
  } =
    await supabaseClient.auth.getSession();


  if (!sessionData.session) {

    showMessage(
      "Votre session a expiré.",
      "error"
    );

    return;

  }


  const update = {

    status:
      newStatus,

    checked_at:
      newStatus === "pending"
        ? null
        : new Date().toISOString(),

    checked_by:
      newStatus === "pending"
        ? null
        : sessionData.session.user.id

  };


  const {
    error
  } =
    await supabaseClient
      .from("batch_qc_checks")
      .update(update)
      .eq(
        "organization_id",
        organizationId
      )
      .eq(
        "id",
        checkId
      );


  if (error) {

    showMessage(
      `Enregistrement QC impossible : ${error.message}`,
      "error"
    );

    return;

  }


  showMessage(
    "Contrôle qualité enregistré."
  );


  await loadBatch(
    selectedBatchId
  );

}


/* ============================================================
   ETAT DES ACTIONS BATCH
   ============================================================ */

function updateBatchActionState(
  batch,
  stages,
  qcChecks
) {

  const currentStage =
    batch.current_stage;


  const currentStageData =
    stages.find(
      stage =>
        stage.stage_code ===
        currentStage
    );


  const currentStatus =
    currentStageData
      ? currentStageData.status
      : null;


  /*
   * La fonction SQL accepte l'avancement
   * même si la première étape est encore
   * marquée pending.
   *
   * On expose donc l'action pour tout batch
   * non libéré et non déjà au QC.
   */

  const canAdvance =
    batch.status !== "released" &&
    currentStage !== "qc" &&
    currentStage !== "release";


  advanceBatchButton.disabled =
    !canAdvance;


  if (currentStage === "qc") {

    advanceBatchButton.textContent =
      "QC : utiliser la libération";

  }

  else if (
    currentStage === "release"
  ) {

    advanceBatchButton.textContent =
      "Batch terminé";

  }

  else {

    advanceBatchButton.textContent =
      currentStatus === "pending"
        ? "Démarrer / passer à l'étape suivante"
        : "Passer à l'étape suivante";

  }


  const qcComplete =
    qcChecks.length > 0 &&
    qcChecks.every(
      check =>
        check.status === "pass" ||
        check.status === "waived"
    );


  releaseBatchButton.disabled =
    batch.current_stage !== "qc" ||
    !qcComplete ||
    batch.status === "released";


  if (
    batch.current_stage === "qc"
  ) {

    showElement(
      releaseBatchButton
    );

  }

  else {

    hideElement(
      releaseBatchButton
    );

  }

}


/* ============================================================
   CREATION BATCH
   ============================================================ */

async function createBatch() {

  clearMessage();


  if (!organizationId) {

    showMessage(
      "Organisation BA-LABS absente.",
      "error"
    );

    return;

  }


  const batchCode =
    batchCodeInput.value.trim();

  const batchName =
    batchNameInput.value.trim();

  const batchType =
    batchTypeSelect.value;

  const cultureId =
    batchCultureSelect.value;

  const quantityRaw =
    batchQuantityInput.value;

  const quantityUnit =
    batchUnitInput.value.trim();


  if (!batchCode) {

    showMessage(
      "Entrez un code de batch.",
      "error"
    );

    return;

  }


  if (!batchName) {

    showMessage(
      "Entrez un nom de batch.",
      "error"
    );

    return;

  }


  if (!batchType) {

    showMessage(
      "Sélectionnez un type de batch.",
      "error"
    );

    return;

  }


  if (!cultureId) {

    showMessage(
      "Sélectionnez une culture source.",
      "error"
    );

    return;

  }


  let selectedCulture =
    cultureOptions.find(
      culture =>
        culture.id ===
        cultureId
    );


  if (!selectedCulture) {

    throw new Error(
      "La culture sélectionnée n'est plus disponible."
    );

  }


  const quantityPlanned =
    quantityRaw === ""
      ? null
      : Number(quantityRaw);


  if (
    quantityPlanned !== null &&
    (
      !Number.isFinite(
        quantityPlanned
      ) ||
      quantityPlanned < 0
    )
  ) {

    showMessage(
      "La quantité prévue est invalide.",
      "error"
    );

    return;

  }


  const protocolVersionId =
    await getCultureProtocolVersionId(
      selectedCulture.id
    );


  const selectedMaterialId =
    selectedCulture.material_id;


  createBatchButton.disabled =
    true;

  createBatchButton.textContent =
    "Création...";


  try {

    const {
      data,
      error
    } =
      await supabaseClient.rpc(
        "create_batch_with_stages",
        {

          p_organization_id:
            organizationId,

          p_batch_code:
            batchCode,

          p_name:
            batchName,

          p_batch_type:
            batchType,

          p_protocol_version_id:
            protocolVersionId,

          p_material_id:
            selectedMaterialId,

          p_culture_id:
            cultureId,

          p_location_id:
            null,

          p_environment_id:
            null,

          p_planned_at:
            new Date().toISOString(),

          p_quantity_planned:
            quantityPlanned,

          p_quantity_unit_code:
            quantityUnit ||
            null,

          p_stages:
            BATCH_STAGES

        }
      );


    if (error) {

      throw new Error(
        error.message
      );

    }


    const createdBatch =
      Array.isArray(data)
        ? data[0]
        : data;


    batchCodeInput.value =
      "";

    batchNameInput.value =
      "";

    batchQuantityInput.value =
      "";

    batchUnitInput.value =
      "";


    showElement(
      resultCard
    );


    result.className =
      "info success";


    result.innerHTML = `

      <strong>
        Batch créé avec succès.
      </strong>

      <br><br>

      Batch :
      <code>
        ${escapeHtml(
          createdBatch?.batch_code ||
          batchCode
        )}
      </code>

      <br>

      ID :
      <code>
        ${escapeHtml(
          createdBatch?.id ||
          "—"
        )}
      </code>

      <br>

      Première étape :
      <strong>
        Préparation
      </strong>

    `;


    showMessage(
      "Batch créé dans Supabase."
    );


    await loadLatestBatches();


    if (
      createdBatch &&
      createdBatch.id
    ) {

      await loadBatch(
        createdBatch.id
      );

    }

  }

  catch (error) {

    console.error(
      "Création batch:",
      error
    );


    showMessage(
      error.message ||
      "La création du batch a échoué.",
      "error"
    );

  }

  finally {

    createBatchButton.disabled =
      false;

    createBatchButton.textContent =
      "Créer le batch";

  }

}


/* ============================================================
   PROTOCOLE D'UNE CULTURE
   ============================================================ */

async function getCultureProtocolVersionId(
  cultureId
) {

  const {
    data: culture,
    error: cultureError
  } =
    await supabaseClient
      .from("cultures")
      .select(
        "protocol_version_id"
      )
      .eq(
        "organization_id",
        organizationId
      )
      .eq(
        "id",
        cultureId
      )
      .single();


  if (cultureError) {

    throw new Error(
      `Impossible de récupérer le protocole de la culture : ${cultureError.message}`
    );

  }


  return culture.protocol_version_id ||
    null;

}


/* ============================================================
   AVANCEMENT D'UNE ETAPE
   ============================================================ */

async function advanceBatch() {

  if (
    !selectedBatchId ||
    !selectedBatch
  ) {

    showMessage(
      "Sélectionnez d'abord un batch.",
      "error"
    );

    return;

  }


  const expectedStage =
    selectedBatch.current_stage;


  if (
    !expectedStage ||
    expectedStage === "qc" ||
    expectedStage === "release"
  ) {

    showMessage(
      "Cette étape ne peut pas être avancée avec cette action.",
      "warning"
    );

    return;

  }


  advanceBatchButton.disabled =
    true;

  advanceBatchButton.textContent =
    "Avancement...";


  try {

    const {
      data,
      error
    } =
      await supabaseClient.rpc(
        "advance_batch_stage",
        {

          p_batch_id:
            selectedBatchId,

          p_expected_stage:
            expectedStage

        }
      );


    if (error) {

      throw new Error(
        error.message
      );

    }


    const advanced =
      Array.isArray(data)
        ? data[0]
        : data;


    showMessage(
      `Batch avancé : ${
        BATCH_STAGE_LABELS[
          advanced?.current_stage
        ] ||
        advanced?.current_stage ||
        "étape suivante"
      }.`
    );


    await loadLatestBatches();

    await loadBatch(
      selectedBatchId
    );

  }

  catch (error) {

    console.error(
      "Avancement batch:",
      error
    );


    showMessage(
      error.message ||
      "Impossible d'avancer le batch.",
      "error"
    );

  }

  finally {

    advanceBatchButton.disabled =
      false;

  }

}


/* ============================================================
   LIBERATION DU BATCH
   ============================================================ */

async function releaseBatch() {

  if (!selectedBatchId) {

    showMessage(
      "Sélectionnez d'abord un batch.",
      "error"
    );

    return;

  }


  releaseBatchButton.disabled =
    true;

  releaseBatchButton.textContent =
    "Vérification QC...";


  try {

    const {
      data,
      error
    } =
      await supabaseClient.rpc(
        "release_batch",
        {

          p_batch_id:
            selectedBatchId

        }
      );


    if (error) {

      throw new Error(
        error.message
      );

    }


    const released =
      Array.isArray(data)
        ? data[0]
        : data;


    showMessage(
      `Batch ${released?.batch_code || ""} libéré avec succès.`
    );


    await loadLatestBatches();

    await loadBatch(
      selectedBatchId
    );

  }

  catch (error) {

    console.error(
      "Libération batch:",
      error
    );


    showMessage(
      error.message ||
      "Le batch ne peut pas être libéré.",
      "error"
    );

  }

  finally {

    releaseBatchButton.disabled =
      false;

    releaseBatchButton.textContent =
      "Libérer le batch";

  }

}


/* ============================================================
   EVENEMENTS
   ============================================================ */

strainSelect.addEventListener(
  "change",
  updateGenerationPreview
);


createButton.addEventListener(
  "click",
  createCulture
);


createBatchButton.addEventListener(
  "click",
  createBatch
);


advanceBatchButton.addEventListener(
  "click",
  advanceBatch
);


releaseBatchButton.addEventListener(
  "click",
  releaseBatch
);


reloadBatchButton.addEventListener(
  "click",
  async () => {

    try {

      await loadLatestBatches();

      if (
        selectedBatchId
      ) {

        await loadBatch(
          selectedBatchId
        );

      }

    }

    catch (error) {

      showMessage(
        error.message ||
        "Actualisation impossible.",
        "error"
      );

    }

  }
);


signInButton.addEventListener(
  "click",
  signIn
);


signUpButton.addEventListener(
  "click",
  signUp
);


signOutButton.addEventListener(
  "click",
  signOut
);


/* ============================================================
   CHANGEMENT DE SESSION
   ============================================================ */

supabaseClient.auth.onAuthStateChange(
  (
    event,
    session
  ) => {

    setTimeout(
      () => {

        refreshAuthUI()
          .catch(
            error => {

              console.error(
                "Auth state:",
                error
              );

            }
          );

      },
      0
    );

  }
);


/* ============================================================
   DEMARRAGE
   ============================================================ */

async function init() {

  try {

    const session =
      await getCurrentSession();


    if (!session) {

      authStatus.textContent =
        "Non connecté.";

      hideElement(
        trackerCard
      );

      hideElement(
        batchCard
      );
      hideElement(measurementCard);
      hideElement(document.getElementById("statisticsCard"));
      hideElement(document.getElementById("overviewCard"));

      return;

    }


    await refreshAuthUI();

  }

  catch (error) {

    console.error(
      "Initialisation:",
      error
    );


    showMessage(
      error.message ||
      "Initialisation impossible.",
      "error"
    );

  }

}


/* ============================================================
   INTERFACE : chargement, accessibilité, progression
   ============================================================ */


/* ============================================================
   MESURES EXPERIMENTALES — MODELE GENERIQUE
   ============================================================ */

async function loadMeasurementReferences() {
  const [variableResult, unitResult] = await Promise.all([
    supabaseClient.from("variables")
      .select("code, label, dimension, canonical_unit_code, description")
      .order("label"),
    supabaseClient.from("units")
      .select("code, label, dimension, factor, offset_value, is_linear")
      .order("code")
  ]);

  if (variableResult.error) {
    throw new Error(`Chargement des paramètres de mesure impossible : ${variableResult.error.message}`);
  }
  if (unitResult.error) {
    throw new Error(`Chargement des unités impossible : ${unitResult.error.message}`);
  }

  measurementVariables = variableResult.data || [];
  measurementUnits = unitResult.data || [];

  measurementVariableSelect.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = measurementVariables.length
    ? "Sélectionner un paramètre…"
    : "Aucun paramètre disponible";
  measurementVariableSelect.appendChild(placeholder);

  for (const variable of measurementVariables) {
    const option = document.createElement("option");
    option.value = variable.code;
    option.textContent = `${variable.label} · ${variable.code}`;
    measurementVariableSelect.appendChild(option);
  }

  observationVariableSelect.innerHTML = "";
  const observationPlaceholder = document.createElement("option");
  observationPlaceholder.value = "";
  observationPlaceholder.textContent = measurementVariables.length ? "Sélectionner une catégorie…" : "Aucune catégorie disponible";
  observationVariableSelect.appendChild(observationPlaceholder);
  for (const variable of measurementVariables) {
    const option = document.createElement("option");
    option.value = variable.code;
    option.textContent = `${variable.label} · ${variable.code}`;
    observationVariableSelect.appendChild(option);
  }

  renderMeasurementTargets();
  updateMeasurementUnits();
  renderStatisticsFilters();
}

function renderMeasurementTargets() {
  if (!measurementTargetSelect) return;
  const previous = measurementTargetSelect.value;
  measurementTargetSelect.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = cultureOptions.length || latestBatches.length
    ? "Choisir une culture ou un lot…"
    : "Créez d’abord une culture ou un lot";
  measurementTargetSelect.appendChild(placeholder);

  if (cultureOptions.length) {
    const group = document.createElement("optgroup");
    group.label = "Cultures";
    for (const culture of cultureOptions) {
      const option = document.createElement("option");
      option.value = `culture:${culture.id}`;
      option.textContent = `${culture.code} · ${culture.culture_type || "culture"}`;
      group.appendChild(option);
    }
    measurementTargetSelect.appendChild(group);
  }

  if (latestBatches.length) {
    const group = document.createElement("optgroup");
    group.label = "Lots de production";
    for (const batch of latestBatches) {
      const option = document.createElement("option");
      option.value = `batch:${batch.id}`;
      option.textContent = `${batch.batch_code} · ${batch.name || batch.batch_type || "lot"}`;
      group.appendChild(option);
    }
    measurementTargetSelect.appendChild(group);
  }

  const values = [...measurementTargetSelect.options].map(option => option.value);
  if (values.includes(previous)) {
    measurementTargetSelect.value = previous;
  } else if (cultureOptions.length) {
    measurementTargetSelect.value = `culture:${cultureOptions[0].id}`;
  } else if (latestBatches.length) {
    measurementTargetSelect.value = `batch:${latestBatches[0].id}`;
  }
}

function updateMeasurementUnits() {
  if (!measurementUnitSelect) return;
  const variable = measurementVariables.find(item => item.code === measurementVariableSelect.value);
  const previous = measurementUnitSelect.value;
  const candidates = variable
    ? measurementUnits.filter(unit => unit.dimension === variable.dimension)
    : measurementUnits;

  measurementUnitSelect.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = candidates.length
    ? "Sélectionner une unité…"
    : "Aucune unité compatible";
  measurementUnitSelect.appendChild(placeholder);

  for (const unit of candidates) {
    const option = document.createElement("option");
    option.value = unit.code;
    option.textContent = `${unit.label} · ${unit.code}`;
    measurementUnitSelect.appendChild(option);
  }

  if (candidates.some(unit => unit.code === previous)) {
    measurementUnitSelect.value = previous;
  } else if (variable?.canonical_unit_code && candidates.some(unit => unit.code === variable.canonical_unit_code)) {
    measurementUnitSelect.value = variable.canonical_unit_code;
  }
}

async function saveMeasurement() {
  if (!organizationId) {
    showMessage("Organisation absente. Reconnectez-vous.", "error");
    return;
  }

  const targetValue = measurementTargetSelect.value;
  const variable = measurementVariables.find(item => item.code === measurementVariableSelect.value);
  const unit = measurementUnits.find(item => item.code === measurementUnitSelect.value);
  const rawValue = Number(measurementValueInput.value);
  const measuredAt = measurementAtInput.value
    ? new Date(measurementAtInput.value).toISOString()
    : new Date().toISOString();

  if (!targetValue || !variable || !unit || measurementValueInput.value.trim() === "" || !Number.isFinite(rawValue)) {
    showMessage("Choisissez une culture ou un lot, un paramètre, une valeur numérique et une unité.", "error");
    return;
  }
  if (variable.dimension !== unit.dimension) {
    showMessage("L’unité choisie n’est pas compatible avec la dimension du paramètre.", "error");
    return;
  }

  const session = await getCurrentSession();
  if (!session) {
    showMessage("Votre session a expiré. Reconnectez-vous.", "error");
    return;
  }

  saveMeasurementButton.disabled = true;
  saveMeasurementButton.textContent = "Enregistrement…";
  let eventId = null;
  let measurementSaved = false;

  try {
    let cultureId = null;
    let batchId = null;
    const [targetType, targetId] = targetValue.split(":");

    if (targetType === "culture") {
      const culture = cultureOptions.find(item => item.id === targetId);
      if (!culture) throw new Error("La culture sélectionnée n’est plus disponible.");
      cultureId = culture.id;
    } else if (targetType === "batch") {
      const batch = latestBatches.find(item => item.id === targetId);
      if (!batch) throw new Error("Le lot sélectionné n’est plus disponible.");
      batchId = batch.id;
      cultureId = batch.culture_id || null;

      const { data: event, error: eventError } = await supabaseClient
        .from("events")
        .insert({
          organization_id: organizationId,
          event_type: "measurement_recorded",
          occurred_at: measuredAt,
          actor_user_id: session.user.id,
          culture_id: cultureId,
          batch_id: batchId,
          payload: {
            variable_code: variable.code,
            raw_value: rawValue,
            raw_unit_code: unit.code,
            method: measurementMethodInput.value.trim() || null,
            instrument: measurementInstrumentInput.value.trim() || null,
            note: measurementNoteInput.value.trim() || null
          }
        })
        .select("id")
        .single();

      if (eventError) throw new Error(`Création de l’événement de traçabilité impossible : ${eventError.message}`);
      eventId = event.id;
    } else {
      throw new Error("Cible de mesure invalide.");
    }

    const sameAsCanonical = variable.canonical_unit_code === unit.code;
    const { error: measurementError } = await supabaseClient
      .from("measurements")
      .insert({
        organization_id: organizationId,
        variable_code: variable.code,
        raw_value: rawValue,
        raw_unit_code: unit.code,
        normalized_value: sameAsCanonical ? rawValue : null,
        normalized_unit_code: sameAsCanonical ? unit.code : null,
        measured_at: measuredAt,
        method: measurementMethodInput.value.trim() || null,
        instrument: measurementInstrumentInput.value.trim() || null,
        culture_id: cultureId,
        event_id: eventId,
        metadata: {
          source: "batch-tracker-manual",
          note: measurementNoteInput.value.trim() || null,
          target_type: targetType,
          batch_id: batchId
        }
      });

    if (measurementError) throw new Error(`Enregistrement de la mesure impossible : ${measurementError.message}`);
    measurementSaved = true;

    measurementValueInput.value = "";
    measurementInstrumentInput.value = "";
    measurementMethodInput.value = "";
    measurementNoteInput.value = "";

    showMessage("Mesure enregistrée dans Supabase avec sa provenance.", "success");
    await loadRecentMeasurements();
  } catch (error) {
    console.error("Enregistrement mesure :", error);
    if (measurementSaved) {
      showMessage("La mesure a été enregistrée, mais l’actualisation de l’historique a échoué. Utilisez « Actualiser » pour recharger les données.", "warning");
    } else {
      if (eventId) {
        const { error: cleanupError } = await supabaseClient
          .from("events")
          .delete()
          .eq("organization_id", organizationId)
          .eq("id", eventId);
        if (cleanupError) console.error("Nettoyage de l’événement incomplet :", cleanupError);
      }
      showMessage(error.message || "L’enregistrement de la mesure a échoué.", "error");
    }
  } finally {
    saveMeasurementButton.disabled = false;
    saveMeasurementButton.textContent = "Enregistrer la mesure";
  }
}

async function loadRecentMeasurements() {
  if (!organizationId || !measurementHistory) return;

  const { data, error } = await supabaseClient
    .from("measurements")
    .select("id, variable_code, raw_value, raw_unit_code, normalized_value, normalized_unit_code, measured_at, method, instrument, culture_id, event_id, metadata")
    .eq("organization_id", organizationId)
    .order("measured_at", { ascending: false })
    .limit(10);

  if (error) throw new Error(`Chargement de l’historique des mesures impossible : ${error.message}`);

  const rows = data || [];
  const eventIds = [...new Set(rows.map(row => row.event_id).filter(Boolean))];
  let eventsById = {};
  if (eventIds.length) {
    const { data: events, error: eventsError } = await supabaseClient
      .from("events")
      .select("id, batch_id")
      .eq("organization_id", organizationId)
      .in("id", eventIds);
    if (eventsError) console.warn("Détails des événements de mesure indisponibles :", eventsError.message);
    for (const event of events || []) eventsById[event.id] = event;
  }

  if (!rows.length) {
    measurementHistory.innerHTML = '<p class="muted">Aucune mesure enregistrée pour le moment.</p>';
    return;
  }

  measurementHistory.innerHTML = rows.map(row => {
    const variable = measurementVariables.find(item => item.code === row.variable_code);
    const culture = cultureOptions.find(item => item.id === row.culture_id);
    const batchId = row.event_id ? eventsById[row.event_id]?.batch_id : null;
    const batch = batchId ? latestBatches.find(item => item.id === batchId) : null;
    const target = batch
      ? `Lot · ${escapeHtml(batch.batch_code)}`
      : culture
        ? `Culture · ${escapeHtml(culture.code)}`
        : "Cible liée par identifiant";
    const stamp = row.measured_at ? new Date(row.measured_at).toLocaleString() : "Date inconnue";
    const note = row.metadata?.note ? `<div class="measurement-meta">${escapeHtml(row.metadata.note)}</div>` : "";
    const method = row.method ? ` · ${escapeHtml(row.method)}` : "";
    const instrument = row.instrument ? ` · ${escapeHtml(row.instrument)}` : "";
    return `
      <article class="measurement-entry">
        <div>
          <strong>${escapeHtml(variable?.label || row.variable_code)}</strong>
          <div class="measurement-meta">${target}${method}${instrument}</div>
          ${note}
        </div>
        <div class="measurement-value">${escapeHtml(row.raw_value)} <span class="measurement-meta">${escapeHtml(row.raw_unit_code)}</span></div>
        <div class="measurement-stamp">${escapeHtml(stamp)} · Réf. ${escapeHtml(row.variable_code)}</div>
      </article>
    `;
  }).join("");
}


async function saveObservation() {
  if (!organizationId) {
    showMessage("Organisation absente. Reconnectez-vous.", "error");
    return;
  }

  const targetValue = measurementTargetSelect.value;
  const variable = measurementVariables.find(item => item.code === observationVariableSelect.value);
  const valueText = observationValueInput.value.trim();
  const observedAt = observationAtInput.value ? new Date(observationAtInput.value).toISOString() : new Date().toISOString();

  if (!targetValue || !variable || !valueText) {
    showMessage("Choisissez une cible, une catégorie et décrivez l’observation.", "error");
    return;
  }

  const session = await getCurrentSession();
  if (!session) {
    showMessage("Votre session a expiré. Reconnectez-vous.", "error");
    return;
  }

  saveObservationButton.disabled = true;
  saveObservationButton.textContent = "Enregistrement…";
  let eventId = null;
  let observationSaved = false;

  try {
    let cultureId = null;
    let batchId = null;
    const parts = targetValue.split(":");
    const targetType = parts[0];
    const targetId = parts[1];

    if (targetType === "culture") {
      const culture = cultureOptions.find(item => item.id === targetId);
      if (!culture) throw new Error("La culture sélectionnée n’est plus disponible.");
      cultureId = culture.id;
    } else if (targetType === "batch") {
      const batch = latestBatches.find(item => item.id === targetId);
      if (!batch) throw new Error("Le lot sélectionné n’est plus disponible.");
      batchId = batch.id;
      cultureId = batch.culture_id || null;

      const eventResult = await supabaseClient.from("events").insert({
        organization_id: organizationId,
        event_type: "observation_recorded",
        occurred_at: observedAt,
        actor_user_id: session.user.id,
        culture_id: cultureId,
        batch_id: batchId,
        payload: {
          variable_code: variable.code,
          value_text: valueText,
          method: observationMethodInput.value.trim() || null,
          instrument: observationInstrumentInput.value.trim() || null,
          note: observationNoteInput.value.trim() || null
        }
      }).select("id").single();

      if (eventResult.error) throw new Error("Création de l’événement de traçabilité impossible : " + eventResult.error.message);
      eventId = eventResult.data.id;
    } else {
      throw new Error("Cible d’observation invalide.");
    }

    const insertResult = await supabaseClient.from("observations").insert({
      organization_id: organizationId,
      variable_code: variable.code,
      value_text: valueText,
      observed_at: observedAt,
      culture_id: cultureId,
      event_id: eventId,
      metadata: {
        source: "batch-tracker-manual",
        method: observationMethodInput.value.trim() || null,
        instrument: observationInstrumentInput.value.trim() || null,
        note: observationNoteInput.value.trim() || null,
        target_type: targetType,
        batch_id: batchId
      }
    });

    if (insertResult.error) throw new Error("Enregistrement de l’observation impossible : " + insertResult.error.message);
    observationSaved = true;
    observationValueInput.value = "";
    observationMethodInput.value = "";
    observationInstrumentInput.value = "";
    observationNoteInput.value = "";
    showMessage("Observation enregistrée dans Supabase avec sa provenance.", "success");
    await loadRecentObservations();
  } catch (error) {
    console.error("Enregistrement observation :", error);
    if (observationSaved) {
      showMessage("L’observation a été enregistrée, mais l’actualisation de l’historique a échoué. Utilisez Actualiser pour recharger les données.", "warning");
    } else {
      if (eventId) {
        const cleanup = await supabaseClient.from("events").delete()
          .eq("organization_id", organizationId).eq("id", eventId);
        if (cleanup.error) console.error("Nettoyage de l’événement incomplet :", cleanup.error);
      }
      showMessage(error.message || "L’enregistrement de l’observation a échoué.", "error");
    }
  } finally {
    saveObservationButton.disabled = false;
    saveObservationButton.textContent = "Enregistrer l’observation";
  }
}

async function loadRecentObservations() {
  if (!organizationId || !observationHistory) return;

  const query = await supabaseClient.from("observations")
    .select("id, variable_code, value_text, observed_at, culture_id, event_id, metadata")
    .eq("organization_id", organizationId)
    .order("observed_at", { ascending: false })
    .limit(8);

  if (query.error) throw new Error("Chargement de l’historique des observations impossible : " + query.error.message);
  recentObservations = query.data || [];
  updateOverview();
  const eventIds = [...new Set(recentObservations.map(row => row.event_id).filter(Boolean))];
  const eventsById = {};

  if (eventIds.length) {
    const eventsResult = await supabaseClient.from("events")
      .select("id, batch_id")
      .eq("organization_id", organizationId)
      .in("id", eventIds);
    if (eventsResult.error) console.warn("Détails des événements d’observation indisponibles :", eventsResult.error.message);
    for (const event of eventsResult.data || []) eventsById[event.id] = event;
  }

  if (!recentObservations.length) {
    observationHistory.innerHTML = '<p class="muted">Aucune observation enregistrée pour le moment.</p>';
    return;
  }

  observationHistory.innerHTML = recentObservations.map(row => {
    const variable = measurementVariables.find(item => item.code === row.variable_code);
    const culture = cultureOptions.find(item => item.id === row.culture_id);
    const batchId = row.event_id ? (eventsById[row.event_id] || {}).batch_id : null;
    const batch = batchId ? latestBatches.find(item => item.id === batchId) : null;
    const target = batch ? "Lot · " + escapeHtml(batch.batch_code) :
      culture ? "Culture · " + escapeHtml(culture.code) : "Cible liée par identifiant";
    const stamp = row.observed_at ? new Date(row.observed_at).toLocaleString() : "Date inconnue";
    const note = row.metadata && row.metadata.note
      ? '<div class="measurement-meta">' + escapeHtml(row.metadata.note) + '</div>' : "";
    return '<article class="measurement-entry"><div><strong>' +
      escapeHtml(variable ? variable.label : row.variable_code) +
      '</strong><div class="measurement-meta">' + target + '</div>' + note +
      '</div><div class="measurement-meta">' + escapeHtml(stamp) +
      '</div><div class="measurement-stamp">' + escapeHtml(row.value_text) +
      '</div></article>';
  }).join("");
}


function renderStatisticsFilters() {
  const variableSelect = document.getElementById("statisticsVariable");
  const cultureSelect = document.getElementById("statisticsCulture");
  const batchSelect = document.getElementById("statisticsBatch");
  if (!variableSelect || !cultureSelect || !batchSelect) return;
  const previousVariable = variableSelect.value;
  const previousCulture = cultureSelect.value;
  const previousBatch = batchSelect.value;
  variableSelect.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = measurementVariables.length ? "Sélectionner une variable…" : "Aucune variable disponible";
  variableSelect.appendChild(placeholder);
  measurementVariables.forEach(variable => {
    const option = document.createElement("option");
    option.value = variable.code;
    option.textContent = variable.label + " · " + variable.code;
    variableSelect.appendChild(option);
  });
  if (measurementVariables.some(variable => variable.code === previousVariable)) variableSelect.value = previousVariable;
  cultureSelect.innerHTML = '<option value="">Toutes les cultures accessibles</option>';
  cultureOptions.forEach(culture => {
    const option = document.createElement("option");
    option.value = culture.id;
    option.textContent = culture.code || "Culture sans code";
    cultureSelect.appendChild(option);
  });
  if (cultureOptions.some(culture => culture.id === previousCulture)) cultureSelect.value = previousCulture;
  batchSelect.innerHTML = '<option value="">Tous les lots chargés</option>';
  latestBatches.forEach(batch => {
    const option = document.createElement("option");
    option.value = batch.id;
    option.textContent = (batch.batch_code || "Lot sans code") + (batch.name ? " · " + batch.name : "");
    batchSelect.appendChild(option);
  });
  if (latestBatches.some(batch => batch.id === previousBatch)) batchSelect.value = previousBatch;
}

function renderCultureCatalog() {
  const list = document.getElementById("cultureCatalogList");
  const count = document.getElementById("cultureCatalogCount");
  const search = document.getElementById("cultureSearch");
  const typeFilter = document.getElementById("cultureTypeFilter");
  if (!list || !count || !search || !typeFilter) return;

  const previousType = typeFilter.value;
  const types = [...new Set(cultureOptions.map(c => c.culture_type).filter(Boolean))].sort((a,b) => a.localeCompare(b, "fr"));
  typeFilter.innerHTML = '<option value="">Tous les types</option>';
  types.forEach(type => {
    const option = document.createElement("option");
    option.value = type;
    option.textContent = type;
    typeFilter.appendChild(option);
  });
  if (types.includes(previousType)) typeFilter.value = previousType;

  const query = search.value.trim().toLocaleLowerCase("fr");
  const selectedType = typeFilter.value;
  const filtered = cultureOptions.filter(culture => {
    const matchesQuery = [culture.code, culture.culture_type].some(value =>
      String(value || "").toLocaleLowerCase("fr").includes(query)
    );
    return matchesQuery && (!selectedType || culture.culture_type === selectedType);
  });

  count.textContent = String(filtered.length);
  list.innerHTML = "";
  if (!filtered.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = cultureOptions.length
      ? "Aucune culture ne correspond à cette recherche."
      : "Aucune culture chargée. Créez une culture avec le formulaire ci-dessus.";
    list.appendChild(empty);
    return;
  }

  filtered.forEach(culture => {
    const row = document.createElement("article");
    row.className = "culture-catalog-row";
    const main = document.createElement("div");
    main.className = "culture-catalog-main";
    const code = document.createElement("strong");
    code.className = "culture-catalog-code";
    code.textContent = culture.code || "Culture sans code";
    const meta = document.createElement("div");
    meta.className = "culture-catalog-meta";
    const type = document.createElement("span");
    type.textContent = culture.culture_type || "Type non renseigné";
    meta.appendChild(type);
    const date = document.createElement("span");
    date.textContent = culture.started_at
      ? "Démarrage : " + new Date(culture.started_at).toLocaleDateString("fr-FR")
      : "Date de démarrage non renseignée";
    meta.appendChild(date);
    main.append(code, meta);

    const actions = document.createElement("div");
    actions.className = "culture-catalog-actions";

    const observeAction = document.createElement("button");
    observeAction.type = "button";
    observeAction.className = "culture-catalog-action";
    observeAction.dataset.cultureAction = "observe";
    observeAction.textContent = "＋ Observer";
    observeAction.setAttribute("aria-label", "Ajouter une observation à " + (culture.code || "cette culture"));
    observeAction.addEventListener("click", () => {
      measurementTargetSelect.value = "culture:" + culture.id;
      const details = document.querySelector(".observation-details");
      if (details) details.open = true;
      if (!observationAtInput.value) {
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        observationAtInput.value = now.toISOString().slice(0, 16);
      }
      activateWorkspaceModule("measurementCard");
      document.getElementById("measurementCard")?.scrollIntoView({
        block: "start",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
      });
      observationValueInput.focus({ preventScroll: true });
    });

    const measureAction = document.createElement("button");
    measureAction.type = "button";
    measureAction.className = "culture-catalog-action";
    measureAction.dataset.cultureAction = "measure";
    measureAction.textContent = "＋ Mesurer";
    measureAction.setAttribute("aria-label", "Ajouter une mesure à " + (culture.code || "cette culture"));
    measureAction.addEventListener("click", () => {
      measurementTargetSelect.value = "culture:" + culture.id;
      if (!measurementAtInput.value) {
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        measurementAtInput.value = now.toISOString().slice(0, 16);
      }
      activateWorkspaceModule("measurementCard");
      document.getElementById("measurementCard")?.scrollIntoView({
        block: "start",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
      });
      measurementVariableSelect.focus({ preventScroll: true });
    });

    const detailAction = document.createElement("button");
    detailAction.type = "button";
    detailAction.className = "culture-catalog-action";
    detailAction.dataset.cultureAction = "history";
    detailAction.textContent = "Voir la fiche et l’historique";
    detailAction.addEventListener("click", () => loadCultureDetail(culture.id));

    actions.append(observeAction, measureAction, detailAction);
    row.append(main, actions);
    list.appendChild(row);
  });
}

let statisticsRequestId = 0;

async function loadStatistics() {
  const requestId = ++statisticsRequestId;
  const variableCode = document.getElementById("statisticsVariable").value;
  const cultureId = document.getElementById("statisticsCulture").value;
  const batchId = document.getElementById("statisticsBatch").value;
  const period = document.getElementById("statisticsPeriod").value;
  const status = document.getElementById("statisticsStatus");
  const chart = document.getElementById("statisticsChart");
  const summary = document.getElementById("statisticsSummary");
  const tbody = document.getElementById("statisticsRows");
  if (!organizationId) { status.textContent = "Connectez-vous pour analyser les données de votre organisation."; return; }
  if (!variableCode) { status.textContent = "Sélectionnez une variable mesurée."; return; }
  const button = document.getElementById("loadStatisticsButton");
  button.disabled = true; button.textContent = "Chargement…";
  status.textContent = "Chargement des mesures depuis Supabase…"; chart.innerHTML = '<p class="muted">Chargement des données…</p>'; summary.innerHTML = ""; tbody.innerHTML = "";
  try {
    let batchEventIds = null;
    let cultureEventIds = null;
    let noMatchingCultureBatchEvents = false;
    if (batchId) {
      const {data: batchEvents, error: batchEventsError} = await supabaseClient.from("events").select("id").eq("organization_id", organizationId).eq("batch_id", batchId);
      if (batchEventsError) throw new Error("Chargement des événements du lot impossible : " + batchEventsError.message);
      if (requestId !== statisticsRequestId) return;
      batchEventIds = (batchEvents || []).map(event => event.id);
    }
    if (cultureId) {
      const {data: cultureBatches, error: cultureBatchesError} = await supabaseClient.from("batches").select("id").eq("organization_id", organizationId).eq("culture_id", cultureId).order("created_at", {ascending:false}).limit(1000);
      if (cultureBatchesError) throw new Error("Chargement des lots liés à la culture impossible : " + cultureBatchesError.message);
      if (requestId !== statisticsRequestId) return;
      const cultureBatchIds = (cultureBatches || []).map(batch => batch.id);
      const cultureEventQueries = [
        supabaseClient.from("events").select("id").eq("organization_id", organizationId).eq("culture_id", cultureId)
      ];
      if (cultureBatchIds.length) {
        cultureEventQueries.push(supabaseClient.from("events").select("id").eq("organization_id", organizationId).in("batch_id", cultureBatchIds));
      }
      const cultureEventResults = await Promise.all(cultureEventQueries);
      if (requestId !== statisticsRequestId) return;
      for (const result of cultureEventResults) {
        if (result.error) throw new Error("Chargement des événements liés à la culture impossible : " + result.error.message);
      }
      cultureEventIds = [...new Set(cultureEventResults.flatMap(result => (result.data || []).map(event => event.id)))];
    }
    let query = supabaseClient.from("measurements").select("id, variable_code, raw_value, raw_unit_code, normalized_value, normalized_unit_code, measured_at, method, culture_id, event_id, metadata").eq("organization_id", organizationId).eq("variable_code", variableCode).order("measured_at", {ascending:false}).limit(1000);
    if (cultureId && batchId) {
      const matchingEventIds = cultureEventIds.filter(id => batchEventIds.includes(id));
      if (matchingEventIds.length) query = query.in("event_id", matchingEventIds);
      else noMatchingCultureBatchEvents = true;
    } else if (cultureId) {
      query = cultureEventIds.length
        ? query.or("culture_id.eq." + cultureId + ",event_id.in.(" + cultureEventIds.join(",") + ")")
        : query.eq("culture_id", cultureId);
    } else if (batchId && batchEventIds.length) {
      query = query.in("event_id", batchEventIds);
    }
    if (period !== "all") { const since = new Date(); since.setDate(since.getDate() - Number(period)); query = query.gte("measured_at", since.toISOString()); }
    const queryResult = (batchId && !batchEventIds.length) || (cultureId && !cultureEventIds.length && batchId) || noMatchingCultureBatchEvents ? {data:[],error:null} : await query;
    if (requestId !== statisticsRequestId) return;
    const {data,error} = queryResult; if (error) throw new Error(error.message);
    const rows = (data || []).slice().sort((a,b) => new Date(a.measured_at || 0).getTime() - new Date(b.measured_at || 0).getTime()), variable = measurementVariables.find(item => item.code === variableCode), cultureById = new Map(cultureOptions.map(culture => [culture.id,culture]));
    const prepared = rows.map(row => { const normalized = row.normalized_value !== null && row.normalized_value !== undefined && row.normalized_value !== "" && row.normalized_unit_code; const raw = normalized ? row.normalized_value : row.raw_value; const hasValue = raw !== null && raw !== undefined && raw !== "" && typeof raw !== "boolean"; return {...row, plotValue:hasValue ? Number(raw) : NaN, plotUnit:normalized ? row.normalized_unit_code : row.raw_unit_code, normalized:Boolean(normalized)}; }).filter(row => Number.isFinite(row.plotValue));
    const canonical = variable?.canonical_unit_code;
    const plotted = canonical ? prepared.filter(row => row.plotUnit === canonical) : (prepared[0]?.plotUnit ? prepared.filter(row => row.plotUnit === prepared[0].plotUnit) : []);
    const excluded = prepared.length - plotted.length;
    const addSummary = (label,value) => { const item=document.createElement("div"); item.className="statistics-summary-item"; const name=document.createElement("span"); name.textContent=label; const number=document.createElement("strong"); number.textContent=value; item.append(name,number); summary.appendChild(item); };
    addSummary("Mesures chargées",String(rows.length)); addSummary("Valeurs numériques",String(prepared.length)); addSummary("Valeurs comparables",String(plotted.length));
    status.textContent = rows.length >= 1000 ? "Au moins 1 000 mesures correspondent aux filtres. Le résultat peut être tronqué ; réduisez la période ou sélectionnez une culture." : rows.length ? (excluded ? excluded+" valeur(s) exclue(s) du graphique car l’unité n’est pas comparable. " : "")+"Données chargées depuis Supabase. Les résultats sont descriptifs." : "Aucune mesure ne correspond aux filtres sélectionnés.";
    chart.innerHTML = "";
    if (plotted.length < 2) { chart.innerHTML = '<p class="muted">Il faut au moins deux mesures numériques comparables pour tracer une évolution. Les données brutes restent consultables ci-dessous.</p>'; }
    else {
      const width=760,height=270,left=64,right=20,top=22,bottom=50,values=plotted.map(row=>row.plotValue),min=Math.min(...values),max=Math.max(...values),span=max-min||Math.max(Math.abs(max)*.1,1);
      const x=i=>left+i*(width-left-right)/(plotted.length-1), y=value=>top+(max-value)*(height-top-bottom)/span, ns="http://www.w3.org/2000/svg", svg=document.createElementNS(ns,"svg");
      svg.setAttribute("viewBox","0 0 "+width+" "+height); svg.setAttribute("role","img"); svg.setAttribute("aria-label","Évolution de "+(variable?.label||variableCode)+", unité "+(canonical||plotted[0].plotUnit||"non renseignée"));
      for(let tick=0;tick<5;tick++){const value=min+(max-min)*tick/4,yy=y(value),line=document.createElementNS(ns,"line");line.setAttribute("x1",left);line.setAttribute("x2",width-right);line.setAttribute("y1",yy);line.setAttribute("y2",yy);line.setAttribute("stroke","#e5ebe1");svg.appendChild(line);const label=document.createElementNS(ns,"text");label.setAttribute("x",left-9);label.setAttribute("y",yy+4);label.setAttribute("text-anchor","end");label.setAttribute("font-size","11");label.setAttribute("fill","#657267");label.textContent=Number(value.toPrecision(4)).toString();svg.appendChild(label);}
      const polyline=document.createElementNS(ns,"polyline");polyline.setAttribute("points",plotted.map((row,i)=>x(i)+","+y(row.plotValue)).join(" "));polyline.setAttribute("fill","none");polyline.setAttribute("stroke","#47764d");polyline.setAttribute("stroke-width","2.5");polyline.setAttribute("stroke-linejoin","round");svg.appendChild(polyline);
      plotted.forEach((row,i)=>{const circle=document.createElementNS(ns,"circle");circle.setAttribute("cx",x(i));circle.setAttribute("cy",y(row.plotValue));circle.setAttribute("r","3.5");circle.setAttribute("fill","#47764d");const title=document.createElementNS(ns,"title");title.textContent=(row.measured_at?new Date(row.measured_at).toLocaleString("fr-FR"):"Date inconnue")+": "+row.plotValue+" "+(row.plotUnit||"");circle.appendChild(title);svg.appendChild(circle);});
      const xl=document.createElementNS(ns,"text");xl.setAttribute("x",(left+width-right)/2);xl.setAttribute("y",height-10);xl.setAttribute("text-anchor","middle");xl.setAttribute("font-size","11");xl.setAttribute("fill","#4f6252");xl.textContent="Date de mesure";svg.appendChild(xl);
      const yl=document.createElementNS(ns,"text");yl.setAttribute("transform","translate(15 "+((top+height-bottom)/2)+") rotate(-90)");yl.setAttribute("text-anchor","middle");yl.setAttribute("font-size","11");yl.setAttribute("fill","#4f6252");yl.textContent=(variable?.label||variableCode)+" ("+(canonical||plotted[0].plotUnit||"unité inconnue")+")";svg.appendChild(yl);chart.appendChild(svg);
      const periodLabel=document.createElement("p");periodLabel.className="muted";periodLabel.textContent="Période représentée : "+(plotted[0].measured_at?new Date(plotted[0].measured_at).toLocaleDateString("fr-FR"):"date inconnue")+" — "+(plotted[plotted.length-1].measured_at?new Date(plotted[plotted.length-1].measured_at).toLocaleDateString("fr-FR"):"date inconnue");chart.appendChild(periodLabel);
    }
    if(!rows.length) tbody.innerHTML='<tr><td colspan="5">Aucune mesure pour ces filtres.</td></tr>';
    else { rows.slice().reverse().slice(0,200).forEach(row=>{const tr=document.createElement("tr"),culture=cultureById.get(row.culture_id),cells=[row.measured_at?new Date(row.measured_at).toLocaleString("fr-FR"):"Date inconnue",culture?.code||(row.culture_id?"Culture liée par identifiant":"Lot / cible sans culture directe"),String(row.raw_value??"—"),row.raw_unit_code||"Unité non renseignée",row.method||"—"];cells.forEach(value=>{const td=document.createElement("td");td.textContent=value;tr.appendChild(td);});tbody.appendChild(tr);});if(rows.length>200){const tr=document.createElement("tr"),td=document.createElement("td");td.colSpan=5;td.textContent="Affichage limité aux 200 mesures les plus récentes sur "+rows.length+" chargées.";tr.appendChild(td);tbody.appendChild(tr);}}
  } catch(error) { if (requestId !== statisticsRequestId) return; console.error("Analyse des mesures impossible :",error); status.textContent="Impossible de charger les mesures : "+error.message; chart.innerHTML='<p class="muted">Le graphique n’a pas pu être produit.</p>'; summary.innerHTML=""; tbody.innerHTML='<tr><td colspan="5">Données indisponibles.</td></tr>'; }
  finally { if (requestId === statisticsRequestId) { button.disabled=false; button.textContent="Analyser les données"; } }
}


/* ============================================================
   COMPARAISON EXPLORATOIRE DES LOTS — lecture seule
   ============================================================ */
function comparisonText(fr, en, pt, ar) {
  const language = document.documentElement.lang || "fr";
  return ({ fr: fr, en: en, pt: pt, ar: ar })[language] || fr;
}

function comparisonLocale() {
  const language = document.documentElement.lang || "fr";
  return language === "ar" ? "ar-DZ" : language === "pt" ? "pt-PT" : language === "en" ? "en-GB" : "fr-FR";
}

let lotComparisonRequestId = 0;

function renderComparisonBatchOptions() {
  const picker = document.getElementById("compareBatchPicker");
  if (!picker) return;
  const previouslySelected = new Set(Array.from(picker.querySelectorAll('input[name="compareBatch"]:checked')).map(input => input.value));
  if (!latestBatches.length) {
    picker.innerHTML = '<p class="comparison-empty">' + escapeHtml(comparisonText("Aucun lot disponible dans le chargement courant. Créez un lot ou vérifiez les droits d’accès à votre organisation.", "No batches are available in the current load. Create a batch or check your organization access.", "Não há lotes disponíveis no carregamento atual. Crie um lote ou verifique o acesso à organização.", "لا توجد دفعات متاحة في التحميل الحالي. أنشئ دفعة أو تحقق من صلاحيات الوصول إلى مؤسستك.")) + '</p>';
    return;
  }
  picker.innerHTML = latestBatches.map(batch => {
    const id = escapeHtml(batch.id);
    const code = escapeHtml(batch.batch_code || "Lot sans code");
    const name = escapeHtml(batch.name || batch.batch_type || "Sans description");
    const stage = escapeHtml(batch.current_stage || batch.status || "Étape non renseignée");
    return '<label class="comparison-batch-option"><input type="checkbox" name="compareBatch" value="' + id + '"' + (previouslySelected.has(batch.id) ? " checked" : "") + '><span><strong>' + code + '</strong><small>' + name + ' · ' + stage + '</small></span></label>';
  }).join("");
}

async function fetchComparisonRows(buildQuery) {
  const all = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const result = await buildQuery().range(offset, offset + pageSize - 1);
    if (result.error) throw new Error(result.error.message);
    const page = result.data || [];
    all.push.apply(all, page);
    if (page.length < pageSize) break;
  }
  return all;
}

function comparisonDateInRange(value, fromDate, toDate) {
  if (!value) return !fromDate && !toDate;
  const day = new Date(value).toISOString().slice(0, 10);
  return (!fromDate || day >= fromDate) && (!toDate || day <= toDate);
}

function comparisonNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function comparisonFormat(value, digits) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(comparisonLocale(), { maximumFractionDigits: digits === undefined ? 3 : digits }).format(value);
}

function comparisonTable(headers, rows, caption) {
  const head = headers.map(value => "<th scope=\"col\">" + escapeHtml(value) + "</th>").join("");
  const body = rows.length
    ? rows.map(row => "<tr>" + row.map(value => "<td>" + value + "</td>").join("") + "</tr>").join("")
    : '<tr><td colspan="' + headers.length + '">' + escapeHtml(comparisonText("Aucune donnée disponible.", "No data available.", "Nenhum dado disponível.", "لا تتوفر بيانات.")) + '</td></tr>';
  return '<div class="comparison-table-wrap"><table class="comparison-table"><caption>' + escapeHtml(caption) + '</caption><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table></div>';
}

function renderComparisonChart(group, batches, outlierIds) {
  const points = group.points.filter(point => Number.isFinite(point.value) && point.measured_at);
  if (!points.length) return '<div class="comparison-empty">' + escapeHtml(comparisonText("Aucune série temporelle datée pour ", "No dated time series for ", "Não existe série temporal datada para ", "لا توجد سلسلة زمنية مؤرخة لـ ") + group.label) + '.</div>';
  const width = 760, height = 260, left = 58, right = 20, top = 20, bottom = 48;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const times = points.map(point => new Date(point.measured_at).getTime());
  const values = points.map(point => point.value);
  let minTime = Math.min.apply(null, times), maxTime = Math.max.apply(null, times);
  let minValue = Math.min.apply(null, values), maxValue = Math.max.apply(null, values);
  if (minTime === maxTime) { minTime -= 12 * 60 * 60 * 1000; maxTime += 12 * 60 * 60 * 1000; }
  if (minValue === maxValue) { const pad = Math.abs(minValue) * 0.08 || 1; minValue -= pad; maxValue += pad; }
  const palette = ["#276749", "#b45309", "#2563eb", "#7c3aed", "#0f766e", "#be123c", "#475569", "#a16207"];
  const batchMap = new Map(batches.map(batch => [batch.id, batch]));
  const batchIds = Array.from(new Set(points.map(point => point.batchId)));
  const x = value => left + ((new Date(value).getTime() - minTime) / (maxTime - minTime)) * plotWidth;
  const y = value => top + (1 - (value - minValue) / (maxValue - minValue)) * plotHeight;
  let svg = '<svg viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="' + escapeHtml(comparisonText("Évolution temporelle de ", "Time evolution of ", "Evolução temporal de ", "التغير الزمني لـ ") + group.label) + '">';
  for (let tick = 0; tick < 5; tick++) {
    const value = minValue + ((maxValue - minValue) * tick / 4);
    const py = y(value);
    svg += '<line x1="' + left + '" y1="' + py + '" x2="' + (width - right) + '" y2="' + py + '" stroke="currentColor" opacity=".12"/>';
    svg += '<text x="' + (left - 8) + '" y="' + (py + 4) + '" text-anchor="end" font-size="10" fill="currentColor">' + comparisonFormat(value, 2) + '</text>';
  }
  svg += '<line x1="' + left + '" y1="' + (height - bottom) + '" x2="' + (width - right) + '" y2="' + (height - bottom) + '" stroke="currentColor" opacity=".35"/>';
  batchIds.forEach((batchId, batchIndex) => {
    const series = points.filter(point => point.batchId === batchId).sort((a, b) => new Date(a.measured_at) - new Date(b.measured_at));
    const color = palette[batchIndex % palette.length];
    if (series.length > 1) {
      const path = series.map((point, index) => (index ? "L" : "M") + x(point.measured_at).toFixed(2) + " " + y(point.value).toFixed(2)).join(" ");
      svg += '<path d="' + path + '" fill="none" stroke="' + color + '" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>';
    }
    series.forEach(point => {
      const radius = outlierIds.has(point.id) ? 5 : 3.2;
      svg += '<circle cx="' + x(point.measured_at).toFixed(2) + '" cy="' + y(point.value).toFixed(2) + '" r="' + radius + '" fill="' + color + '" stroke="' + (outlierIds.has(point.id) ? "#b91c1c" : "#fff") + '" stroke-width="' + (outlierIds.has(point.id) ? 2 : 1) + '"><title>' + escapeHtml((batchMap.get(batchId)?.batch_code || "Lot") + " · " + new Date(point.measured_at).toLocaleString(comparisonLocale()) + " · " + comparisonFormat(point.value) + " " + group.unit) + '</title></circle>';
    });
  });
  svg += '<text x="' + left + '" y="' + (height - 17) + '" font-size="10" fill="currentColor">' + new Date(minTime).toLocaleDateString(comparisonLocale()) + '</text>';
  svg += '<text x="' + (width - right) + '" y="' + (height - 17) + '" text-anchor="end" font-size="10" fill="currentColor">' + new Date(maxTime).toLocaleDateString(comparisonLocale()) + '</text>';
  svg += '<text x="' + (left + plotWidth / 2) + '" y="' + (height - 2) + '" text-anchor="middle" font-size="10" fill="currentColor">Date de mesure</text></svg>';
  const legend = batchIds.map((batchId, index) => '<span><i style="background:' + palette[index % palette.length] + '"></i>' + escapeHtml(batchMap.get(batchId)?.batch_code || "Lot sans code") + '</span>').join("");
  return '<article class="comparison-chart-card"><h4>' + escapeHtml(group.label) + ' <span class="muted">(' + escapeHtml(group.unit) + ')</span></h4>' + svg + '<div class="comparison-legend">' + legend + '</div></article>';
}

async function loadLotComparison() {
  const requestId = ++lotComparisonRequestId;
  const status = document.getElementById("compareLotsStatus");
  const summary = document.getElementById("compareLotsSummary");
  const findings = document.getElementById("compareLotsFindings");
  const charts = document.getElementById("compareLotsCharts");
  const tables = document.getElementById("compareLotsTables");
  const button = document.getElementById("compareLotsButton");
  if (!organizationId) {
    status.textContent = comparisonText("Connectez-vous pour comparer les lots de votre organisation.", "Sign in to compare batches in your organization.", "Inicie sessão para comparar os lotes da sua organização.", "سجّل الدخول لمقارنة دفعات مؤسستك.");
    return;
  }
  const selectedIds = Array.from(document.querySelectorAll('input[name="compareBatch"]:checked')).map(input => input.value);
  if (selectedIds.length < 2) {
    status.textContent = comparisonText("Sélectionnez au moins deux lots.", "Select at least two batches.", "Selecione pelo menos dois lotes.", "حدد دفعتين على الأقل.");
    return;
  }
  const selectedBatches = latestBatches.filter(batch => selectedIds.includes(batch.id));
  if (selectedBatches.length < 2) {
    status.textContent = comparisonText("La sélection a changé. Actualisez la liste des lots et réessayez.", "The selection has changed. Refresh the batch list and try again.", "A seleção mudou. Atualize a lista de lotes e tente novamente.", "تغير التحديد. حدّث قائمة الدفعات وحاول مرة أخرى.");
    return;
  }
  const fromDate = document.getElementById("compareFromDate").value;
  const toDate = document.getElementById("compareToDate").value;
  if (fromDate && toDate && fromDate > toDate) {
    status.textContent = comparisonText("La date de début doit précéder ou correspondre à la date de fin.", "The start date must be on or before the end date.", "A data inicial deve ser anterior ou igual à data final.", "يجب أن يكون تاريخ البداية قبل تاريخ النهاية أو مساوياً له.");
    return;
  }

  button.disabled = true;
  button.textContent = comparisonText("Comparaison en cours…", "Comparison in progress…", "Comparação em curso…", "المقارنة قيد التنفيذ…");
  status.textContent = comparisonText("Lecture des données autorisées dans Supabase…", "Reading data authorized by Supabase…", "A ler os dados autorizados no Supabase…", "جارٍ قراءة البيانات المصرح بها في Supabase…");
  summary.innerHTML = "";
  findings.innerHTML = "";
  charts.innerHTML = "";
  tables.innerHTML = "";

  try {
    const selectedBatchIds = selectedBatches.map(batch => batch.id);
    const cultureBatchCounts = new Map();
    const cultureToBatch = new Map();
    selectedBatches.forEach(batch => {
      if (!batch.culture_id) return;
      cultureBatchCounts.set(batch.culture_id, (cultureBatchCounts.get(batch.culture_id) || 0) + 1);
      if (!cultureToBatch.has(batch.culture_id)) cultureToBatch.set(batch.culture_id, batch.id);
    });
    const unambiguousCultureIds = Array.from(cultureBatchCounts.entries()).filter(entry => entry[1] === 1).map(entry => entry[0]);
    const safeCultureToBatch = new Map(Array.from(cultureToBatch.entries()).filter(entry => cultureBatchCounts.get(entry[0]) === 1));

    const batchEvents = await fetchComparisonRows(() => supabaseClient.from("events")
      .select("id,batch_id,culture_id,sample_id,occurred_at,event_type,payload")
      .eq("organization_id", organizationId).in("batch_id", selectedBatchIds).order("occurred_at", { ascending: true }).order("id", { ascending: true }));
    const cultureEvents = unambiguousCultureIds.length
      ? await fetchComparisonRows(() => supabaseClient.from("events")
          .select("id,batch_id,culture_id,sample_id,occurred_at,event_type,payload")
          .eq("organization_id", organizationId).in("culture_id", unambiguousCultureIds).is("batch_id", null).order("occurred_at", { ascending: true }).order("id", { ascending: true }))
      : [];
    const sampleRows = unambiguousCultureIds.length
      ? await fetchComparisonRows(() => supabaseClient.from("samples")
          .select("id,culture_id").eq("organization_id", organizationId)
          .in("culture_id", unambiguousCultureIds).order("id", { ascending: true }))
      : [];
    const sampleToBatch = new Map();
    sampleRows.forEach(sample => {
      const batchId = safeCultureToBatch.get(sample.culture_id);
      if (batchId) sampleToBatch.set(sample.id, batchId);
    });

    const eventToBatch = new Map();
    batchEvents.forEach(event => { if (selectedBatchIds.includes(event.batch_id)) eventToBatch.set(event.id, event.batch_id); });
    cultureEvents.forEach(event => { const batchId = safeCultureToBatch.get(event.culture_id); if (batchId && !event.batch_id) eventToBatch.set(event.id, batchId); });
    const sampleIds = sampleRows.map(sample => sample.id);
    for (let offset = 0; offset < sampleIds.length; offset += 100) {
      const sampleChunk = sampleIds.slice(offset, offset + 100);
      const sampleEvents = await fetchComparisonRows(() => supabaseClient.from("events")
        .select("id,batch_id,culture_id,sample_id,occurred_at,event_type,payload")
        .eq("organization_id", organizationId).in("sample_id", sampleChunk)
        .is("batch_id", null).order("occurred_at", { ascending: true }).order("id", { ascending: true }));
      sampleEvents.forEach(event => {
        const batchId = event.culture_id
          ? safeCultureToBatch.get(event.culture_id)
          : sampleToBatch.get(event.sample_id);
        if (batchId && !event.batch_id) eventToBatch.set(event.id, batchId);
      });
    }
    const eventIds = Array.from(eventToBatch.keys());

    async function fetchLinkedRows(tableName, selectFields, dateField) {
      const results = [];
      // Chunk event IDs to keep PostgREST query URLs bounded for batches with long histories.
      for (let offset = 0; offset < eventIds.length; offset += 100) {
        const eventChunk = eventIds.slice(offset, offset + 100);
        const rows = await fetchComparisonRows(() => supabaseClient.from(tableName).select(selectFields)
          .eq("organization_id", organizationId).in("event_id", eventChunk).order(dateField, { ascending: true }).order("id", { ascending: true }));
        results.push(rows);
      }
      if (unambiguousCultureIds.length) {
        const cultureRows = await fetchComparisonRows(() => supabaseClient.from(tableName).select(selectFields)
          .eq("organization_id", organizationId).in("culture_id", unambiguousCultureIds).is("event_id", null).order(dateField, { ascending: true }).order("id", { ascending: true }));
        results.push(cultureRows);
      }
      const unique = new Map();
      results.flat().forEach(row => unique.set(row.id, row));
      return Array.from(unique.values()).filter(row => comparisonDateInRange(row[dateField], fromDate, toDate));
    }

    const [measurementRows, observationRows] = await Promise.all([
      fetchLinkedRows("measurements", "id,variable_code,raw_value,raw_unit_code,normalized_value,normalized_unit_code,measured_at,method,instrument,quality_state,exclusion_reason,culture_id,sample_id,event_id,metadata", "measured_at"),
      fetchLinkedRows("observations", "id,variable_code,value_text,observed_at,quality_state,culture_id,sample_id,event_id,metadata", "observed_at")
    ]);
    if (requestId !== lotComparisonRequestId) return;

    function assignBatch(row) {
      return BACompareAnalysis.resolveBatchId(row, eventToBatch, safeCultureToBatch, sampleToBatch);
    }
    const variableMap = new Map(measurementVariables.map(variable => [variable.code, variable]));
    const unitMap = new Map(measurementUnits.map(unit => [unit.code, unit]));
    const assignedMeasurements = measurementRows.map(row => Object.assign({}, row, { batchId: assignBatch(row) }))
      .filter(row => row.batchId && row.quality_state !== "excluded" && !row.exclusion_reason)
      .map(row => {
        const normalized = comparisonNumber(row.normalized_value);
        const raw = comparisonNumber(row.raw_value);
        const sourceUnitCode = normalized !== null && row.normalized_unit_code ? row.normalized_unit_code : (row.raw_unit_code || "unité non renseignée");
        const sourceUnit = unitMap.get(sourceUnitCode);
        const variable = variableMap.get(row.variable_code);
        const targetUnitCode = variable?.canonical_unit_code;
        const targetUnit = targetUnitCode ? unitMap.get(targetUnitCode) : null;
        const sourceValue = normalized !== null && row.normalized_unit_code ? normalized : raw;
        const converted = sourceValue !== null && sourceUnit && targetUnit
          ? BACompareAnalysis.convertUnit(sourceValue, sourceUnit, targetUnit, variable?.dimension)
          : null;
        return Object.assign({}, row, {
          value: converted !== null ? converted : sourceValue,
          unit: converted !== null ? targetUnitCode : sourceUnitCode,
          valueBasis: converted !== null && sourceUnitCode !== targetUnitCode ? "convertie" : (normalized !== null && row.normalized_unit_code ? "normalisée" : "brute")
        });
      }).filter(row => row.value !== null);
    const assignedObservations = observationRows.map(row => Object.assign({}, row, { batchId: assignBatch(row) }))
      .filter(row => row.batchId && row.quality_state !== "excluded");

    const groupsByKey = new Map();
    assignedMeasurements.forEach(row => {
      const variable = variableMap.get(row.variable_code);
      const key = row.variable_code + "::" + row.unit;
      if (!groupsByKey.has(key)) groupsByKey.set(key, { key: key, variableCode: row.variable_code, variable: variable, unit: row.unit, label: variable?.label || row.variable_code || "Variable non référencée", points: [] });
      groupsByKey.get(key).points.push(row);
    });
    const groups = Array.from(groupsByKey.values()).sort((a, b) => a.label.localeCompare(b.label, "fr") || a.unit.localeCompare(b.unit, "fr"));
    const outlierByGroup = new Map();
    groups.forEach(group => outlierByGroup.set(group.key, new Set(BACompareAnalysis.detectOutlierIds(group.points))));

    const allDates = assignedMeasurements.map(row => row.measured_at).concat(assignedObservations.map(row => row.observed_at)).filter(Boolean).sort();
    const periodLabel = allDates.length
      ? new Date(allDates[0]).toLocaleDateString(comparisonLocale()) + " — " + new Date(allDates[allDates.length - 1]).toLocaleDateString(comparisonLocale())
      : (fromDate || toDate)
        ? (fromDate || comparisonText("début non limité", "unbounded start", "início sem limite", "بداية غير محددة")) + " — " + (toDate || comparisonText("fin non limitée", "unbounded end", "fim não limitado", "نهاية غير محددة"))
        : comparisonText("aucune date disponible", "no dates available", "nenhuma data disponível", "لا تتوفر تواريخ");
    const outlierCount = Array.from(outlierByGroup.values()).reduce((sum, ids) => sum + ids.size, 0);
    summary.innerHTML = [
      [comparisonText("Lots sélectionnés", "Selected batches", "Lotes selecionados", "الدفعات المحددة"), String(selectedBatches.length)],
      [comparisonText("Mesures utilisables", "Usable measurements", "Medições utilizáveis", "القياسات القابلة للاستخدام"), String(assignedMeasurements.length)],
      [comparisonText("Observations qualitatives", "Qualitative observations", "Observações qualitativas", "الملاحظات النوعية"), String(assignedObservations.length)]
    ].map(item => '<div class="statistics-summary-item"><span>' + escapeHtml(item[0]) + '</span><strong>' + escapeHtml(item[1]) + '</strong></div>').join("");

    const descriptive = [];
    if (!assignedMeasurements.length && !assignedObservations.length) {
      descriptive.push(comparisonText("Aucune mesure ni observation exploitable n’a été trouvée pour ces lots et cette période. Cela ne permet pas de conclure sur leurs performances.", "No usable measurements or observations were found for these batches and this period. No conclusion about their performance can be drawn.", "Não foram encontradas medições ou observações utilizáveis para estes lotes e período. Não é possível tirar conclusões sobre o seu desempenho.", "لم يُعثر على قياسات أو ملاحظات قابلة للاستخدام لهذه الدفعات والفترة. لا يمكن استخلاص استنتاج بشأن أدائها."));
    } else {
      descriptive.push(comparisonText(assignedMeasurements.length + " mesure(s) numérique(s) et " + assignedObservations.length + " observation(s) qualitative(s) sont exploitables après exclusion des enregistrements marqués exclus.", assignedMeasurements.length + " numeric measurement(s) and " + assignedObservations.length + " qualitative observation(s) are usable after excluding records marked as excluded.", assignedMeasurements.length + " medição(ões) numérica(s) e " + assignedObservations.length + " observação(ões) qualitativa(s) são utilizáveis após excluir os registos marcados como excluídos.", "يمكن استخدام " + assignedMeasurements.length + " قياس(ات) رقمي(ة) و" + assignedObservations.length + " ملاحظة(ات) نوعية بعد استبعاد السجلات المحددة كمستبعدة."));
    }
    if (outlierCount) descriptive.push(comparisonText(outlierCount + " valeur(s) atypique(s) signalée(s) par la règle exploratoire des 1,5 × IQR ; elles restent incluses dans les graphiques et les statistiques.", outlierCount + " outlier(s) flagged by the exploratory 1.5 × IQR rule; they remain included in charts and statistics.", outlierCount + " valor(es) atípico(s) assinalado(s) pela regra exploratória de 1,5 × IQR; continuam incluídos nos gráficos e nas estatísticas.", "تم تحديد " + outlierCount + " قيمة شاذة وفق قاعدة 1.5 × IQR الاستكشافية؛ وتظل مشمولة في الرسوم والإحصاءات."));
    if (Array.from(cultureBatchCounts.values()).some(count => count > 1)) descriptive.push("Certaines cultures sont liées à plusieurs lots sélectionnés : les mesures/observations rattachées seulement à la culture et non à un événement de lot sont laissées de côté pour éviter une attribution ambiguë.");
    if (allDates.length) descriptive.push(comparisonText("Période réellement couverte par les données utilisées : ", "Actual period covered by the data used: ", "Período efetivamente abrangido pelos dados utilizados: ", "الفترة الفعلية التي تغطيها البيانات المستخدمة: ") + periodLabel + ".");
    const undatedCount = assignedMeasurements.filter(row => !row.measured_at).length + assignedObservations.filter(row => !row.observed_at).length;
    if (undatedCount) descriptive.push(comparisonText(undatedCount + " enregistrement(s) sans date sont inclus dans les effectifs, mais pas dans les graphiques temporels ni les corrélations.", undatedCount + " undated record(s) are included in counts but not in time-series charts or correlations.", undatedCount + " registo(s) sem data estão incluídos nas contagens, mas não nos gráficos temporais nem nas correlações.", "تم تضمين " + undatedCount + " سجل(ات) بلا تاريخ في الأعداد، ولكن ليس في الرسوم الزمنية أو الارتباطات."));
    findings.innerHTML += '<article class="comparison-finding"><h4>1. Constats descriptifs</h4><ul>' + descriptive.map(item => "<li>" + escapeHtml(item) + "</li>").join("") + "</ul></article>";

    if (groups.length) {
      const metricRows = [];
      groups.forEach(group => {
        const outlierIds = outlierByGroup.get(group.key);
        const perLot = selectedBatches.map(batch => {
          const points = group.points.filter(point => point.batchId === batch.id);
          const stats = BACompareAnalysis.summarize(points.map(point => point.value));
          const outliers = points.filter(point => outlierIds.has(point.id)).length;
          return [
            escapeHtml(group.label + " · " + group.unit + " / " + (batch.batch_code || "Lot sans code")),
            String(stats.n),
            comparisonFormat(stats.median),
            stats.n ? comparisonFormat(stats.min) + "–" + comparisonFormat(stats.max) : "—",
            outliers ? '<span class="comparison-outlier">' + outliers + " atypique(s)</span>" : "0"
          ];
        });
        perLot.forEach(row => metricRows.push(row));
        charts.innerHTML += renderComparisonChart(group, selectedBatches, outlierIds);
      });
      tables.innerHTML += comparisonTable(["Variable · unité / lot", "n", "Médiane", "Min–max", "Valeurs atypiques"], metricRows, "Mesures numériques par lot et unité");
    } else {
      tables.innerHTML += '<div class="comparison-empty">Aucune mesure numérique exploitable dans la sélection. Les observations qualitatives restent analysées séparément.</div>';
    }

    if (assignedObservations.length) {
      const byVariable = new Map();
      assignedObservations.forEach(row => {
        const variable = variableMap.get(row.variable_code);
        const key = row.variable_code || "variable_non_renseignée";
        if (!byVariable.has(key)) byVariable.set(key, { label: variable?.label || key, rows: [] });
        byVariable.get(key).rows.push(row);
      });
      const observationRows = [];
      Array.from(byVariable.entries()).sort((a, b) => a[1].label.localeCompare(b[1].label, "fr")).forEach(([code, group]) => {
        selectedBatches.forEach(batch => {
          const values = group.rows.filter(row => row.batchId === batch.id);
          const latest = values.slice().sort((a, b) => new Date(b.observed_at || 0) - new Date(a.observed_at || 0))[0];
          observationRows.push([escapeHtml(group.label), escapeHtml(batch.batch_code || "Lot sans code"), String(values.length), latest ? escapeHtml(String(latest.value_text || "Observation sans texte")) : "Aucune observation enregistrée", latest?.observed_at ? escapeHtml(new Date(latest.observed_at).toLocaleDateString(comparisonLocale())) : "—"]);
        });
      });
      tables.innerHTML += comparisonTable(["Variable observée", "Lot", "n", "Dernière valeur textuelle", "Dernière date"], observationRows, "Observations qualitatives par lot");
    } else {
      tables.innerHTML += '<div class="comparison-empty">Aucune observation qualitative enregistrée pour les lots sélectionnés et la période choisie.</div>';
    }

    const dailyGroups = new Map();
    groups.forEach(group => {
      group.points.forEach(point => {
        if (!point.measured_at) return;
        const key = group.key + "::" + point.batchId + "::" + new Date(point.measured_at).toISOString().slice(0, 10);
        if (!dailyGroups.has(key)) dailyGroups.set(key, { groupKey: group.key, batchId: point.batchId, date: new Date(point.measured_at).toISOString().slice(0, 10), values: [] });
        dailyGroups.get(key).values.push(point.value);
      });
    });
    const daily = Array.from(dailyGroups.values()).map(item => Object.assign({}, item, { value: item.values.reduce((sum, value) => sum + value, 0) / item.values.length }));
    const correlations = [];
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        if (groups[i].variableCode === groups[j].variableCode) continue;
        const rightByKey = new Map(daily.filter(item => item.groupKey === groups[j].key).map(item => [item.batchId + "::" + item.date, item.value]));
        const pairs = daily.filter(item => item.groupKey === groups[i].key && rightByKey.has(item.batchId + "::" + item.date))
          .map(item => ({ x: item.value, y: rightByKey.get(item.batchId + "::" + item.date) }));
        if (pairs.length < 4) continue;
        const r = BACompareAnalysis.pearson(pairs);
        if (r !== null) correlations.push({ a: groups[i], b: groups[j], n: pairs.length, r: r });
      }
    }
    correlations.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
    if (correlations.length) {
      const rows = correlations.slice(0, 8).map(item => [escapeHtml(item.a.label + " (" + item.a.unit + ")"), escapeHtml(item.b.label + " (" + item.b.unit + ")"), String(item.n), '<span class="comparison-correlation">' + comparisonFormat(item.r, 3) + '</span>', Math.abs(item.r) >= 0.7 ? comparisonText("Association linéaire exploratoire marquée", "Strong exploratory linear association", "Associação linear exploratória forte", "ارتباط خطي استكشافي قوي") : comparisonText("Association linéaire exploratoire", "Exploratory linear association", "Associação linear exploratória", "ارتباط خطي استكشافي")]);
      findings.innerHTML += '<article class="comparison-finding"><h4>2. Corrélations exploratoires</h4><p>Corrélation de Pearson sur des moyennes journalières appariées au sein du même lot (au moins 4 journées appariées). Les répétitions ne sont pas indépendantes et les effets du temps ou des traitements ne sont pas contrôlés.</p>' + comparisonTable(["Variable A", "Variable B", "Journées appariées (n)", "r de Pearson", "Lecture"], rows, "Associations observées") + '<p>' + escapeHtml(comparisonText("Une corrélation, même forte, ne démontre pas de causalité.", "A correlation, even a strong one, does not demonstrate causality.", "Uma correlação, mesmo forte, não demonstra causalidade.", "الارتباط، حتى إن كان قوياً، لا يثبت السببية.")) + '</p></article>';
    } else {
      findings.innerHTML += '<article class="comparison-finding"><h4>2. Corrélations exploratoires</h4><p>' + escapeHtml(comparisonText("Pas assez de journées appariées entre variables différentes pour calculer une corrélation interprétable (minimum opérationnel : 4 journées au sein du même lot).", "Not enough paired days between different variables to calculate an interpretable correlation (operational minimum: 4 days within the same batch).", "Não existem dias emparelhados suficientes entre variáveis diferentes para calcular uma correlação interpretável (mínimo operacional: 4 dias no mesmo lote).", "لا توجد أيام مقترنة كافية بين المتغيرات المختلفة لحساب ارتباط قابل للتفسير (الحد الأدنى العملي: 4 أيام داخل الدفعة نفسها).")) + '</p></article>';
    }

    const measuredCodes = new Set(groups.map(group => group.variableCode));
    const candidateCodes = ["temperature", "relative_humidity", "substrate_moisture", "ph", "electrical_conductivity", "illuminance", "co2_concentration", "dry_biomass", "fresh_mass", "growth_rate"];
    const candidates = candidateCodes.map(code => variableMap.get(code)).filter(variable => variable && !measuredCodes.has(variable.code));
    const hypothesisText = candidates.length
      ? comparisonText("Pour un prochain essai, envisager de mesurer conjointement — si pertinent pour le système étudié — ", "For a future trial, consider measuring together — if relevant to the system studied — ", "Num próximo ensaio, considere medir em conjunto — se for pertinente para o sistema estudado — ", "في تجربة لاحقة، فكّر في قياس المتغيرات معاً — إذا كان ذلك مناسباً للنظام المدروس — ") + candidates.slice(0, 6).map(variable => variable.label + " (" + variable.code + ")").join(", ") + comparisonText(". Définir avant l’essai la variable de réponse, la fréquence, la méthode et les répétitions.", ". Define the response variable, frequency, method and replicates before the trial.", ". Defina a variável de resposta, a frequência, o método e as repetições antes do ensaio.", ". حدّد متغير الاستجابة والتواتر والطريقة والتكرارات قبل التجربة.")
      : comparisonText("Choisir une variable de réponse et enregistrer en parallèle les facteurs de milieu ou de procédé pertinents déjà présents dans le catalogue. Préspécifier fréquence, méthode, unités et répétitions.", "Choose a response variable and simultaneously record relevant environmental or process factors already in the catalogue. Predefine frequency, method, units and replicates.", "Escolha uma variável de resposta e registe em paralelo os fatores ambientais ou de processo relevantes já existentes no catálogo. Defina previamente frequência, método, unidades e repetições.", "اختر متغير استجابة وسجّل بالتوازي عوامل البيئة أو العملية ذات الصلة الموجودة في الكتالوج. حدّد مسبقاً التواتر والطريقة والوحدات والتكرارات.");
    findings.innerHTML += '<article class="comparison-finding"><h4>3. Hypothèses à tester ensuite</h4><p>' + escapeHtml(hypothesisText) + '</p><p>' + escapeHtml(comparisonText("Ces variables sont des pistes de protocole, pas des explications démontrées des différences observées.", "These variables are protocol ideas, not proven explanations for the observed differences.", "Estas variáveis são pistas para o protocolo, não explicações comprovadas das diferenças observadas.", "هذه المتغيرات مقترحات للبروتوكول وليست تفسيرات مثبتة للاختلافات المرصودة.")) + '</p></article>';

    const selectedPeriodText = (fromDate || comparisonText("début non limité", "unbounded start", "início sem limite", "بداية غير محددة")) + " → " + (toDate || comparisonText("fin non limitée", "unbounded end", "fim não limitado", "نهاية غير محددة"));
    status.textContent = comparisonText("Comparaison terminée : ", "Comparison complete: ", "Comparação concluída: ", "اكتملت المقارنة: ") + selectedBatches.length + comparisonText(" lots ; ", " batches; ", " lotes; ", " دفعات؛ ") + assignedMeasurements.length + comparisonText(" mesures et ", " measurements and ", " medições e ", " قياسات و") + assignedObservations.length + comparisonText(" observations retenues. Filtre demandé : ", " observations retained. Requested filter: ", " observações incluídas. Filtro solicitado: ", " ملاحظات مدرجة. المرشح المطلوب: ") + selectedPeriodText + comparisonText(". Période des données : ", ". Data period: ", ". Período dos dados: ", ". فترة البيانات: ") + periodLabel + ".";
  } catch (error) {
    console.error("Comparaison des lots :", error);
    status.textContent = comparisonText("La comparaison a échoué : ", "Comparison failed: ", "A comparação falhou: ", "فشلت المقارنة: ") + (error.message || comparisonText("erreur inconnue", "unknown error", "erro desconhecido", "خطأ غير معروف")) + comparisonText(". Aucune donnée n’a été modifiée.", ". No data was changed.", ". Nenhum dado foi alterado.", ". لم يتم تعديل أي بيانات.");
  } finally {
    if (requestId === lotComparisonRequestId) {
      button.disabled = false;
      button.textContent = comparisonText("Comparer les lots sélectionnés", "Compare selected batches", "Comparar os lotes selecionados", "قارن الدفعات المحددة");
    }
  }
}

async function loadBiologicalLineage(cultureId) {
  const target = document.getElementById('cultureLineage');
  if (!target || !organizationId) return;
  target.textContent = 'Chargement de la filiation…';
  try {
    const { data, error } = await supabaseClient.from('cultures')
      .select('id,code,culture_type,material_id,parent_culture_id,started_at,metadata')
      .eq('organization_id', organizationId).order('created_at', { ascending: true }).limit(1000);
    if (error) throw error;
    const rows = data || [];
    const byId = new Map(rows.map(row => [row.id, row]));
    const current = byId.get(cultureId);
    if (!current) { target.textContent = 'Culture absente du périmètre chargé.'; return; }
    const { data: materials, error: materialError } = await supabaseClient.from('materials')
      .select('id,material_code,material_type,parent_material_id,generation,state,strain_id')
      .eq('organization_id', organizationId).limit(2000);
    if (materialError) throw materialError;
    const materialById = new Map((materials || []).map(item => [item.id, item]));
    const materialChain = []; let materialId = current.material_id; let materialGuard = 0;
    while (materialId && materialGuard++ < 50) { const material = materialById.get(materialId); if (!material) break; materialChain.unshift(material); materialId = material.parent_material_id; }
    const ancestors = []; let parentId = current.parent_culture_id; let guard = 0;
    while (parentId && guard++ < 50) { const parent = byId.get(parentId); if (!parent) break; ancestors.unshift(parent); parentId = parent.parent_culture_id; }
    const descendants = []; const queue = [{ id: current.id, depth: 0 }]; const visited = new Set([current.id]);
    while (queue.length && descendants.length < 200) { const node = queue.shift(); for (const child of rows.filter(row => row.parent_culture_id === node.id)) { if (visited.has(child.id)) continue; visited.add(child.id); descendants.push({ ...child, depth: node.depth + 1 }); queue.push({ id: child.id, depth: node.depth + 1 }); } }
    const renderNode = (row, label) => { const node = document.createElement('button'); node.type = 'button'; node.className = 'culture-lineage-node'; node.addEventListener('click', () => loadCultureDetail(row.id)); node.setAttribute('aria-label', 'Ouvrir la fiche de culture ' + (row.code || 'sans code')); const strong = document.createElement('strong'); strong.textContent = row.code || 'Culture sans code'; const small = document.createElement('small'); small.textContent = label + ' · ' + (row.culture_type || 'type non renseigné'); node.append(strong, small); return node; };
    target.replaceChildren();
    const makeGroup = (title, items) => { const section = document.createElement('section'); const heading = document.createElement('p'); heading.className = 'muted'; heading.textContent = title; section.appendChild(heading); const list = document.createElement('div'); list.className = 'culture-lineage-list'; items.forEach((item, index) => { if (index) { const arrow = document.createElement('span'); arrow.className = 'culture-lineage-arrow'; arrow.textContent = '→'; list.appendChild(arrow); } list.appendChild(renderNode(item.row, item.label)); }); section.appendChild(list); target.appendChild(section); };
    if (materialChain.length) {
      const section = document.createElement('section'); const heading = document.createElement('p'); heading.className = 'muted'; heading.textContent = 'Origine matérielle (de la souche source au matériel actuel)'; section.appendChild(heading);
      const list = document.createElement('div'); list.className = 'culture-lineage-list';
      materialChain.forEach((material, index) => { if (index) { const arrow = document.createElement('span'); arrow.className = 'culture-lineage-arrow'; arrow.textContent = '→'; list.appendChild(arrow); } const node = document.createElement('div'); node.className = 'culture-lineage-node'; const strong = document.createElement('strong'); strong.textContent = material.material_code || 'Matériel sans code'; const small = document.createElement('small'); small.textContent = (material.material_type || 'type inconnu') + (material.generation == null ? '' : ' · génération ' + material.generation) + (material.state ? ' · ' + material.state : ''); node.append(strong,small); list.appendChild(node); });
      section.appendChild(list); target.appendChild(section);
    }
    if (ancestors.length) makeGroup('Cultures parentes', ancestors.map(row => ({ row, label: 'Culture parente' })));
    makeGroup('Culture sélectionnée', [{ row: current, label: 'Fiche ouverte' }]);
    if (descendants.length) makeGroup('Descendants (' + descendants.length + ')', descendants.map(row => ({ row, label: 'Génération ' + (row.depth || 1) })));
    if (!ancestors.length && !descendants.length) { const p = document.createElement('p'); p.className = 'muted'; p.textContent = 'Aucun ascendant ou descendant enregistré dans les fiches de culture. L’origine matérielle initiale reste indiquée par l’identifiant matériel de la fiche.'; target.appendChild(p); }
    if (rows.length >= 1000) { const note = document.createElement('p'); note.className = 'muted'; note.textContent = 'Filiation partielle : limite de 1 000 cultures atteinte.'; target.appendChild(note); }
  } catch (error) { target.textContent = 'Impossible de charger la filiation : ' + (error.message || error); }
}

async function saveBiologicalOperation(event) {
  event.preventDefault();
  const button = document.getElementById('saveBioOperation');
  const message = document.getElementById('bioOperationMessage');
  const cultureId = document.getElementById('cultureDetailPanel')?.dataset.cultureId;
  if (!cultureId || !organizationId) { message.textContent = 'Sélectionnez une culture avant d’enregistrer.'; return; }
  const operationType = document.getElementById('bioOperationType').value;
  const dateValue = document.getElementById('bioOperationDate').value;
  const note = document.getElementById('bioOperationNote').value.trim();
  const conditions = document.getElementById('bioOperationConditions').value.trim();
  const outcome = document.getElementById('bioOperationOutcome').value;
  const childCodes = [...new Set(document.getElementById('bioChildCodes').value.split(',').map(value => value.trim()).filter(Boolean))];
  if (!dateValue) { message.textContent = 'Indiquez la date de l’opération.'; return; }
  if (childCodes.length > 12) { message.textContent = 'Maximum : 12 descendants par opération.'; return; }
  if (childCodes.length && !['repiquage','passage','transfert','division_aliquotes','changement_milieu','conservation'].includes(operationType)) { message.textContent = 'Cette opération ne peut pas créer de descendants. Retirez les codes ou choisissez une opération de propagation.'; return; }
  button.disabled = true; button.textContent = 'Enregistrement…'; message.textContent = '';
  try {
    const { data, error } = await supabaseClient.rpc('record_biological_operation', {
      p_organization_id: organizationId, p_parent_culture_id: cultureId, p_event_type: operationType,
      p_occurred_at: new Date(dateValue).toISOString(), p_note: note || null,
      p_details: { source: 'BA Labs Culture Tracker', interface_version: '3.0', conditions: conditions || null, outcome: outcome || null }, p_child_codes: childCodes
    });
    if (error) throw error;
    const result = Array.isArray(data) ? data[0] : data;
    let notionSyncWarning = '';
    for (const child of (result?.children || [])) {
      try {
        const { data: syncData, error: syncError } = await supabaseClient.functions.invoke('sync-culture-to-notion', { body: { culture_id: child.id } });
        if (syncError || (syncData && syncData.ok === false)) notionSyncWarning = ' La filiation est enregistrée dans Supabase ; vérifiez la synchronisation Notion des descendants.';
      } catch (syncError) { notionSyncWarning = ' La filiation est enregistrée dans Supabase ; synchronisation Notion à vérifier.'; }
    }
    document.getElementById('bioOperationNote').value = ''; document.getElementById('bioOperationConditions').value = ''; document.getElementById('bioOperationOutcome').value = ''; document.getElementById('bioChildCodes').value = '';
    message.textContent = 'Opération enregistrée' + (result?.children?.length ? ' · ' + result.children.length + ' descendant(s) créé(s).' : '.') + notionSyncWarning;
    await loadCultureOptions();
    await loadCultureDetail(cultureId);
    await loadBiologicalLineage(cultureId);
  } catch (error) { message.textContent = 'Échec : ' + (error.message || 'opération non enregistrée'); }
  finally { button.disabled = false; button.textContent = 'Enregistrer l’opération'; }
}

let cultureDetailRequestId = 0;

async function loadCultureDetail(cultureId) {
  const requestId = ++cultureDetailRequestId;
  const culture = cultureOptions.find(item => item.id === cultureId);
  const panel = document.getElementById("cultureDetailPanel");
  const title = document.getElementById("cultureDetailTitle");
  const meta = document.getElementById("cultureDetailMeta");
  const summary = document.getElementById("cultureDetailSummary");
  const timeline = document.getElementById("cultureDetailTimeline");
  if (!culture || !panel || !title || !meta || !summary || !timeline) return;

  panel.dataset.cultureId = culture.id;
  loadBiologicalLineage(culture.id);
  panel.classList.remove("hidden");
  title.textContent = culture.code || "Culture sans code";
  meta.textContent = culture.culture_type || "Type de culture non renseigné";
  summary.innerHTML = "";
  [
    ["Identifiant", culture.code || "Non renseigné"],
    ["Type", culture.culture_type || "Non renseigné"],
    ["Démarrage", culture.started_at ? new Date(culture.started_at).toLocaleString("fr-FR") : "Non renseigné"],
    ["Identifiant matériel", culture.material_id || "Non renseigné"],
    ["Événements", "Chargement…"],
    ["Mesures / observations", "Chargement…"]
  ].forEach(([label, value]) => {
    const field = document.createElement("div");
    field.className = "culture-detail-field";
    const name = document.createElement("span");
    name.textContent = label;
    const content = document.createElement("strong");
    content.textContent = value;
    field.append(name, content);
    summary.appendChild(field);
  });
  timeline.innerHTML = '<p class="muted">Chargement de l’historique lié à cette culture…</p>';

  try {
    const { data: cultureBatches, error: batchesError } = await supabaseClient
      .from("batches")
      .select("id, batch_code, name, batch_type, status, current_stage, started_at, completed_at")
      .eq("organization_id", organizationId)
      .eq("culture_id", culture.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (batchesError) throw new Error("Lots liés à la culture : " + batchesError.message);
    if (requestId !== cultureDetailRequestId) return;

    const batches = cultureBatches || [];
    const batchIds = batches.map(batch => batch.id);
    const eventQueries = [
      supabaseClient.from("events").select("id, event_type, occurred_at, batch_id, payload")
        .eq("organization_id", organizationId).eq("culture_id", culture.id)
        .order("occurred_at", { ascending: false }).limit(100)
    ];
    if (batchIds.length) {
      eventQueries.push(
        supabaseClient.from("events").select("id, event_type, occurred_at, batch_id, payload")
          .eq("organization_id", organizationId).in("batch_id", batchIds)
          .order("occurred_at", { ascending: false }).limit(100)
      );
    }
    const eventResults = await Promise.all(eventQueries);
    if (requestId !== cultureDetailRequestId) return;
    for (const result of eventResults) {
      if (result.error) throw new Error("Événements : " + result.error.message);
    }
    const eventsById = new Map();
    eventResults.forEach(result => (result.data || []).forEach(event => eventsById.set(event.id, event)));
    const events = [...eventsById.values()].sort((a, b) => new Date(b.occurred_at || 0) - new Date(a.occurred_at || 0));
    const linkedEventIds = events.map(event => event.id);
    const measurementQueries = [
      supabaseClient.from("measurements").select("id, variable_code, raw_value, raw_unit_code, measured_at, event_id, metadata")
        .eq("organization_id", organizationId).eq("culture_id", culture.id)
        .order("measured_at", { ascending: false }).limit(100)
    ];
    const observationQueries = [
      supabaseClient.from("observations").select("id, variable_code, value_text, observed_at, event_id, metadata")
        .eq("organization_id", organizationId).eq("culture_id", culture.id)
        .order("observed_at", { ascending: false }).limit(100)
    ];
    if (linkedEventIds.length) {
      measurementQueries.push(
        supabaseClient.from("measurements").select("id, variable_code, raw_value, raw_unit_code, measured_at, event_id, metadata")
          .eq("organization_id", organizationId).in("event_id", linkedEventIds)
          .order("measured_at", { ascending: false }).limit(100)
      );
      observationQueries.push(
        supabaseClient.from("observations").select("id, variable_code, value_text, observed_at, event_id, metadata")
          .eq("organization_id", organizationId).in("event_id", linkedEventIds)
          .order("observed_at", { ascending: false }).limit(100)
      );
    }
    const [measurementResults, observationResults] = await Promise.all([
      Promise.all(measurementQueries), Promise.all(observationQueries)
    ]);
    if (requestId !== cultureDetailRequestId) return;
    for (const result of measurementResults) {
      if (result.error) throw new Error("Mesures : " + result.error.message);
    }
    for (const result of observationResults) {
      if (result.error) throw new Error("Observations : " + result.error.message);
    }
    const uniqueRows = results => [...new Map(results.flatMap(result => result.data || []).map(row => [row.id, row])).values()];
    const measurements = uniqueRows(measurementResults);
    const observations = uniqueRows(observationResults);
    const measurementsByEvent = new Map();
    const observationsByEvent = new Map();
    for (const row of measurements) {
      if (!row.event_id) continue;
      if (!measurementsByEvent.has(row.event_id)) measurementsByEvent.set(row.event_id, []);
      measurementsByEvent.get(row.event_id).push(row);
    }
    for (const row of observations) {
      if (!row.event_id) continue;
      if (!observationsByEvent.has(row.event_id)) observationsByEvent.set(row.event_id, []);
      observationsByEvent.get(row.event_id).push(row);
    }
    const variableLabel = code => measurementVariables.find(item => item.code === code)?.label || code || "Donnée";
    const entries = [];
    const eventIdSet = new Set(events.map(event => event.id));
    for (const event of events) {
      const linkedMeasurements = measurementsByEvent.get(event.id) || [];
      const linkedObservations = observationsByEvent.get(event.id) || [];
      linkedMeasurements.forEach(row => entries.push({
        date: row.measured_at || event.occurred_at,
        type: "Mesure · " + variableLabel(row.variable_code),
        detail: String(row.raw_value ?? "Valeur absente") + " " + (row.raw_unit_code || "") +
          (row.metadata?.note ? " — " + row.metadata.note : "")
      }));
      linkedObservations.forEach(row => entries.push({
        date: row.observed_at || event.occurred_at,
        type: "Observation · " + variableLabel(row.variable_code),
        detail: (row.value_text || "Sans description") +
          (row.metadata?.note ? " — " + row.metadata.note : "")
      }));
      if (!linkedMeasurements.length && !linkedObservations.length) entries.push({
        date: event.occurred_at,
        type: String(event.event_type || "Événement").replaceAll("_", " "),
        detail: [
          event.payload?.note,
          event.payload?.details?.conditions ? "Conditions : " + event.payload.details.conditions : null,
          event.payload?.details?.outcome ? "Résultat : " + String(event.payload.details.outcome).replaceAll("_", " ") : null,
          event.payload?.description
        ].filter(Boolean).join(" — ") ||
          (event.batch_id ? "Événement associé à un lot." : "Événement de traçabilité.")
      });
    }
    measurements.filter(row => !row.event_id || !eventIdSet.has(row.event_id)).forEach(row => entries.push({
      date: row.measured_at, type: "Mesure · " + variableLabel(row.variable_code),
      detail: String(row.raw_value ?? "Valeur absente") + " " + (row.raw_unit_code || "") +
        (row.metadata?.note ? " — " + row.metadata.note : "")
    }));
    observations.filter(row => !row.event_id || !eventIdSet.has(row.event_id)).forEach(row => entries.push({
      date: row.observed_at, type: "Observation · " + variableLabel(row.variable_code),
      detail: (row.value_text || "Sans description") +
        (row.metadata?.note ? " — " + row.metadata.note : "")
    }));
    entries.sort((a,b) => new Date(b.date || 0) - new Date(a.date || 0));

    const fields = summary.querySelectorAll(".culture-detail-field strong");
    if (fields[4]) fields[4].textContent = String(events.length);
    if (fields[5]) fields[5].textContent = String(measurements.length + observations.length);
    timeline.innerHTML = "";
    if (batches.length) {
      const batchSection = document.createElement("section");
      batchSection.className = "culture-linked-batches";
      const batchHeading = document.createElement("h3");
      batchHeading.textContent = "Lots de production liés (" + batches.length + ")";
      batchSection.appendChild(batchHeading);
      batches.forEach(batch => {
        const item = document.createElement("article");
        item.className = "culture-timeline-entry";
        const content = document.createElement("div");
        const heading = document.createElement("strong");
        heading.textContent = batch.batch_code || batch.name || "Lot sans code";
        const description = document.createElement("p");
        const stage = batch.current_stage ? " · Étape : " + batch.current_stage : "";
        const state = batch.status ? " · Statut : " + batch.status : "";
        description.textContent = (batch.batch_type || "Type non renseigné") + stage + state;
        content.append(heading, description);
        const openBatch = document.createElement("button");
        openBatch.type = "button";
        openBatch.className = "culture-catalog-action";
        openBatch.textContent = "Ouvrir le lot";
        openBatch.setAttribute("aria-label", "Ouvrir le lot " + (batch.batch_code || batch.name || ""));
        openBatch.addEventListener("click", async () => {
          activateWorkspaceModule("batchCard");
          document.getElementById("batchCard")?.scrollIntoView({
            block: "start",
            behavior: window.matchMedia("(prefers-reduced-motion, reduce)").matches ? "auto" : "smooth"
          });
          await loadBatch(batch.id);
        });
        item.append(content, openBatch);
        batchSection.appendChild(item);
      });
      timeline.appendChild(batchSection);
    }
    if (events.length === 100 || measurements.length >= 100 || observations.length >= 100 || batches.length === 100) {
      const limitNotice = document.createElement("p");
      limitNotice.className = "info warning";
      limitNotice.textContent = "Historique partiel : au moins une catégorie atteint sa limite de chargement. Certaines données anciennes peuvent ne pas apparaître ici.";
      timeline.appendChild(limitNotice);
    }
    if (!entries.length) {
      const emptyHistory = document.createElement("p");
      emptyHistory.className = "muted";
      emptyHistory.textContent = batches.length
        ? "Aucun événement, mesure ou observation n’est encore enregistré pour les lots liés à cette culture."
        : "Aucun événement, mesure ou observation n’est actuellement lié à cette culture.";
      timeline.appendChild(emptyHistory);
    } else {
      entries.forEach(entry => {
        const article = document.createElement("article");
        article.className = "culture-timeline-entry";
        const date = document.createElement("time");
        date.className = "culture-timeline-date";
        date.textContent = entry.date ? new Date(entry.date).toLocaleString("fr-FR") : "Date inconnue";
        const content = document.createElement("div");
        const heading = document.createElement("strong");
        heading.textContent = entry.type;
        const description = document.createElement("p");
        description.textContent = String(entry.detail || "Aucun détail enregistré");
        content.append(heading, description);
        article.append(date, content);
        timeline.appendChild(article);
      });
    }
    panel.scrollIntoView({block:"start",behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"});
  } catch (error) {
    if (requestId !== cultureDetailRequestId) return;
    console.error("Chargement de la fiche culture :", error);
    timeline.innerHTML = "";
    const message = document.createElement("p");
    message.className = "error info";
    message.textContent = "Impossible de charger l’historique de cette culture : " + error.message;
    timeline.appendChild(message);
  }
}

function updateOverview() {
  const cultureCount = document.getElementById("overviewCultureCount");
  const batchCount = document.getElementById("overviewBatchCount");
  const observationCount = document.getElementById("overviewObservationCount");
  const observationsPanel = document.getElementById("overviewRecentObservations");
  if (!cultureCount || !batchCount || !observationCount || !observationsPanel) return;

  cultureCount.textContent = String(cultureOptions.length);
  batchCount.textContent = String(latestBatches.length);
  observationCount.textContent = String(recentObservations.length);

  if (!recentObservations.length) {
    observationsPanel.innerHTML = '<p class="muted">Aucune observation récente chargée. Vous pouvez en enregistrer une depuis le module Données.</p>';
    return;
  }

  observationsPanel.innerHTML = recentObservations.slice(0, 5).map((row) => {
    const variable = measurementVariables.find((item) => item.code === row.variable_code);
    const stamp = row.observed_at ? new Date(row.observed_at).toLocaleString() : "Date inconnue";
    return '<article class="overview-observation"><strong>' +
      escapeHtml(variable?.label || row.variable_code || "Observation") +
      '</strong><time>' + escapeHtml(stamp) + '</time><p>' +
      escapeHtml(row.value_text || "Observation sans description") + '</p></article>';
  }).join("");
}

function activateWorkspaceModule(moduleId) {
  const modulesByDomain = {
    agronomy: ["overviewCard", "trackerCard", "measurementCard", "statisticsCard"],
    mycology: ["overviewCard", "trackerCard", "measurementCard", "statisticsCard"],
    laboratory: ["overviewCard", "trackerCard", "batchCard", "measurementCard", "statisticsCard"]
  };
  const modules = modulesByDomain[document.body.dataset.domain] || modulesByDomain.laboratory;
  if (!modules.includes(moduleId)) return;

  modules.forEach((id) => {
    const panel = document.getElementById(id);
    if (panel) panel.classList.toggle("workspace-inactive", id !== moduleId);
  });

  document.querySelectorAll(".section-nav a").forEach((link) => {
    const target = link.getAttribute("href");
    if (target === "#" + moduleId) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });
}

function setupUiEnhancements() {

  const busyLabel =
    /(\.\.\.|…)\s*$/;

  const syncBusy = (button) => {
    button.setAttribute(
      "aria-busy",
      busyLabel.test(button.textContent.trim())
        ? "true"
        : "false"
    );
  };

  [
    "signInButton",
    "signUpButton",
    "signOutButton",
    "createButton",
    "createBatchButton",
    "advanceBatchButton",
    "reloadBatchButton",
    "releaseBatchButton",
    "saveMeasurementButton",
    "saveObservationButton"
  ].forEach((id) => {
    const button = document.getElementById(id);

    if (!button) return;

    new MutationObserver(
      () => syncBusy(button)
    ).observe(
      button,
      { childList: true, characterData: true, subtree: true }
    );

    syncBusy(button);
  });

  new MutationObserver(() => {
    batchQcList
      .querySelectorAll(".qc-save")
      .forEach(syncBusy);
  }).observe(
    batchQcList,
    { childList: true, characterData: true, subtree: true }
  );

  const stageList =
    document.getElementById("batchStageList");

  const progressLabel =
    document.getElementById("stageProgressLabel");

  const progressBar =
    document.getElementById("stageProgressBar");

  const progressTrack =
    document.getElementById("stageProgressTrack");

  const updateProgress = () => {
    const items = [...stageList.children];

    const done = items.filter(
      (item) => item.classList.contains("completed")
    ).length;

    items.forEach((item) => {
      item.setAttribute("role", "listitem");

      if (item.classList.contains("active")) {
        item.setAttribute("aria-current", "step");
      } else {
        item.removeAttribute("aria-current");
      }
    });

    const percent =
      items.length
        ? Math.round((done / items.length) * 100)
        : 0;

    progressLabel.textContent =
      items.length
        ? `${done} étape(s) terminée(s) sur ${items.length}`
        : "";

    progressBar.style.width =
      `${percent}%`;

    progressTrack.setAttribute(
      "aria-valuenow",
      String(percent)
    );
  };

  new MutationObserver(updateProgress)
    .observe(stageList, { childList: true });

  authPassword.addEventListener(
    "keydown",
    (event) => {
      if (
        event.key === "Enter" &&
        !signInButton.disabled
      ) {
        event.preventDefault();
        signInButton.click();
      }
    }
  );

  document.querySelectorAll(".section-nav a").forEach((link) => {
    link.addEventListener("click", (event) => {
      const target = link.getAttribute("href");
      if (target === "#overviewCard" || target === "#trackerCard" || target === "#batchCard" || target === "#measurementCard" || target === "#statisticsCard") {
        event.preventDefault();
        activateWorkspaceModule(target.slice(1));
        document.getElementById(target.slice(1))?.scrollIntoView({
          block: "start",
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
        });
      }
    });
  });
  const domain = document.body.dataset.domain;
  if (domain !== "laboratory") {
    document.getElementById("batchCard")?.classList.add("hidden");
    document.querySelectorAll('.section-nav a[href="#batchCard"], [data-workspace-target="batchCard"]').forEach(el => el.hidden = true);
  }
  if (domain === "agronomy") {
    document.querySelector(".bio-operation-panel")?.classList.add("hidden");
    document.querySelector(".bio-lineage-panel")?.classList.add("hidden");
  }
  const workspaceHeadings = {
    agronomy: { tracker: "Cultures végétales et substrats", measurement: "Suivi environnemental", stats: "Analyse agronomique" },
    mycology: { tracker: "Souches et cultures fongiques", measurement: "Observations mycologiques", stats: "Analyse mycologique" },
    laboratory: { tracker: "Cultures sources et matières biologiques", measurement: "Mesures et résultats expérimentaux", stats: "Analyse expérimentale" }
  };
  const labels = workspaceHeadings[domain] || workspaceHeadings.laboratory;
  const trackerTitle = document.querySelector("#trackerCard h2");
  const measurementTitle = document.querySelector("#measurementCard h2");
  const statsTitle = document.querySelector("#statisticsCard h2");
  if (trackerTitle) trackerTitle.textContent = labels.tracker;
  if (measurementTitle) measurementTitle.textContent = labels.measurement;
  if (statsTitle) statsTitle.textContent = labels.stats;
  activateWorkspaceModule("overviewCard");

  document.querySelectorAll("[data-workspace-target]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = button.getAttribute("data-workspace-target");
      activateWorkspaceModule(target);
      document.getElementById(target)?.scrollIntoView({
        block: "start",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
      });
    });
  });
  document.getElementById("overviewOpenData")?.addEventListener("click", () => {
    activateWorkspaceModule("measurementCard");
    document.getElementById("measurementCard")?.scrollIntoView({block:"start",behavior:"auto"});
  });

  document.getElementById("loadStatisticsButton")?.addEventListener("click", loadStatistics);
document.getElementById("compareLotsButton")?.addEventListener("click", loadLotComparison);
  document.getElementById("statisticsVariable")?.addEventListener("change", () => { document.getElementById("statisticsStatus").textContent = "Variable modifiée. Lancez l’analyse pour actualiser les résultats."; });
  document.getElementById("statisticsCulture")?.addEventListener("change", () => { document.getElementById("statisticsStatus").textContent = "Culture modifiée. Lancez l’analyse pour actualiser les résultats."; });
  document.getElementById("statisticsBatch")?.addEventListener("change", () => { document.getElementById("statisticsStatus").textContent = "Lot modifié. Lancez l’analyse pour actualiser les résultats."; });
  document.getElementById("statisticsPeriod")?.addEventListener("change", () => { document.getElementById("statisticsStatus").textContent = "Période modifiée. Lancez l’analyse pour actualiser les résultats."; });
  document.getElementById("cultureSearch")?.addEventListener("input", renderCultureCatalog);
  document.getElementById("cultureTypeFilter")?.addEventListener("change", renderCultureCatalog);
  document.getElementById("bioOperationForm")?.addEventListener("submit", saveBiologicalOperation);
  document.getElementById("bioOperationDate")?.setAttribute("value", new Date().toISOString().slice(0,16));
  document.getElementById("closeCultureDetail")?.addEventListener("click", () => {
    document.getElementById("cultureDetailPanel")?.classList.add("hidden");
  });

  measurementVariableSelect.addEventListener("change", updateMeasurementUnits);
  saveMeasurementButton.addEventListener("click", saveMeasurement);
  saveObservationButton.addEventListener("click", saveObservation);
  reloadMeasurementsButton.addEventListener("click", () => loadRecentMeasurements().catch(error => showMessage(error.message, "error")));

  document
    .getElementById("retrySyncButton")
    .addEventListener(
      "click",
      () => syncPendingCultures()
    );
}


// Quick capture presets: select a matching variable, update its units, then focus the first missing field.
function setupQuickCapture() {
  const nowLocal = () => {
    const date = new Date();
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 16);
  };
  const pickOption = (select, terms) => {
    if (!select) return false;
    const options = [...select.options].filter(option => option.value);
    const match = options.find(option => terms.some(term => (option.textContent + " " + option.value).toLocaleLowerCase().includes(term)));
    if (!match) return false;
    select.value = match.value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  };
  document.querySelectorAll("[data-quick-measure]").forEach(button => {
    button.addEventListener("click", () => {
      const preset = button.dataset.quickMeasure;
      const options = [...measurementVariableSelect.options].filter(option => option.value);
      const selectedOption = options.find(option => {
        const label = option.textContent.toLocaleLowerCase();
        const code = option.value.toLocaleLowerCase();
        if (preset === "ph") return /\bph\b/.test(label) || /\bph\b/.test(code) || /acidité|acidity/.test(label);
        if (preset === "ec") return /\bec\b/.test(label) || /\bec\b/.test(code) || /conductivité|conductivity|µs\/cm|ms\/cm/.test(label);
        return /température|temperature|\btemp\b/.test(label) || /temperature|temp/.test(code);
      });
      const selected = Boolean(selectedOption);
      if (selectedOption) {
        measurementVariableSelect.value = selectedOption.value;
        measurementVariableSelect.dispatchEvent(new Event("change", { bubbles: true }));
      }
      if (!measurementAtInput.value) measurementAtInput.value = nowLocal();
      activateWorkspaceModule("measurementCard");
      document.getElementById("measurementCard")?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      if (measurementTargetSelect.options.length > 1 && !measurementTargetSelect.value) measurementTargetSelect.focus({ preventScroll: true });
      else if (!selected) measurementVariableSelect.focus({ preventScroll: true });
      else measurementValueInput.focus({ preventScroll: true });
      if (!selected) showMessage("Le paramètre n’a pas été reconnu automatiquement. Sélectionnez-le dans la liste ; la saisie express reste disponible.", "info");
    });
  });
  document.querySelector("[data-quick-observation]")?.addEventListener("click", () => {
    const details = document.querySelector(".observation-details");
    if (details) details.open = true;
    if (!observationAtInput.value) observationAtInput.value = nowLocal();
    pickOption(observationVariableSelect, ["morphologie", "aspect", "visuel", "observation", "croissance"]);
    activateWorkspaceModule("measurementCard");
    document.getElementById("measurementCard")?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    if (measurementTargetSelect.options.length > 1 && !measurementTargetSelect.value) measurementTargetSelect.focus({ preventScroll: true });
    else if (!observationVariableSelect.value) observationVariableSelect.focus({ preventScroll: true });
    else observationValueInput.focus({ preventScroll: true });
  });
}


/* Domain-specific workspace identity. Presentation changes only; save and sync flows remain shared. */
function setupDomainWorkspaces() {
  const modes = {
    agronomy: {
      heading: "Green Tech",
      description: "Serre, substrats, irrigation, climat et croissance.",
      eyebrow: "BA LABS / AGRITECH",
      title: 'Culture <span>&amp;</span><br>supervision agronomique',
      descriptionHero: "Suivez les conditions de culture, les mesures environnementales et l’évolution des plantes.",
      tags: ["Capteurs", "Substrats", "Croissance"],
      status: "AGRITECH / MONITORING"
    },
    mycology: {
      heading: "Registre mycologique",
      description: "Souches, lignées, générations, transferts et fructification.",
      eyebrow: "BA LABS / MYCOLOGIE",
      title: 'Souches <span>&amp;</span><br>traçabilité fongique',
      descriptionHero: "Documentez l’identité des souches, les étapes de propagation, les observations morphologiques et les incidents.",
      tags: ["Souches", "Générations", "Contamination"],
      status: "MYCOLOGY / SPECIMEN LEDGER"
    },
    laboratory: {
      heading: "Suivi expérimental",
      description: "Cultures sur milieux, protocoles, variables et résultats.",
      eyebrow: "BA LABS / LABORATOIRE",
      title: 'Cultures <span>&amp;</span><br>suivi scientifique',
      descriptionHero: "Enregistrez les conditions expérimentales, les variables mesurées et les résultats avec leur contexte.",
      tags: ["Milieux", "Protocoles", "Mesures"],
      status: "LAB / EXPERIMENT TRACKING"
    }
  };
  const buttons = [...document.querySelectorAll("[data-domain-choice]")];
  const eyebrow = document.querySelector(".app-hero .eyebrow");
  const title = document.querySelector(".app-hero h1");
  const heroDescription = document.querySelector(".hero-description");
  const heroTags = document.querySelector(".hero-tags");
  const toolbarStatus = document.querySelector(".toolbar-status span:last-child");
  const heading = document.getElementById("domainHeading");
  const description = document.getElementById("domainDescription");
  const setDomain = (domain, persist = true) => {
    const activeDomain = Object.hasOwn(modes, domain) ? domain : "agronomy";
    const config = modes[activeDomain];
    document.body.dataset.domain = activeDomain;
    buttons.forEach(button => button.setAttribute("aria-pressed", String(button.dataset.domainChoice === activeDomain)));
    if (heading) heading.textContent = config.heading;
    if (description) description.textContent = config.description;
    if (eyebrow) eyebrow.innerHTML = config.eyebrow.replace(" / ", ' <span class="eyebrow-separator">/</span> ');
    if (title) title.innerHTML = config.title;
    if (heroDescription) heroDescription.textContent = config.descriptionHero;
    if (heroTags) {
      heroTags.replaceChildren();
      config.tags.forEach(label => {
        const tag = document.createElement("span");
        tag.textContent = label;
        heroTags.appendChild(tag);
      });
    }
    if (toolbarStatus) toolbarStatus.textContent = config.status;
    document.documentElement.dataset.domain = activeDomain;
    if (persist) {
      try { localStorage.setItem("baLabsCultureTrackerDomain", activeDomain); } catch (_) {}
    }
  };
  buttons.forEach(button => button.addEventListener("click", () => setDomain(button.dataset.domainChoice)));
  setDomain(window.BA_LABS_DOMAIN, false);
}
setupDomainWorkspaces();
setupProgressiveCultureEntry();


/* Progressive disclosure: reveal the next capture step only after the current identity is complete. */
function setupProgressiveCultureEntry() {
  const steps = [...document.querySelectorAll("[data-entry-step]")];
  if (steps.length !== 3) return;
  const strain = document.getElementById("strain");
  const code = document.getElementById("cultureCode");
  const type = document.getElementById("cultureType");
  const protocol = document.getElementById("protocol");
  const startedAt = document.getElementById("startedAt");
  const update = () => {
    const identityReady = Boolean(strain?.value && code?.value.trim());
    steps[1].hidden = !identityReady;
    steps[1].classList.toggle("is-ready", identityReady);
    const conditionsReady = identityReady && Boolean(type?.value);
    steps[2].hidden = !conditionsReady;
    steps[2].classList.toggle("is-ready", conditionsReady);
    steps[0].classList.toggle("is-ready", identityReady);
    steps[1].setAttribute("aria-label", "Étape 2 : conditions de culture");
    steps[2].setAttribute("aria-label", "Étape 3 : validation et consentements");
    if (identityReady && !conditionsReady) {
      type?.setAttribute("aria-describedby", "entryStepHint");
    } else {
      type?.removeAttribute("aria-describedby");
    }
  };
  [strain, code, type, protocol, startedAt].forEach(field => {
    field?.addEventListener("input", update);
    field?.addEventListener("change", update);
  });
  update();
}

setupQuickCapture();


setupUiEnhancements();


init();

