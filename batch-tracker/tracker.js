

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
let plantCultureOptions = [];

let latestBatches = [];

let selectedBatchId = null;

let selectedBatch = null;

let initializationInProgress = false;
let authStateRevision = 0;
let strainOptionsRequestId = 0;
let batchPlaceOptionsRequestId = 0;
let measurementHistoryRequestId = 0;
let observationHistoryRequestId = 0;
let initializationWarnings = [];
let measurementVariables = [];
let measurementUnits = [];
let quantityUnitOptions = [];
let batchLocationOptions = [];
let batchEnvironmentOptions = [];
let recentObservations = [];


function isCurrentWorkspaceRevision(revision, expectedOrganizationId) {
  return revision === authStateRevision &&
    Boolean(expectedOrganizationId) &&
    organizationId === expectedOrganizationId;
}


function clearAuthenticatedWorkspaceState() {
  // Remove the previous tenant context before an auth transition can yield.
  organizationId = null;
  organization = null;
  strainOptions = [];
  referenceData = [];
  cultureOptions = [];
  plantCultureOptions = [];
  latestBatches = [];
  selectedBatchId = null;
  selectedBatch = null;
  measurementVariables = [];
  measurementUnits = [];
  quantityUnitOptions = [];
  batchLocationOptions = [];
  batchEnvironmentOptions = [];
  recentObservations = [];
  initializationWarnings = [];

  const cultureDetailPanel = document.getElementById("cultureDetailPanel");
  if (cultureDetailPanel) {
    cultureDetailPanel.classList.add("hidden");
    cultureDetailPanel.dataset.cultureId = "";
  }
  const generationComparisonResults = document.getElementById("generationComparisonResults");
  if (generationComparisonResults) {
    generationComparisonResults.__generationComparisonRequestId = (generationComparisonResults.__generationComparisonRequestId || 0) + 1;
    generationComparisonResults.replaceChildren();
  }
  document.getElementById("generationComparisonOptions")?.replaceChildren();
  const generationComparisonSearch = document.getElementById("generationComparisonSearch");
  if (generationComparisonSearch) generationComparisonSearch.value = "";
  const generationComparisonStatus = document.getElementById("generationComparisonStatus");
  if (generationComparisonStatus) generationComparisonStatus.textContent = "Connectez-vous pour comparer les générations.";
  const generationComparisonButton = document.getElementById("compareCultureGenerationsButton");
  if (generationComparisonButton) generationComparisonButton.disabled = false;

  if (recordHarvestButton) recordHarvestButton.disabled = true;
  if (saveMeasurementButton) saveMeasurementButton.disabled = true;
  if (saveObservationButton) saveObservationButton.disabled = true;
}



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

const BATCH_STAGES_BY_TYPE = {
  CULTURE: ["preparation", "sterilization", "inoculation", "incubation", "cultivation", "qc", "release"],
  TRICHODERMA: ["preparation", "sterilization", "inoculation", "incubation", "cultivation", "formulation", "packaging", "qc", "release"],
  PLEUROTUS_SPAWN: ["preparation", "sterilization", "inoculation", "incubation", "packaging", "qc", "release"],
  MUSHROOM_PRODUCT: ["harvest", "packaging", "qc", "release"],
  BIOSTIMULANT: ["preparation", "sterilization", "inoculation", "incubation", "cultivation", "formulation", "packaging", "qc", "release"],
  FORMULATION: ["preparation", "formulation", "packaging", "qc", "release"]
};

function getBatchStages(batchType) {
  return BATCH_STAGES_BY_TYPE[batchType] || BATCH_STAGES_BY_TYPE.CULTURE;
}


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

const batchLocationInput = document.getElementById("batchLocation");
const batchEnvironmentInput = document.getElementById("batchEnvironment");

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

const batchEvents = document.getElementById("batchEvents");
const batchEventList = document.getElementById("batchEventList");
const moveBatchLocationInput = document.getElementById("moveBatchLocation");
const moveBatchEnvironmentInput = document.getElementById("moveBatchEnvironment");
const moveBatchNoteInput = document.getElementById("moveBatchNote");
const moveBatchButton = document.getElementById("moveBatchButton");
const moveBatchStatus = document.getElementById("moveBatchStatus");
const harvestQuantityInput = document.getElementById("harvestQuantity");
const harvestUnitInput = document.getElementById("harvestUnit");
const harvestNoteInput = document.getElementById("harvestNote");
const recordHarvestButton = document.getElementById("recordHarvestButton");
const harvestStatus = document.getElementById("harvestStatus");

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
    const message = String(error.message || error);

    // A revoked/rotated refresh token can remain in browser storage after
    // another tab or device has refreshed the session. Clear only this
    // client's local session so the user can authenticate again safely.
    if (/invalid refresh token|refresh token not found/i.test(message)) {
      try {
        const { error: cleanupError } = await supabaseClient.auth.signOut({ scope: "local" });
        if (cleanupError) console.warn("Nettoyage de session locale :", cleanupError);
      } catch (cleanupError) {
        console.warn("Nettoyage de session locale :", cleanupError);
      }
      throw new Error("La session enregistrée sur cet appareil n’est plus valide. Reconnectez-vous avec votre adresse et votre mot de passe.");
    }

    throw error;
  }

  return data.session;

}


/* ============================================================
   CLAIM BA-LABS
   ============================================================ */

async function claimBALabs(session) {

  // refreshAuthUI already verified this session; do not trigger a second
  // refresh-token lookup before the organization claim.


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


  // The caller owns tenant-state mutation and checks its auth revision
  // before committing this claim to the current workspace.
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


    // The Supabase auth listener owns the post-login reconciliation.

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


    if (data && data.session) {
      // The Supabase auth listener owns the post-signup reconciliation.
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

    const { error } = await supabaseClient.auth.signOut();

    if (error) {
      throw error;
    }

  }

  catch (error) {

    console.error(
      "Erreur déconnexion:",
      error
    );

    showMessage(
      error.message || "Déconnexion impossible. Votre session peut être encore active.",
      "error"
    );

    return;

  }


  authStateRevision += 1;
  organizationId = null;
  organization = null;
  strainOptions = [];
  referenceData = [];
  cultureOptions = [];
  latestBatches = [];
  selectedBatchId = null;
  selectedBatch = null;
  if (harvestQuantityInput) harvestQuantityInput.value = "";
  if (harvestUnitInput) harvestUnitInput.value = "";
  if (harvestNoteInput) harvestNoteInput.value = "";
  if (recordHarvestButton) recordHarvestButton.disabled = true;
  if (harvestStatus) harvestStatus.textContent = "Connectez-vous et sélectionnez un lot à l’étape Récolte.";


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

async function refreshAuthUI(revision = authStateRevision) {

  let session;

  try {
    session = await getCurrentSession();
  } catch (error) {
    if (revision !== authStateRevision) return;

    // Do not leave previous tenant data visible or usable when session verification fails.
    clearAuthenticatedWorkspaceState();
    hideElement(trackerCard);
    hideElement(batchCard);
    hideElement(document.getElementById("plantCard"));
    hideElement(measurementCard);
    hideElement(document.getElementById("statisticsCard"));
    hideElement(document.getElementById("overviewCard"));
    hideElement(resultCard);
    hideElement(signOutButton);
    authStatus.textContent = "Session non vérifiable.";
    showMessage(
      "Impossible de vérifier votre session. Vérifiez la connexion Internet puis rechargez la page. Vos données ne sont pas supprimées.",
      "error"
    );
    console.error("Vérification de session impossible :", error);
    return;
  }

  if (revision !== authStateRevision) return;

  if (!session) {

    clearAuthenticatedWorkspaceState();
    hideElement(trackerCard);
    hideElement(batchCard);
    hideElement(document.getElementById("plantCard"));
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
    session,
    revision
  );

}


/* ============================================================
   INITIALISATION AUTHENTIFIEE
   ============================================================ */

async function initializeAuthenticatedTracker(
  session,
  revision = authStateRevision
) {

  if (
    initializationInProgress
  ) {

    return;

  }


  initializationInProgress =
    true;

  const initRevision = revision;
  let initializationStage = "préparation de la session";
  const setInitializationStage = (stage) => {
    if (initRevision !== authStateRevision) return;
    initializationStage = stage;
    authStatus.textContent = `Connexion BA-LABS — ${stage}…`;
  };

  try {

    clearMessage();
    initializationWarnings = [];

    setInitializationStage("rattachement à l’organisation");

    const claim =
      await claimBALabs(session);
    if (initRevision !== authStateRevision) return;

    // Commit the tenant context only after confirming this initialization is
    // still current; an obsolete claim must never overwrite the active tenant.
    organization = claim.organization;
    organizationId = claim.organization.id;

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


    setInitializationStage("chargement du catalogue des souches");
    await loadStrainOptions();
    if (initRevision !== authStateRevision) return;

    setInitializationStage("chargement des référentiels");
    await loadReferenceData();
    if (initRevision !== authStateRevision) return;

    setInitializationStage("chargement des cultures");
    await loadCultureOptions();
    if (initRevision !== authStateRevision) return;

    setInitializationStage("chargement des unités");
    await loadQuantityUnitOptions();
    if (initRevision !== authStateRevision) return;

    setInitializationStage("chargement des emplacements de lots");
    await loadBatchPlaceOptions();
    if (initRevision !== authStateRevision) return;

    populatePlantLocationOptions();
    document.getElementById("plantLocation")?.dispatchEvent(new Event("change"));

    // Mycology and Laboratory must not depend on the agronomy-only plant registry.
    // A plant-registry/RLS failure must not block authentication in those workspaces.
    if (document.body.dataset.domain === "agronomy") {
      setInitializationStage("chargement des cultures végétales");
      await loadPlantCultures();
      if (initRevision !== authStateRevision) return;
    }

    setInitializationStage("synchronisation des cultures en attente");
    await syncPendingCultures();
    if (initRevision !== authStateRevision) return;

    setInitializationStage("chargement des derniers lots");
    await loadLatestBatches();
    if (initRevision !== authStateRevision) return;

    try {
      setInitializationStage("chargement du catalogue de mesures");
      await loadMeasurementReferences();
      if (initRevision !== authStateRevision) return;
      saveMeasurementButton.disabled = false;
      saveObservationButton.disabled = false;
      try {
        await loadRecentMeasurements();
        if (initRevision !== authStateRevision) return;
      }
      catch (historyError) {
        if (initRevision !== authStateRevision) return;
        console.error("Historique des mesures indisponible :", historyError);
        initializationWarnings.push("historique des mesures");
        measurementHistory.textContent = "Impossible de charger l’historique des mesures. L’enregistrement reste disponible.";
      }
      try {
        await loadRecentObservations();
        if (initRevision !== authStateRevision) return;
      }
      catch (observationHistoryError) {
        if (initRevision !== authStateRevision) return;
        console.error("Historique des observations indisponible :", observationHistoryError);
        initializationWarnings.push("historique des observations");
        observationHistory.textContent = "Impossible de charger l’historique des observations. L’enregistrement reste disponible.";
      }
    } catch (measurementError) {
      if (initRevision !== authStateRevision) return;
      console.error("Initialisation du catalogue de mesures :", measurementError);
      initializationWarnings.push("catalogue des mesures");
      measurementHistory.textContent = "Le catalogue des mesures est indisponible ; les modules de culture et de production restent utilisables.";
      observationHistory.textContent = "Le catalogue des observations est indisponible ; les modules de culture et de production restent utilisables.";
      saveMeasurementButton.disabled = true;
      saveObservationButton.disabled = true;
    }

    setDefaultDate();

    // Never reveal data loaded by an initialization superseded by an auth change.
    if (initRevision !== authStateRevision) return;

    showElement(trackerCard);

    showElement(document.getElementById("plantCard"));

    showElement(batchCard);
    showElement(measurementCard);
    showElement(document.getElementById("statisticsCard"));
    showElement(document.getElementById("overviewCard"));
    updateOverview();


    if (initializationWarnings.length) {
      showMessage(
        `BA-LABS chargée — organisation ${organization.code}. Chargement partiel : ${initializationWarnings.join(", ")} indisponible(s). Les modules principaux restent accessibles.`,
        "warning"
      );
    } else {
      showMessage(
        `BA-LABS chargée — organisation ${organization.code}.`
      );
    }

  }

  catch (error) {

    console.error(
      "Initialisation BA-LABS:",
      error
    );

    if (initRevision !== authStateRevision) return;

    hideElement(trackerCard);
    hideElement(batchCard);
    hideElement(document.getElementById("plantCard"));
    hideElement(measurementCard);
    hideElement(document.getElementById("statisticsCard"));
    hideElement(document.getElementById("overviewCard"));


    showMessage(
      `Échec à l’étape « ${initializationStage} » : ${error.message || "erreur inconnue"}`,
      "error"
    );

  }

  finally {

    initializationInProgress =
      false;

    // If the session changed while loading, reconcile the UI against the latest session.
    if (initRevision !== authStateRevision) {
      setTimeout(() => {
        refreshAuthUI().catch(error => {
          console.error("Actualisation de session :", error);
        });
      }, 0);
    }

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
  const plantStartedAt = document.getElementById("plantStartedAt");
  if (plantStartedAt) plantStartedAt.value = now.toISOString().slice(0, 16);

}


/* ============================================================
   SOUCHES / MATERIAUX
   ============================================================ */

async function loadStrainOptions() {
  const requestId = ++strainOptionsRequestId;
  const loadRevision = authStateRevision;
  const loadOrganizationId = organizationId;
  if (!loadOrganizationId) {
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
        loadOrganizationId
      )
      .order(
        "strain_code"
      );


  if (requestId !== strainOptionsRequestId || !isCurrentWorkspaceRevision(loadRevision, loadOrganizationId)) return;

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


  const loadRevision = authStateRevision;

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


  if (loadRevision !== authStateRevision) return;

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

function workspaceCultureTypes(types, domain = document.body.dataset.domain) {
  if (domain === "laboratory") return types;
  if (domain === "agronomy") return [];
  const mycologyCodes = new Set([
    "agar", "plate", "slant", "broth", "flask", "other_liquid", "grain_spawn",
    "substrate", "fermentation", "other"
  ]);
  return types.filter(item => mycologyCodes.has(item.code));
}

function workspaceMeasurementVariables(variables, domain = document.body.dataset.domain) {
  if (domain === "laboratory") return variables;
  const allowedByDomain = {
    agronomy: new Set([
      "co2_concentration", "electrical_conductivity", "illuminance", "ph",
      "relative_humidity", "root_length", "shoot_length", "substrate_moisture",
      "temperature", "fresh_mass", "dry_mass", "wet_biomass", "volume"
    ]),
    mycology: new Set([
      "cfu", "cfu_per_ml", "co2_concentration", "colony_count", "dry_biomass",
      "electrical_conductivity", "fresh_mass", "generation_time", "growth_rate",
      "incubation_time", "od600", "ph", "relative_humidity", "temperature",
      "viability", "volume", "wet_biomass"
    ])
  };
  const allowed = allowedByDomain[domain];
  return allowed ? variables.filter(variable => allowed.has(variable.code)) : [];
}



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
  const visibleTypes = workspaceCultureTypes(types, document.body.dataset.domain);

  for (
    const item of visibleTypes
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
  const loadRevision = authStateRevision;
  const loadOrganizationId = organizationId;
  if (!loadOrganizationId) return;

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
      .eq("organization_id", loadOrganizationId)
      .in("notion_sync_status", ["pending", "error"])
      .order("created_at", { ascending: true })
      .limit(20);

    if (!isCurrentWorkspaceRevision(loadRevision, loadOrganizationId)) return;

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
      if (!isCurrentWorkspaceRevision(loadRevision, loadOrganizationId)) return;
      try {
        const { data, error: syncError } =
          await supabaseClient.functions.invoke(
            "sync-culture-to-notion",
            { body: { culture_id: culture.id } }
          );

        if (!isCurrentWorkspaceRevision(loadRevision, loadOrganizationId)) return;

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
        if (!isCurrentWorkspaceRevision(loadRevision, loadOrganizationId)) return;
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
  const operationRevision = authStateRevision;
  const operationOrganizationId = organizationId;


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


  if (!operationOrganizationId) {

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

  let session;

  try {
    session = await getCurrentSession();
  } catch (error) {
    if (!isCurrentWorkspaceRevision(operationRevision, operationOrganizationId)) return;
    showMessage(
      error.message || "Impossible de vérifier votre session. Reconnectez-vous puis réessayez.",
      "error"
    );
    return;
  }

  if (!isCurrentWorkspaceRevision(operationRevision, operationOrganizationId)) return;

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
      .eq("organization_id", operationOrganizationId)
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
      if (!isCurrentWorkspaceRevision(operationRevision, operationOrganizationId)) throw new Error("Session ou espace de travail modifié pendant l’opération. Recommencez.");
    const updateResult = await consentTable
        .update(consentValues)
        .eq("id", existingConsent.id);
      consentError = updateResult.error;
    } else {
      if (!isCurrentWorkspaceRevision(operationRevision, operationOrganizationId)) throw new Error("Session ou espace de travail modifié pendant l’opération. Recommencez.");
    const insertResult = await consentTable
        .insert({
          organization_id: operationOrganizationId,
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


    if (!isCurrentWorkspaceRevision(operationRevision, operationOrganizationId)) throw new Error("Session ou espace de travail modifié pendant l’opération. Recommencez.");
    const cultureGenerationPayload = {
      p_organization_id: operationOrganizationId,
      p_code: cultureCode,
      p_culture_type: cultureType,
      p_parent_material_id: materialId,
      p_parent_culture_id: null,
      p_protocol_version_id: protocolVersionId,
      p_environment_id: null,
      p_experiment_id: null,
      p_experimental_unit_id: null,
      p_started_at: startedAt ? new Date(startedAt).toISOString() : null,
      p_metadata: {
        source: "BA Labs Culture Tracker",
        interface_version: "2.0",
        domain: document.body.dataset.domain === "laboratory" ? "laboratory" : "mycology"
      }
    };
    const cultureGenerationKey = await getManualWriteIdempotencyKey(
      "culture-generation",
      cultureGenerationPayload
    );
    if (!isCurrentWorkspaceRevision(operationRevision, operationOrganizationId)) {
      throw new Error("Session ou espace de travail modifié pendant l’opération. Recommencez.");
    }
    const { data, error } = await supabaseClient.rpc(
      "create_culture_with_generation_idempotent",
      {
        ...cultureGenerationPayload,
        p_idempotency_key: cultureGenerationKey
      }
    );
    if (error) throw new Error(error.message);
    clearManualWriteIdempotencyKey("culture-generation");
    if (!isCurrentWorkspaceRevision(operationRevision, operationOrganizationId)) return;


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

    if (!isCurrentWorkspaceRevision(operationRevision, operationOrganizationId)) return;

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
    if (!isCurrentWorkspaceRevision(operationRevision, operationOrganizationId)) return;

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
    if (isCurrentWorkspaceRevision(operationRevision, operationOrganizationId)) {
      createButton.disabled = false;
      createButton.textContent = "Créer la culture";
    }
  }

}


/* ============================================================
   CULTURES DISPONIBLES POUR LES BATCHS
   ============================================================ */

async function loadOrganizationRowsInPages(tableName, columns, errorLabel, pageSize = 250) {
  const requestedOrganizationId = organizationId;
  if (!requestedOrganizationId) return [];
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabaseClient
      .from(tableName)
      .select(columns)
      .eq("organization_id", requestedOrganizationId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(`${errorLabel} : ${error.message}`);
    if (requestedOrganizationId !== organizationId) return [];
    const page = data || [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}


async function loadCultureOptions() {

  const loadRevision = authStateRevision;
  const loadOrganizationId = organizationId;
  if (!loadOrganizationId) {

    return;

  }

  const requestedDomain = document.body.dataset.domain;
  const requestedOrganizationId = organizationId;
  const data = await loadOrganizationRowsInPages(
    "cultures",
    "id, code, culture_type, material_id, started_at, metadata",
    "Chargement des cultures impossible"
  );

  // A slower response from a workspace we already left must not replace
  // the current workspace's culture registry.
  if (!isCurrentWorkspaceRevision(loadRevision, loadOrganizationId) ||
      requestedOrganizationId !== organizationId ||
      requestedDomain !== document.body.dataset.domain) return;

  const activeDomain = requestedDomain;
  cultureOptions = (data || []).filter(culture => {
    if (activeDomain === "agronomy") return false;
    const recordDomain = culture.metadata?.domain;
    if (recordDomain) return recordDomain === activeDomain;
    return activeDomain === "mycology";
  });

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

  const loadRevision = authStateRevision;
  const loadOrganizationId = organizationId;
  if (!loadOrganizationId) {

    return;

  }

  const requestedDomain = document.body.dataset.domain;
  const requestedOrganizationId = organizationId;
  const requestedCultures = cultureOptions.slice();
  const data = await loadOrganizationRowsInPages(
    "batches",
    "id, batch_code, name, batch_type, status, current_stage, culture_id, environment_id, material_id, planned_at, quantity_planned, quantity_actual, quantity_unit_code, created_at",
    "Chargement des batchs impossible"
  );

  // Discard late responses after a workspace or organization change.
  if (!isCurrentWorkspaceRevision(loadRevision, loadOrganizationId) ||
      requestedOrganizationId !== organizationId ||
      requestedDomain !== document.body.dataset.domain) return;

  // A batch belongs to the workspace of its source culture. The schema
  // has no authoritative domain column on batches, so use the already
  // domain-scoped culture registry rather than guessing from batch_type.
  const visibleCultureIds = new Set(requestedCultures.map(culture => culture.id));
  latestBatches = (data || []).filter(batch =>
    Boolean(batch.culture_id && visibleCultureIds.has(batch.culture_id))
  );

  renderBatchComparisonOptions();
  renderBatchList();
  renderMeasurementTargets();
  renderStatisticsFilters();

}


/* ============================================================
   COMPARAISON DES LOTS — descriptif, sans inférence statistique
   ============================================================ */

function renderBatchComparisonOptions() {
  const select = document.getElementById("batchCompareSelect");
  if (!select) return;
  const previous = new Set([...select.selectedOptions].map(option => option.value));
  select.replaceChildren();
  latestBatches.forEach(batch => {
    const option = document.createElement("option");
    option.value = batch.id;
    option.textContent = `${batch.batch_code} — ${batch.name || "Sans nom"}`;
    option.selected = previous.has(batch.id);
    select.appendChild(option);
  });
}

async function fetchAllComparisonPages(queryBuilder, pageSize = 1000) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await queryBuilder.range(from, from + pageSize - 1);
    if (error) return { data: null, error };
    const page = data || [];
    rows.push(...page);
    if (page.length < pageSize) return { data: rows, error: null };
  }
}

async function compareSelectedBatches() {
  const operationRevision = authStateRevision;
  const operationOrganizationId = organizationId;
  const select = document.getElementById("batchCompareSelect");
  const status = document.getElementById("batchCompareStatus");
  const results = document.getElementById("batchCompareResults");
  const button = document.getElementById("compareBatchesButton");
  if (!select || !status || !results || !button) return;
  const language = window.BALabsI18n?.language || "fr";
  const ui = ({
    fr: { selection:"Sélectionnez entre 2 et 4 lots.", stale:"Un ou plusieurs lots ne sont plus dans la liste chargée. Actualisez la page.", loading:"Chargement des étapes et des mesures…", loaded:"Comparaison chargée.", capped:"Comparaison chargée avec une limite de 1 000 mesures récentes par lien culture/environnement ; les comptes peuvent être incomplets.", count:"n_mesures désigne le nombre de mesures, pas le nombre de répétitions biologiques indépendantes.", shared:"Les mesures d'un environnement partagé peuvent apparaître pour plusieurs lots.", repeated:n=>`Attention : ${n} lien(s) d'unité expérimentale sont partagés entre les lots sélectionnés ; ces lots ne constituent pas autant de répétitions indépendantes.`, unitMismatch:n=>`Comparabilité : ${n} variable(s) utilisent plusieurs unités dans les lots sélectionnés ; leurs valeurs restent séparées et ne doivent pas être comparées directement.`, missing:"Les données manquantes ne sont pas interprétées comme zéro.", impossible:"Impossible de comparer les lots.", culture:"Culture", environment:"Environnement", observations:n=>`${n} observation(s)`, noObservations:"Aucune observation", treatment:"traitement", replicate:"répétition", excluded:"exclue" },
    en: { selection:"Select between 2 and 4 batches.", stale:"One or more batches are no longer in the loaded list. Refresh the page.", loading:"Loading stages and measurements…", loaded:"Comparison loaded.", capped:"Comparison loaded with a limit of 1,000 recent measurements per culture/environment link; counts may be incomplete.", count:"n_measurements is the number of measurements, not the number of independent biological replicates.", shared:"Measurements from a shared environment may appear for multiple batches.", repeated:n=>`Warning: ${n} experimental-unit link(s) are shared by the selected batches; these batches do not represent that many independent replicates.`, unitMismatch:n=>`Comparability: ${n} variable(s) use multiple units across the selected batches; values remain separated and must not be compared directly.`, missing:"Missing data is not treated as zero.", impossible:"Unable to compare batches.", culture:"Culture", environment:"Environment", observations:n=>`${n} observation(s)`, noObservations:"No observations", treatment:"treatment", replicate:"replicate", excluded:"excluded" },
    pt: { selection:"Selecione entre 2 e 4 lotes.", stale:"Um ou mais lotes já não estão na lista carregada. Atualize a página.", loading:"A carregar etapas e medições…", loaded:"Comparação carregada.", capped:"Comparação carregada com um limite de 1.000 medições recentes por ligação cultura/ambiente; as contagens podem estar incompletas.", count:"n_medições indica o número de medições, não o número de repetições biológicas independentes.", shared:"As medições de um ambiente partilhado podem aparecer em vários lotes.", repeated:n=>`Atenção: ${n} ligação(ões) de unidade experimental são partilhadas pelos lotes selecionados; estes lotes não representam esse número de repetições independentes.`, unitMismatch:n=>`Comparabilidade: ${n} variável(is) usam várias unidades nos lotes selecionados; os valores permanecem separados e não devem ser comparados diretamente.`, missing:"Os dados em falta não são tratados como zero.", impossible:"Não foi possível comparar os lotes.", culture:"Cultura", environment:"Ambiente", observations:n=>`${n} observação(ões)`, noObservations:"Sem observações", treatment:"tratamento", replicate:"repetição", excluded:"excluída" },
    ar: { selection:"اختر من دفعتين إلى أربع دفعات.", stale:"لم تعد دفعة واحدة أو أكثر موجودة في القائمة المحمّلة. حدّث الصفحة.", loading:"جارٍ تحميل المراحل والقياسات…", loaded:"اكتملت المقارنة.", capped:"اكتملت المقارنة مع حد أقصى قدره ١٬٠٠٠ قياس حديث لكل ارتباط بين المزرعة والبيئة؛ وقد تكون الأعداد غير مكتملة.", count:"n_measurements هو عدد القياسات وليس عدد المكررات البيولوجية المستقلة.", shared:"قد تظهر قياسات البيئة المشتركة في عدة دفعات.", repeated:n=>`تحذير: توجد ${n} روابط لوحدات تجريبية مشتركة بين الدفعات المحددة؛ ولا تمثل هذه الدفعات هذا العدد من المكررات المستقلة.`, unitMismatch:n=>`قابلية المقارنة: تستخدم ${n} متغيرات وحدات متعددة بين الدفعات المحددة؛ ستبقى القيم منفصلة ولا ينبغي مقارنتها مباشرة.`, missing:"لا تُعامل البيانات المفقودة على أنها صفر.", impossible:"تعذرت مقارنة الدفعات.", culture:"المزرعة", environment:"البيئة", observations:n=>`${n} ملاحظة`, noObservations:"لا توجد ملاحظات", treatment:"المعاملة", replicate:"مكرر", excluded:"مستبعدة" }
  })[language] || null;
  const labels = ui || ({
    selection:"Sélectionnez entre 2 et 4 lots.", stale:"Un ou plusieurs lots ne sont plus dans la liste chargée. Actualisez la page.", loading:"Chargement des étapes et des mesures…", loaded:"Comparaison chargée.", capped:"Comparaison chargée avec une limite de 1 000 mesures récentes par lien culture/environnement ; les comptes peuvent être incomplets.", count:"n_mesures désigne le nombre de mesures, pas le nombre de répétitions biologiques indépendantes.", shared:"Les mesures d'un environnement partagé peuvent apparaître pour plusieurs lots.", repeated:n=>`Attention : ${n} lien(s) d'unité expérimentale sont partagés entre les lots sélectionnés ; ces lots ne constituent pas autant de répétitions indépendantes.`, missing:"Les données manquantes ne sont pas interprétées comme zéro.", impossible:"Impossible de comparer les lots.", culture:"Culture", environment:"Environnement", observations:n=>`${n} observation(s)`, noObservations:"Aucune observation", treatment:"traitement", replicate:"répétition", excluded:"exclue"
  });
  const ids = [...select.selectedOptions].map(option => option.value);
  if (ids.length < 2 || ids.length > 4) {
    status.textContent = labels.selection;
    results.replaceChildren();
    return;
  }
  const batches = latestBatches.filter(batch => ids.includes(batch.id));
  if (batches.length !== ids.length) {
    status.textContent = labels.stale;
    return;
  }
  button.disabled = true;
  status.textContent = labels.loading;
  results.replaceChildren();
  try {
    const cultureIds = [...new Set(batches.map(batch => batch.culture_id).filter(Boolean))];
    const environmentIds = [...new Set(batches.map(batch => batch.environment_id).filter(Boolean))];
    const [stageResult, cultureMeasurementResult, environmentMeasurementResult, cultureContextResult] = await Promise.all([
      supabaseClient.from("batch_stages")
        .select("batch_id,stage_code,status,sequence_no,started_at,completed_at")
        .eq("organization_id", operationOrganizationId).in("batch_id", ids),
      cultureIds.length
        ? fetchAllComparisonPages(supabaseClient.from("measurements")
            .select("id,culture_id,environment_id,variable_code,raw_value,raw_unit_code,normalized_value,normalized_unit_code,measured_at,quality_state,exclusion_reason")
            .eq("organization_id", operationOrganizationId).in("culture_id", cultureIds)
            .order("measured_at", { ascending: false }).order("id", { ascending: true }))
        : Promise.resolve({data:[],error:null}),
      environmentIds.length
        ? fetchAllComparisonPages(supabaseClient.from("measurements")
            .select("id,culture_id,environment_id,variable_code,raw_value,raw_unit_code,normalized_value,normalized_unit_code,measured_at,quality_state,exclusion_reason")
            .eq("organization_id", operationOrganizationId).in("environment_id", environmentIds)
            .order("measured_at", { ascending: false }).order("id", { ascending: true }))
        : Promise.resolve({data:[],error:null}),
      cultureIds.length
        ? supabaseClient.from("cultures")
            .select("id,experiment_id,experimental_unit_id")
            .eq("organization_id", operationOrganizationId).in("id", cultureIds)
        : Promise.resolve({data:[],error:null})
    ]);
    if (stageResult.error) throw new Error("Chargement des étapes impossible : " + stageResult.error.message);
    if (cultureMeasurementResult.error) throw new Error("Chargement des mesures de culture impossible : " + cultureMeasurementResult.error.message);
    if (environmentMeasurementResult.error) throw new Error("Chargement des mesures d'environnement impossible : " + environmentMeasurementResult.error.message);
    if (cultureContextResult.error) throw new Error("Chargement du contexte expérimental impossible : " + cultureContextResult.error.message);
    if (!isCurrentWorkspaceRevision(operationRevision, operationOrganizationId)) return;
    const cultureContexts = cultureContextResult.data || [];
    const unitIds = [...new Set(cultureContexts.map(row => row.experimental_unit_id).filter(Boolean))];
    const [unitResult] = await Promise.all([
      unitIds.length
        ? supabaseClient.from("experimental_units")
            .select("id,experiment_id,unit_code,replicate_no,treatment_code")
            .eq("organization_id", operationOrganizationId).in("id", unitIds)
        : Promise.resolve({data:[],error:null})
    ]);
    if (!isCurrentWorkspaceRevision(operationRevision, operationOrganizationId)) return;
    if (unitResult.error) throw new Error("Chargement des unités expérimentales impossible : " + unitResult.error.message);
    const units = unitResult.data || [];
    const unitsById = new Map(units.map(row => [row.id, row]));
    const experimentIds = [...new Set([
      ...cultureContexts.map(row => row.experiment_id),
      ...units.map(row => row.experiment_id)
    ].filter(Boolean))];
    const experimentResult = experimentIds.length
      ? await supabaseClient.from("experiments")
          .select("id,code,name")
          .eq("organization_id", operationOrganizationId).in("id", experimentIds)
      : {data:[],error:null};
    if (!isCurrentWorkspaceRevision(operationRevision, operationOrganizationId)) return;
    if (experimentResult.error) throw new Error("Chargement des expériences impossible : " + experimentResult.error.message);
    const experimentsById = new Map((experimentResult.data || []).map(row => [row.id, row]));
    const contextsByCultureId = new Map(cultureContexts.map(row => {
      const unit = unitsById.get(row.experimental_unit_id);
      const experiment = experimentsById.get(row.experiment_id || unit?.experiment_id);
      return [row.id, {
        experiment: experiment ? `${experiment.code} — ${experiment.name}` : (language === "en" ? "Not specified" : language === "pt" ? "Não indicado" : language === "ar" ? "غير محدد" : "Non renseignée"),
        unit: unit ? [unit.unit_code, unit.treatment_code ? `${labels.treatment} ${unit.treatment_code}` : null, unit.replicate_no != null ? `${labels.replicate} ${unit.replicate_no}` : null].filter(Boolean).join(" · ") : (language === "en" ? "Not specified" : language === "pt" ? "Não indicado" : language === "ar" ? "غير محدد" : "Non renseignée"), experimentalUnitId: unit?.id || null
      }];
    }));
    const observationCultureResult = cultureIds.length
      ? await fetchAllComparisonPages(supabaseClient.from("observations")
          .select("id,culture_id,experimental_unit_id,variable_code,value_text,observed_at,quality_state")
          .eq("organization_id", operationOrganizationId).in("culture_id", cultureIds)
          .order("observed_at", { ascending: false }).order("id", { ascending: true }))
      : {data:[],error:null};
    if (!isCurrentWorkspaceRevision(operationRevision, operationOrganizationId)) return;
    if (observationCultureResult.error) throw new Error("Chargement des observations de culture impossible : " + observationCultureResult.error.message);
    const observationUnitResult = unitIds.length
      ? await fetchAllComparisonPages(supabaseClient.from("observations")
          .select("id,culture_id,experimental_unit_id,variable_code,value_text,observed_at,quality_state")
          .eq("organization_id", operationOrganizationId).in("experimental_unit_id", unitIds)
          .order("observed_at", { ascending: false }).order("id", { ascending: true }))
      : {data:[],error:null};
    if (!isCurrentWorkspaceRevision(operationRevision, operationOrganizationId)) return;
    if (observationUnitResult.error) throw new Error("Chargement des observations expérimentales impossible : " + observationUnitResult.error.message);
    const observationMap = new Map();
    [...(observationCultureResult.data || []), ...(observationUnitResult.data || [])].forEach(row => {
      if (row.id) observationMap.set(row.id, row);
    });
    const observations = [...observationMap.values()];
    if (!isCurrentWorkspaceRevision(operationRevision, operationOrganizationId)) return;
    const stages = stageResult.data || [];
    const measurementMap = new Map();
    [...(cultureMeasurementResult.data || []), ...(environmentMeasurementResult.data || [])].forEach(row => {
      if (row.id) measurementMap.set(row.id, row);
    });
    const measurements = [...measurementMap.values()];
    // Unit-aware comparison: never treat values in different units as directly comparable.
    const measurementUnitsByVariable = new Map();
    measurements.forEach(row => {
      if (row.quality_state === "excluded") return;
      const value = row.normalized_value ?? row.raw_value;
      if (value == null || !Number.isFinite(Number(value))) return;
      const variable = row.variable_code || "variable inconnue";
      const unit = row.normalized_value != null ? (row.normalized_unit_code || "") : (row.raw_unit_code || "");
      if (!measurementUnitsByVariable.has(variable)) measurementUnitsByVariable.set(variable, new Set());
      measurementUnitsByVariable.get(variable).add(unit || "(unité non renseignée)");
    });
    const unitMismatchCount = [...measurementUnitsByVariable.values()].filter(units => units.size > 1).length;
    const table = document.createElement("table");
    table.className = "statistics-table";
    table.innerHTML = "<caption>Comparaison descriptive des lots sélectionnés</caption><thead><tr><th>Lot</th><th>Type</th><th>Expérience</th><th>Unité / traitement / répétition</th><th>État / étape</th><th>Quantité prévue</th><th>Quantité réelle</th><th>Étapes terminées</th><th>Mesures de culture</th><th>Mesures d'environnement</th><th>Observations qualitatives</th><th>Résumé numérique séparé par source</th><th>Dernière mesure</th></tr></thead>";
    const tbody = document.createElement("tbody");
    const summarize = rows => {
      const groups = new Map();
      rows.forEach(row => {
        if (row.quality_state === "excluded") return;
        const value = row.normalized_value ?? row.raw_value;
        if (value == null || !Number.isFinite(Number(value))) return;
        const unit = row.normalized_value != null ? (row.normalized_unit_code || "") : (row.raw_unit_code || "");
        const key = `${row.variable_code || "variable inconnue"}||${unit}||${row.quality_state || "raw"}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(Number(value));
      });
      const language = window.BALabsI18n?.language || "fr";
      const labels = {
        fr: {mean:"moyenne",median:"médiane",quartiles:"Q1–Q3",outliers:"valeurs atypiques (règle IQR)",outlierCaution:"à examiner, pas automatiquement erronées",range:"min–max",excluded:"exclues",nonNumeric:"valeurs non numériques",empty:"Aucune mesure numérique exploitable"},
        en: {mean:"mean",median:"median",quartiles:"Q1–Q3",outliers:"potential outliers (IQR rule)",outlierCaution:"review; not automatically erroneous",range:"min–max",excluded:"excluded",nonNumeric:"non-numeric values",empty:"No usable numeric measurements"},
        pt: {mean:"média",median:"mediana",quartiles:"Q1–Q3",outliers:"valores atípicos potenciais (regra IQR)",outlierCaution:"rever; não são automaticamente erros",range:"mín–máx",excluded:"excluídas",nonNumeric:"valores não numéricos",empty:"Sem medições numéricas utilizáveis"},
        ar: {mean:"المتوسط",median:"الوسيط",quartiles:"الربيع الأول–الثالث",outliers:"قيم شاذة محتملة (قاعدة المدى الربيعي)",outlierCaution:"تحتاج إلى مراجعة ولا تعني أنها خاطئة تلقائيًا",range:"الحد الأدنى–الأقصى",excluded:"مستبعدة",nonNumeric:"قيم غير رقمية",empty:"لا توجد قياسات رقمية قابلة للاستخدام"}
      }[language] || {mean:"moyenne",median:"médiane",quartiles:"Q1–Q3",outliers:"valeurs atypiques (règle IQR)",outlierCaution:"à examiner, pas automatiquement erronées",range:"min–max",excluded:"exclues",nonNumeric:"valeurs non numériques",empty:"Aucune mesure numérique exploitable"};
      const summaries = [...groups.entries()].map(([key, values]) => {
        const [variable, unit, quality] = key.split("||");
        const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
        let min = Infinity;
        let max = -Infinity;
        values.forEach(value => {
          if (value < min) min = value;
          if (value > max) max = value;
        });
        const sorted = values.slice().sort((a, b) => a - b);
        const quantile = probability => {
          const position = (sorted.length - 1) * probability;
          const lower = Math.floor(position);
          const upper = Math.ceil(position);
          return lower === upper ? sorted[lower] : sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
        };
        const median = quantile(0.5);
        const q1 = quantile(0.25);
        const q3 = quantile(0.75);
        const iqr = q3 - q1;
        const outlierCount = values.length >= 4
          ? sorted.filter(value => value < q1 - 1.5 * iqr || value > q3 + 1.5 * iqr).length
          : null;
        const fmt = value => new Intl.NumberFormat(undefined, {maximumSignificantDigits: 5}).format(value);
        const outlierSummary = outlierCount == null ? "" : `, ${labels.outliers} ${outlierCount} (${labels.outlierCaution})`;
        return `${variable}${unit ? " (" + unit + ")" : ""}: ${labels.mean} ${fmt(mean)}, ${labels.median} ${fmt(median)}, ${labels.quartiles} ${fmt(q1)}–${fmt(q3)}, ${labels.range} ${fmt(min)}–${fmt(max)}${outlierSummary}, n_mesures=${values.length} [${quality}]`;
      });
      const excluded = rows.filter(row => row.quality_state === "excluded").length;
      const nonNumeric = rows.filter(row => {
        if (row.quality_state === "excluded") return false;
        const value = row.normalized_value ?? row.raw_value;
        return value == null || !Number.isFinite(Number(value));
      }).length;
      if (excluded) summaries.push(`${labels.excluded}: ${excluded}`);
      if (nonNumeric) summaries.push(`${labels.nonNumeric}: ${nonNumeric}`);
      return summaries.length ? summaries.join("; ") : labels.empty;
    };
    batches.forEach(batch => {
      const batchStages = stages.filter(stage => stage.batch_id === batch.id);
      const completed = batchStages.filter(stage => stage.status === "completed").length;
      const cultureLinked = batch.culture_id ? measurements.filter(row => row.culture_id === batch.culture_id) : [];
      const environmentLinked = batch.environment_id ? measurements.filter(row => row.environment_id === batch.environment_id && !(batch.culture_id && row.culture_id === batch.culture_id)) : [];
      const linked = new Map([...cultureLinked, ...environmentLinked].map(row => [row.id, row]));
      const linkedRows = [...linked.values()];
      const context = batch.culture_id ? contextsByCultureId.get(batch.culture_id) : null;
      const batchObservations = observations.filter(row =>
        (batch.culture_id && row.culture_id === batch.culture_id) ||
        (context?.experimentalUnitId && row.experimental_unit_id === context.experimentalUnitId)
      ).sort((a, b) => new Date(b.observed_at) - new Date(a.observed_at));
      const observationSummary = batchObservations.length
        ? labels.observations(batchObservations.length) + " : " + batchObservations.slice(0, 3).map(row =>
            row.variable_code + " — " + row.value_text + (row.quality_state === "excluded" ? " [" + labels.excluded + "]" : "")
          ).join(" ; ") + (batchObservations.length > 3 ? " ; …" : "")
        : labels.noObservations;
      const lastDate = linkedRows.reduce((latest, row) => {
        const date = row.measured_at ? new Date(row.measured_at) : null;
        return date && (!latest || date > latest) ? date : latest;
      }, null);
      const values = [
        `${batch.batch_code || "—"} — ${batch.name || "Sans nom"}`,
        batch.batch_type || "—",
        context?.experiment || "Non renseignée",
        context?.unit || "Non renseignée",
        `${batch.status || "—"} / ${batch.current_stage || "—"}`,
        batch.quantity_planned == null ? "—" : `${batch.quantity_planned} ${batch.quantity_unit_code || ""}`.trim(),
        batch.quantity_actual == null ? "—" : `${batch.quantity_actual} ${batch.quantity_unit_code || ""}`.trim(),
        `${completed} / ${batchStages.length}`,
        String(cultureLinked.length),
        String(environmentLinked.length),
        observationSummary,
        `${labels.culture} : ${summarize(cultureLinked)} | ${labels.environment} : ${summarize(environmentLinked)}`,
        lastDate ? lastDate.toLocaleString() : "—"
      ];
      const tr = document.createElement("tr");
      values.forEach(value => { const td=document.createElement("td"); td.textContent=value; tr.appendChild(td); });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    results.appendChild(table);
    const selectedUnitIds = batches
      .map(batch => batch.culture_id ? contextsByCultureId.get(batch.culture_id)?.experimentalUnitId : null)
      .filter(Boolean);
    const repeatedUnitCount = selectedUnitIds.length - new Set(selectedUnitIds).size;
    const statusParts = [
      labels.loaded,
      labels.count,
      labels.shared,
      repeatedUnitCount > 0 ? labels.repeated(repeatedUnitCount) : "",
      unitMismatchCount > 0 ? labels.unitMismatch(unitMismatchCount) : "",
      labels.missing
    ].filter(Boolean);
    status.textContent = statusParts.join(" ");
  } catch (error) {
    if (!isCurrentWorkspaceRevision(operationRevision, operationOrganizationId)) return;
    status.textContent = error?.message || labels.impossible;
  } finally {
    if (isCurrentWorkspaceRevision(operationRevision, operationOrganizationId)) button.disabled = false;
  }
}
document.getElementById("compareBatchesButton")?.addEventListener("click", compareSelectedBatches);


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
  const loadRevision = authStateRevision;
  const loadOrganizationId = organizationId;

  if (!loadOrganizationId) {

    return;

  }


  const requestId = ++batchDetailRequestId;
  selectedBatchId =
    batchId;
  selectedBatch = null;
  advanceBatchButton.disabled = true;
  releaseBatchButton.disabled = true;
  if (recordHarvestButton) recordHarvestButton.disabled = true;
  if (moveBatchButton) moveBatchButton.disabled = true;
  hideElement(batchInfo);
  hideElement(batchStages);
  hideElement(batchQc);
  hideElement(batchEvents);

  clearMessage();

  try {

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
        loadOrganizationId
      )
      .eq(
        "id",
        batchId
      )
      .single();

  if (requestId !== batchDetailRequestId || !isCurrentWorkspaceRevision(loadRevision, loadOrganizationId)) return;

  if (batchError) {

    showMessage(
      `Chargement du batch impossible : ${batchError.message}`,
      "error"
    );

    return;

  }



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
        loadOrganizationId
      )
      .eq(
        "batch_id",
        batchId
      )
      .order(
        "sequence_no"
      );

  if (requestId !== batchDetailRequestId || !isCurrentWorkspaceRevision(loadRevision, loadOrganizationId)) return;

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
        loadOrganizationId
      )
      .eq(
        "batch_id",
        batchId
      )
      .order(
        "check_code"
      );

  if (requestId !== batchDetailRequestId || !isCurrentWorkspaceRevision(loadRevision, loadOrganizationId)) return;

  if (qcError) {

    showMessage(
      `Chargement du QC impossible : ${qcError.message}`,
      "error"
    );

    return;

  }

  // Le journal est en lecture seule : il réutilise les événements déjà reliés au lot.
  // Une indisponibilité du journal ne doit pas empêcher l'accès aux étapes ou au QC.
  let batchEventsData = [];
  let batchEventsError = null;
  try {
    const batchEventsResult = await supabaseClient
      .from("events")
      .select("id,event_type,occurred_at,payload,location_id,environment_id")
      .eq("organization_id", loadOrganizationId)
      .eq("batch_id", batchId)
      .order("occurred_at", { ascending: false })
      .limit(50);
    batchEventsData = batchEventsResult.data || [];
    batchEventsError = batchEventsResult.error;
  } catch (error) {
    batchEventsError = error;
  }

  if (requestId !== batchDetailRequestId || !isCurrentWorkspaceRevision(loadRevision, loadOrganizationId)) return;

  selectedBatch = batch;

  renderBatchInfo(
    batch
  );

  renderBatchStages(
    stages || []
  );

  renderBatchQc(
    qcChecks || []
  );
  renderBatchEventTimeline(batchEventsData || [], batchEventsError?.message || null);
  updateHarvestEntryState(batch, batchEventsData || []);
  prepareMovementControls(batch);


  showElement(
    batchInfo
  );

  showElement(
    batchStages
  );

  showElement(
    batchQc
  );
  showElement(batchEvents);


  updateBatchActionState(
    batch,
    stages || [],
    qcChecks || []
  );

  } catch (error) {
    if (requestId !== batchDetailRequestId || !isCurrentWorkspaceRevision(loadRevision, loadOrganizationId)) return;
    console.error("Chargement du lot :", error);
    showMessage(
      `Chargement du lot impossible : ${error?.message || "erreur réseau inconnue"}`,
      "error"
    );
  }
}


/* ============================================================
   INFORMATIONS BATCH
   ============================================================ */

function updateHarvestEntryState(batch, events) {
  if (!recordHarvestButton || !harvestStatus) return;
  const allowed = batch?.current_stage === "harvest" && batch?.status === "active";
  recordHarvestButton.disabled = !allowed;
  const groups = new Map();
  (events || []).filter(event => event.event_type === "harvest_recorded").forEach(event => {
    const p = event.payload && typeof event.payload === "object" ? event.payload : {};
    const q = Number(p.quantity), unit = String(p.unit_code || "").trim();
    if (Number.isFinite(q) && q > 0 && unit) groups.set(unit, (groups.get(unit) || 0) + q);
  });
  harvestStatus.textContent = allowed ? "Étape Récolte active. Chaque saisie reste distincte." : "La saisie est activée uniquement pendant l’étape Récolte d’un lot ouvert.";
  if (groups.size) harvestStatus.textContent += " Total des 50 événements chargés, par unité : " + [...groups].map(([u,q]) => Number(q.toPrecision(8)) + " " + u).join(" · ") + ".";
}

async function recordBatchHarvest() {
  const operationRevision = authStateRevision;
  const operationOrganizationId = organizationId;

  if (!operationOrganizationId || !selectedBatch || !selectedBatchId) {
    showMessage("Sélectionnez d’abord un lot.", "error");
    return;
  }
  if (selectedBatch.current_stage !== "harvest" || selectedBatch.status !== "active") {
    showMessage("La récolte ne peut être enregistrée que pendant l’étape Récolte d’un lot ouvert.", "error");
    return;
  }
  const quantityText = harvestQuantityInput.value.trim();
  const quantity = Number(quantityText);
  const unitCode = harvestUnitInput.value.trim();
  const note = harvestNoteInput.value.trim();
  if (!quantityText || !Number.isFinite(quantity) || quantity <= 0 || !unitCode) {
    showMessage("Indiquez une quantité strictement positive et un code d’unité.", "error");
    return;
  }
  recordHarvestButton.disabled = true;
  const originalLabel = recordHarvestButton.textContent;
  recordHarvestButton.textContent = "Enregistrement…";
  try {
    const session = await getCurrentSession();
    if (!session) throw new Error("Session expirée. Reconnectez-vous.");
    const { data: unit, error: unitError } = await supabaseClient.from("units").select("code").eq("code", unitCode).maybeSingle();
    if (unitError) throw new Error("Vérification de l’unité impossible : " + unitError.message);
    if (!unit) throw new Error("Code d’unité inconnu. Utilisez un code déjà présent dans le référentiel des unités.");
    // events requires exactly one biological/material/sample/unit anchor in addition to batch_id.
    const eventAnchor = selectedBatch.culture_id
      ? { culture_id: selectedBatch.culture_id }
      : selectedBatch.material_id
        ? { material_id: selectedBatch.material_id }
        : null;
    if (!eventAnchor) {
      throw new Error("Ce lot doit être lié à une culture ou à un matériau pour enregistrer une récolte dans le journal biologique.");
    }
    if (!isCurrentWorkspaceRevision(operationRevision, operationOrganizationId)) throw new Error("Session ou espace de travail modifié pendant l’opération. Recommencez.");
    const { data: eventId, error } = await supabaseClient.rpc("record_batch_harvest", {
      p_batch_id: selectedBatch.id,
      p_quantity: quantity,
      p_unit_code: unit.code,
      p_note: note || null
    });
    if (!isCurrentWorkspaceRevision(operationRevision, operationOrganizationId)) return;
    if (error) throw new Error("Enregistrement de la récolte impossible : " + error.message);
    if (!eventId) throw new Error("La base n’a pas confirmé l’enregistrement de la récolte.");
    harvestQuantityInput.value = "";
    harvestNoteInput.value = "";
    showMessage("Récolte enregistrée dans la chronologie du lot.", "success");
    await loadBatch(selectedBatch.id);
    await loadLatestBatches();
  } catch (error) {
    if (!isCurrentWorkspaceRevision(operationRevision, operationOrganizationId)) return;
    console.error("Enregistrement récolte :", error);
    showMessage(error?.message || "Enregistrement de la récolte impossible.", "error");
  } finally {
    if (isCurrentWorkspaceRevision(operationRevision, operationOrganizationId)) {
      recordHarvestButton.textContent = originalLabel;
      if (selectedBatch) {
        recordHarvestButton.disabled = !(selectedBatch.current_stage === "harvest" && selectedBatch.status === "active");
      }
    }
  }
}
recordHarvestButton?.addEventListener("click", recordBatchHarvest);


function renderBatchEventTimeline(events, loadError = null) {
  if (!batchEventList) return;
  batchEventList.replaceChildren();

  if (loadError) {
    batchEventList.textContent = "Chronologie indisponible : " + loadError;
    return;
  }
  if (!events?.length) {
    batchEventList.innerHTML = '<p class="muted">Aucun événement enregistré pour ce lot.</p>';
    return;
  }

  const labels = {
    batch_created: "Lot créé",
    batch_stage_advanced: "Étape avancée",
    batch_completed: "Cycle terminé",
    batch_released: "Lot libéré",
    measurement_recorded: "Mesure enregistrée",
    harvest_recorded: "Récolte enregistrée",
    observation_recorded: "Observation enregistrée",
    batch_moved: "Déplacement du lot"
  };
  const summarize = event => {
    const p = event.payload && typeof event.payload === "object" ? event.payload : {};
    if (event.event_type === "batch_created") return [p.batch_code, p.batch_type].filter(Boolean).join(" · ");
    if (event.event_type === "batch_stage_advanced") return [p.from, p.to].filter(Boolean).join(" → ");
    if (event.event_type === "batch_completed") return p.final_stage ? "Étape finale : " + p.final_stage : "";
    if (event.event_type === "batch_released") {
      const parts = [];
      if (Number.isFinite(Number(p.passed))) parts.push("validés : " + p.passed);
      if (Number.isFinite(Number(p.waived))) parts.push("dérogations : " + p.waived);
      if (Number.isFinite(Number(p.qc_checks))) parts.push("contrôles : " + p.qc_checks);
      return parts.join(" · ");
    }
    if (event.event_type === "harvest_recorded") {
      const parts = [];
      if (p.quantity !== undefined && p.quantity !== null) parts.push("Quantité : " + String(p.quantity) + (p.unit_code ? " " + p.unit_code : ""));
      if (p.note) parts.push(String(p.note));
      return parts.join(" · ");
    }
    if (event.event_type === "measurement_recorded") {
      const parts = [];
      if (p.variable_code) parts.push(p.variable_code);
      if (p.raw_value !== undefined && p.raw_value !== null) parts.push(String(p.raw_value) + (p.raw_unit_code ? " " + p.raw_unit_code : ""));
      return parts.join(" : ");
    }
    if (event.event_type === "batch_moved") {
      const parts = [];
      const location = batchLocationOptions.find(item => item.id === event.location_id);
      const environment = batchEnvironmentOptions.find(item => item.id === event.environment_id);
      if (location) parts.push("Emplacement : " + (location.name || location.code || location.id));
      else if (event.location_id) parts.push("Emplacement mis à jour");
      if (environment) parts.push("Environnement : " + environment.name);
      else if (event.environment_id) parts.push("Environnement mis à jour");
      if (p.note) parts.push(String(p.note));
      return parts.join(" · ");
    }
    return "";
  };

  events.forEach(event => {
    const item = document.createElement("article");
    item.className = "info batch-event-item";
    const date = event.occurred_at ? new Date(event.occurred_at) : null;
    const dateLabel = date && !Number.isNaN(date.getTime()) ? date.toLocaleString() : "Date inconnue";
    const heading = document.createElement("strong");
    heading.textContent = labels[event.event_type] || String(event.event_type || "Événement");
    const time = document.createElement("div");
    time.className = "muted";
    time.textContent = dateLabel;
    item.append(heading, time);
    const detailText = summarize(event);
    if (detailText) {
      const detail = document.createElement("div");
      detail.textContent = detailText;
      item.appendChild(detail);
    }
    batchEventList.appendChild(item);
  });
}


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


  const locationName = batchLocationOptions.find(location => location.id === batch.location_id)?.name || "—";
  const environmentName = batchEnvironmentOptions.find(environment => environment.id === batch.environment_id)?.name || "—";

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

      <div class="batch-stat">
        <div class="batch-stat-label">Emplacement</div>
        <div class="batch-stat-value">
          ${escapeHtml(locationName)}
        </div>
      </div>

      <div class="batch-stat">
        <div class="batch-stat-label">Environnement</div>
        <div class="batch-stat-value">
          ${escapeHtml(environmentName)}
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


  const orderedStages = stages.length
    ? [...stages].sort((a, b) => (a.sequence_no ?? 0) - (b.sequence_no ?? 0))
    : BATCH_STAGES.map((stage_code, sequence_no) => ({
        stage_code,
        sequence_no,
        status: "pending"
      }));

  for (
    let index = 0;
    index < orderedStages.length;
    index++
  ) {

    const stage = orderedStages[index];
    const stageCode = stage.stage_code;


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
  const operationRevision = authStateRevision;
  const operationOrganizationId = organizationId;


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

  } catch (error) {
    if (!isCurrentWorkspaceRevision(operationRevision, operationOrganizationId)) return;
    console.error("Enregistrement du contrôle qualité impossible :", error);
    showMessage("Enregistrement QC impossible : " + (error.message || "erreur inconnue"), "error");

  } finally {

    qcSavesInFlight.delete(checkId);

    // Après un enregistrement réussi la liste est re-rendue : l'ancien bouton n'est plus dans le DOM.
    if (isCurrentWorkspaceRevision(operationRevision, operationOrganizationId) && button && button.isConnected) {

      button.disabled = false;

      button.textContent = label;

    }

  }

}


async function saveQcCheckNow(
  checkId
) {
  const operationRevision = authStateRevision;
  const operationOrganizationId = organizationId;


  if (!operationOrganizationId) {

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


  let sessionData;
  try {
    const result = await supabaseClient.auth.getSession();
    sessionData = result.data;
  } catch (error) {
    if (!isCurrentWorkspaceRevision(operationRevision, operationOrganizationId)) return;
    showMessage(
      `Vérification de la session impossible : ${error?.message || "erreur inconnue"}`,
      "error"
    );
    return;
  }

  if (!isCurrentWorkspaceRevision(operationRevision, operationOrganizationId)) return;

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


  if (!isCurrentWorkspaceRevision(operationRevision, operationOrganizationId)) throw new Error("Session ou espace de travail modifié pendant l’opération. Recommencez.");
  let updateResult;
  try {
    updateResult = await supabaseClient
      .from("batch_qc_checks")
      .update(update)
      .eq("organization_id", operationOrganizationId)
      .eq("id", checkId);
  } catch (error) {
    if (!isCurrentWorkspaceRevision(operationRevision, operationOrganizationId)) return;
    showMessage(
      `Enregistrement QC impossible : ${error?.message || "erreur inconnue"}`,
      "error"
    );
    return;
  }

  const { error } = updateResult;


  if (!isCurrentWorkspaceRevision(operationRevision, operationOrganizationId)) return;

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
  const operationRevision = authStateRevision;
  const operationOrganizationId = organizationId;


  clearMessage();


  if (!operationOrganizationId) {

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
    showMessage(
      "La culture sélectionnée n'est plus disponible. Actualisez la liste des cultures puis réessayez.",
      "error"
    );
    return;
  }


  const quantityPlanned =
    quantityRaw === ""
      ? null
      : Number(quantityRaw);


  if (
    quantityPlanned !== null &&
    (
      !Number.isFinite(quantityPlanned) ||
      quantityPlanned <= 0
    )
  ) {

    showMessage(
      "La quantité prévue est invalide.",
      "error"
    );

    return;

  }


  if (quantityPlanned !== null && !quantityUnit) {
    showMessage(
      "Choisissez une unité dans le référentiel pour la quantité prévue.",
      "error"
    );
    return;
  }

  if (quantityPlanned === null && quantityUnit) {
    showMessage(
      "Saisissez la quantité prévue ou effacez l’unité sélectionnée.",
      "error"
    );
    return;
  }

  const selectedMaterialId =
    selectedCulture.material_id;


  createBatchButton.disabled =
    true;

  createBatchButton.textContent =
    "Création...";


  try {

    if (!isCurrentWorkspaceRevision(operationRevision, operationOrganizationId)) throw new Error("Session ou espace de travail modifié pendant l’opération. Recommencez.");

    const protocolVersionId =
      await getCultureProtocolVersionId(
        selectedCulture.id
      );

    if (!isCurrentWorkspaceRevision(operationRevision, operationOrganizationId)) throw new Error("Session ou espace de travail modifié pendant l’opération. Recommencez.");

    const {
      data,
      error
    } =
      await supabaseClient.rpc(
        "create_batch_with_stages",
        {

          p_organization_id:
            operationOrganizationId,

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
            batchLocationInput?.value || null,

          p_environment_id:
            batchEnvironmentInput?.value || null,

          p_planned_at:
            new Date().toISOString(),

          p_quantity_planned:
            quantityPlanned,

          p_quantity_unit_code:
            quantityUnit ||
            null,

          p_stages:
            getBatchStages(batchType)

        }
      );
    if (!isCurrentWorkspaceRevision(operationRevision, operationOrganizationId)) return;


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

    if (batchLocationInput) batchLocationInput.value = "";
    renderBatchEnvironmentOptions();
    if (batchEnvironmentInput) batchEnvironmentInput.value = "";


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
        ${escapeHtml(BATCH_STAGE_LABELS[getBatchStages(batchType)[0]] || getBatchStages(batchType)[0])}
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
    if (!isCurrentWorkspaceRevision(operationRevision, operationOrganizationId)) return;

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
    if (isCurrentWorkspaceRevision(operationRevision, operationOrganizationId)) {
      createBatchButton.disabled = false;
      createBatchButton.textContent = "Créer le batch";
    }
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
  const operationRevision = authStateRevision;
  const operationOrganizationId = organizationId;


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

    if (!isCurrentWorkspaceRevision(operationRevision, operationOrganizationId)) throw new Error("Session ou espace de travail modifié pendant l’opération. Recommencez.");
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
    if (!isCurrentWorkspaceRevision(operationRevision, operationOrganizationId)) return;


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
    if (!isCurrentWorkspaceRevision(operationRevision, operationOrganizationId)) return;

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
    if (isCurrentWorkspaceRevision(operationRevision, operationOrganizationId)) {
      advanceBatchButton.disabled = false;
    }
  }

}


/* ============================================================
   LIBERATION DU BATCH
   ============================================================ */

async function releaseBatch() {
  const operationRevision = authStateRevision;
  const operationOrganizationId = organizationId;


  if (!selectedBatchId || !selectedBatch) {

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

    if (!isCurrentWorkspaceRevision(operationRevision, operationOrganizationId)) throw new Error("Session ou espace de travail modifié pendant l’opération. Recommencez.");
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
    if (!isCurrentWorkspaceRevision(operationRevision, operationOrganizationId)) return;


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
    if (!isCurrentWorkspaceRevision(operationRevision, operationOrganizationId)) return;

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
    if (isCurrentWorkspaceRevision(operationRevision, operationOrganizationId)) {
      releaseBatchButton.disabled = false;
      releaseBatchButton.textContent = "Libérer le batch";
    }
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

    // init() owns the initial session check; don't race it with INITIAL_SESSION.
    if (event === "INITIAL_SESSION") return;

    authStateRevision += 1;
    const revision = authStateRevision;

    // Hide and invalidate the old tenant immediately on login/logout transitions.
    if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
      clearAuthenticatedWorkspaceState();
      hideElement(trackerCard);
      hideElement(batchCard);
      hideElement(document.getElementById("plantCard"));
      hideElement(measurementCard);
      hideElement(document.getElementById("statisticsCard"));
      hideElement(document.getElementById("overviewCard"));
      hideElement(resultCard);
      hideElement(signOutButton);
      authStatus.textContent = "Vérification de la session…";
    }

    setTimeout(
      () => {

        refreshAuthUI(revision)
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
    // refreshAuthUI owns the single initial session verification.
    await refreshAuthUI();
  } catch (error) {
    console.error("Initialisation inattendue:", error);
    showMessage(error.message || "Initialisation impossible.", "error");
  }
}

/* ============================================================
   INTERFACE : chargement, accessibilité, progression
   ============================================================ */


/* ============================================================
   UNITÉS DE QUANTITÉ — LOTS ET RÉCOLTES
   ============================================================ */

async function loadQuantityUnitOptions() {
  const loadRevision = authStateRevision;
  const selects = [batchUnitInput, harvestUnitInput].filter(Boolean);
  for (const select of selects) {
    select.replaceChildren();
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Choisir une unité…";
    select.appendChild(placeholder);
  }

  try {
    const { data, error } = await supabaseClient
      .from("units")
      .select("code,label,dimension")
      .order("code");
    if (loadRevision !== authStateRevision) return;
    if (error) throw error;

    quantityUnitOptions = data || [];
    for (const select of selects) {
      for (const unit of quantityUnitOptions) {
        const option = document.createElement("option");
        option.value = unit.code;
        const label = unit.label && unit.label !== unit.code
          ? `${unit.label} (${unit.code})`
          : unit.code;
        option.textContent = unit.dimension
          ? `${label} — ${unit.dimension}`
          : label;
        select.appendChild(option);
      }
      select.disabled = quantityUnitOptions.length === 0;
    }
    if (!quantityUnitOptions.length) {
      for (const select of selects) {
        select.options[0].textContent = "Aucune unité disponible";
      }
    }
  } catch (error) {
    if (loadRevision !== authStateRevision) return;
    console.error("Référentiel des unités indisponible :", error);
    initializationWarnings.push("unités");
    quantityUnitOptions = [];
    for (const select of selects) {
      select.disabled = true;
      if (select.options[0]) select.options[0].textContent = "Unités indisponibles";
    }
  }
}


/* ============================================================
   EMPLACEMENTS ET ENVIRONNEMENTS DES LOTS
   ============================================================ */

function renderMovementEnvironmentOptions() {
  if (!moveBatchEnvironmentInput) return;
  const locationId = moveBatchLocationInput?.value || "";
  const current = moveBatchEnvironmentInput.value;
  const available = batchEnvironmentOptions.filter(environment =>
    locationId
      ? !environment.location_id || environment.location_id === locationId
      : !environment.location_id
  );
  moveBatchEnvironmentInput.replaceChildren();
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Aucun environnement";
  moveBatchEnvironmentInput.appendChild(placeholder);
  for (const environment of available) {
    const option = document.createElement("option");
    option.value = environment.id;
    option.textContent = environment.name;
    moveBatchEnvironmentInput.appendChild(option);
  }
  moveBatchEnvironmentInput.value = available.some(environment => environment.id === current) ? current : "";
  moveBatchEnvironmentInput.disabled = available.length === 0 || !selectedBatch;
}

function prepareMovementControls(batch) {
  if (!moveBatchLocationInput || !moveBatchEnvironmentInput || !moveBatchButton || !moveBatchStatus) return;
  moveBatchLocationInput.replaceChildren();
  const noLocation = document.createElement("option");
  noLocation.value = "";
  noLocation.textContent = "Aucun emplacement";
  moveBatchLocationInput.appendChild(noLocation);
  for (const location of batchLocationOptions) {
    const option = document.createElement("option");
    option.value = location.id;
    option.textContent = location.name || location.code || location.id;
    moveBatchLocationInput.appendChild(option);
  }
  moveBatchLocationInput.value = batch?.location_id || "";
  renderMovementEnvironmentOptions();
  moveBatchEnvironmentInput.value = batch?.environment_id || "";
  // If legacy data contains a now-incompatible pairing, don't silently retain it.
  if (![...moveBatchEnvironmentInput.options].some(option => option.value === moveBatchEnvironmentInput.value)) {
    moveBatchEnvironmentInput.value = "";
  }
  const isOpen = batch && !["released", "rejected", "aborted", "completed"].includes(batch.status);
  const hasCurrentAssignment = Boolean(batch?.location_id || batch?.environment_id);
  moveBatchButton.disabled = !isOpen || (!batchLocationOptions.length && !batchEnvironmentOptions.length && !hasCurrentAssignment);
  moveBatchLocationInput.disabled = !isOpen;
  moveBatchEnvironmentInput.disabled = !isOpen || moveBatchEnvironmentInput.options.length <= 1;
  moveBatchStatus.textContent = batch
    ? "Choisissez l’emplacement et l’environnement de destination. Un déplacement sans changement sera refusé."
    : "Sélectionnez un lot pour préparer un déplacement.";
}

async function moveSelectedBatch() {
  const operationRevision = authStateRevision;
  const operationOrganizationId = organizationId;

  if (!operationOrganizationId || !selectedBatch || !selectedBatchId) {
    showMessage("Sélectionnez d’abord un lot.", "error");
    return;
  }
  if (["released", "rejected", "aborted", "completed"].includes(selectedBatch.status)) {
    showMessage("Un lot clôturé ne peut pas être déplacé depuis ce formulaire.", "error");
    return;
  }
  const locationId = moveBatchLocationInput?.value || null;
  const environmentId = moveBatchEnvironmentInput?.value || null;
  const note = moveBatchNoteInput?.value.trim() || null;
  const currentLocation = selectedBatch.location_id || null;
  const currentEnvironment = selectedBatch.environment_id || null;
  if (locationId === currentLocation && environmentId === currentEnvironment) {
    showMessage("Le nouvel emplacement et l’environnement sont identiques aux valeurs actuelles.", "error");
    return;
  }
  moveBatchButton.disabled = true;
  const label = moveBatchButton.textContent;
  moveBatchButton.textContent = "Enregistrement…";
  try {
    if (!isCurrentWorkspaceRevision(operationRevision, operationOrganizationId)) throw new Error("Session ou espace de travail modifié pendant l’opération. Recommencez.");
    const { data, error } = await supabaseClient.rpc("move_batch_to_location", {
      p_batch_id: selectedBatchId,
      p_location_id: locationId,
      p_environment_id: environmentId,
      p_note: note
    });
    if (!isCurrentWorkspaceRevision(operationRevision, operationOrganizationId)) return;
    if (error) throw error;
    if (!data?.event_id) throw new Error("La RPC n’a pas confirmé la création de l’événement de déplacement.");
    if (moveBatchNoteInput) moveBatchNoteInput.value = "";
    await loadLatestBatches();
    await loadBatch(selectedBatchId);
    showMessage("Déplacement enregistré dans la chronologie du lot.", "success");
  } catch (error) {
    if (!isCurrentWorkspaceRevision(operationRevision, operationOrganizationId)) return;
    console.error("Déplacement du lot impossible:", error);
    showMessage("Déplacement impossible : " + (error.message || "erreur inconnue"), "error");
  } finally {
    if (isCurrentWorkspaceRevision(operationRevision, operationOrganizationId)) {
      moveBatchButton.textContent = label;
      if (selectedBatch) prepareMovementControls(selectedBatch);
    }
  }
}

function renderBatchEnvironmentOptions() {
  if (!batchEnvironmentInput) return;
  const selectedLocationId = batchLocationInput?.value || "";
  const available = batchEnvironmentOptions.filter(environment =>
    selectedLocationId
      ? !environment.location_id || environment.location_id === selectedLocationId
      : !environment.location_id
  );
  batchEnvironmentInput.replaceChildren();
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Aucun environnement";
  batchEnvironmentInput.appendChild(placeholder);
  for (const environment of available) {
    const option = document.createElement("option");
    option.value = environment.id;
    option.textContent = environment.name;
    batchEnvironmentInput.appendChild(option);
  }
  batchEnvironmentInput.disabled = available.length === 0;
}

async function loadBatchPlaceOptions() {
  const requestId = ++batchPlaceOptionsRequestId;
  const loadRevision = authStateRevision;
  const loadOrganizationId = organizationId;
  if (!loadOrganizationId || !batchLocationInput || !batchEnvironmentInput) return;
  batchLocationInput.disabled = true;
  batchEnvironmentInput.disabled = true;
  try {
    const [{ data: locations, error: locationsError }, { data: environments, error: environmentsError }] = await Promise.all([
      supabaseClient.from("locations").select("id,code,name").eq("organization_id", loadOrganizationId).order("name"),
      supabaseClient.from("environments").select("id,name,location_id").eq("organization_id", loadOrganizationId).order("name")
    ]);
    if (requestId !== batchPlaceOptionsRequestId || !isCurrentWorkspaceRevision(loadRevision, loadOrganizationId)) return;
    if (locationsError) throw locationsError;
    if (environmentsError) throw environmentsError;
    batchLocationOptions = locations || [];
    batchEnvironmentOptions = environments || [];
    batchLocationInput.replaceChildren();
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Aucun emplacement";
    batchLocationInput.appendChild(placeholder);
    for (const location of batchLocationOptions) {
      const option = document.createElement("option");
      option.value = location.id;
      option.textContent = location.code ? location.name + " (" + location.code + ")" : location.name;
      batchLocationInput.appendChild(option);
    }
    batchLocationInput.disabled = batchLocationOptions.length === 0;
    renderBatchEnvironmentOptions();
  } catch (error) {
    if (requestId !== batchPlaceOptionsRequestId || !isCurrentWorkspaceRevision(loadRevision, loadOrganizationId)) return;
    console.error("Référentiel des emplacements indisponible :", error);
    initializationWarnings.push("emplacements et environnements");
    batchLocationOptions = [];
    batchEnvironmentOptions = [];
    batchLocationInput.replaceChildren(new Option("Emplacements indisponibles", ""));
    batchEnvironmentInput.replaceChildren(new Option("Environnements indisponibles", ""));
    batchLocationInput.disabled = true;
    batchEnvironmentInput.disabled = true;
  }
}

batchLocationInput?.addEventListener("change", renderBatchEnvironmentOptions);
moveBatchLocationInput?.addEventListener("change", renderMovementEnvironmentOptions);
moveBatchButton?.addEventListener("click", moveSelectedBatch);


/* ============================================================
   MESURES EXPERIMENTALES — MODELE GENERIQUE
   ============================================================ */

async function loadMeasurementReferences() {
  const loadRevision = authStateRevision;
  const [variableResult, unitResult] = await Promise.all([
    supabaseClient.from("variables")
      .select("code, label, dimension, canonical_unit_code, description")
      .order("label"),
    supabaseClient.from("units")
      .select("code, label, dimension")
      .order("code")
  ]);

  if (loadRevision !== authStateRevision) return;
  if (variableResult.error) {
    throw new Error(`Chargement des paramètres de mesure impossible : ${variableResult.error.message}`);
  }
  if (unitResult.error) {
    throw new Error(`Chargement des unités impossible : ${unitResult.error.message}`);
  }

  measurementVariables = variableResult.data || [];
  measurementUnits = unitResult.data || [];

  const visibleVariables = workspaceMeasurementVariables(measurementVariables, document.body.dataset.domain || "mycology");
  measurementVariableSelect.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = visibleVariables.length
    ? "Sélectionner un paramètre…"
    : "Aucun paramètre adapté à cet univers";
  measurementVariableSelect.appendChild(placeholder);

  for (const variable of visibleVariables) {
    const option = document.createElement("option");
    option.value = variable.code;
    option.textContent = `${variable.label} · ${variable.code}`;
    measurementVariableSelect.appendChild(option);
  }

  observationVariableSelect.innerHTML = "";
  const observationPlaceholder = document.createElement("option");
  observationPlaceholder.value = "";
  observationPlaceholder.textContent = visibleVariables.length ? "Sélectionner une catégorie…" : "Aucune catégorie adaptée à cet univers";
  observationVariableSelect.appendChild(observationPlaceholder);
  for (const variable of visibleVariables) {
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
  const domain = document.body.dataset.domain || "mycology";
  const visibleCultures = domain === "agronomy" ? [] : cultureOptions;
  const visiblePlants = domain === "agronomy" ? plantCultureOptions : [];
  const visibleBatches = domain === "laboratory" ? latestBatches : [];
  const hasTargets = visibleCultures.length || visiblePlants.length || visibleBatches.length;
  measurementTargetSelect.replaceChildren();

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = hasTargets
    ? "Choisir une cible de cet univers…"
    : domain === "agronomy"
      ? "Ajoutez d’abord une fiche végétale dans Green Tech"
      : domain === "laboratory"
        ? "Créez d’abord une culture de laboratoire ou un lot"
        : "Créez d’abord une culture mycologique";
  measurementTargetSelect.appendChild(placeholder);

  if (visibleCultures.length) {
    const group = document.createElement("optgroup");
    group.label = domain === "laboratory" ? "Cultures de laboratoire" : "Cultures mycologiques";
    for (const culture of visibleCultures) {
      const option = document.createElement("option");
      option.value = `culture:${culture.id}`;
      option.textContent = `${culture.code} · ${culture.culture_type || "culture"}`;
      group.appendChild(option);
    }
    measurementTargetSelect.appendChild(group);
  }

  if (visiblePlants.length) {
    const group = document.createElement("optgroup");
    group.label = "Unités végétales · Green Tech";
    for (const plant of visiblePlants) {
      const option = document.createElement("option");
      option.value = `plant:${plant.id}`;
      option.textContent = `${plant.code} · ${plant.cultivar_name || plant.crop_type}`;
      group.appendChild(option);
    }
    measurementTargetSelect.appendChild(group);
  }

  if (visibleBatches.length) {
    const group = document.createElement("optgroup");
    group.label = "Lots de laboratoire";
    for (const batch of visibleBatches) {
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
  } else if (visiblePlants.length) {
    measurementTargetSelect.value = `plant:${visiblePlants[0].id}`;
  } else if (visibleCultures.length) {
    measurementTargetSelect.value = `culture:${visibleCultures[0].id}`;
  } else if (visibleBatches.length) {
    measurementTargetSelect.value = `batch:${visibleBatches[0].id}`;
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

function cultureWorkflowText(key) {
  const lang = window.BALabsI18n?.language || "fr";
  const messages = {
    fr: { organization:"Organisation absente. Reconnectez-vous.", target:"Choisissez une culture ou un lot, un paramètre, une valeur numérique et une unité.", incompatible:"L’unité choisie n’est pas compatible avec la dimension du paramètre.", expired:"Votre session a expiré. Reconnectez-vous.", saving:"Enregistrement…", cultureMissing:"La culture sélectionnée n’est plus disponible.", batchMissing:"Le lot sélectionné n’est plus disponible.", eventError:"Création de l’événement de traçabilité impossible : ", invalidTarget:"Cible de mesure invalide.", measureError:"Enregistrement de la mesure impossible : ", measureSaved:"Mesure enregistrée dans Supabase avec sa provenance.", measureRefresh:"La mesure a été enregistrée, mais l’actualisation de l’historique a échoué. Utilisez « Actualiser » pour recharger les données.", measureFailed:"L’enregistrement de la mesure a échoué.", saveMeasure:"Enregistrer la mesure", observationTarget:"Choisissez une cible, une catégorie et décrivez l’observation.", observationInvalid:"Cible d’observation invalide.", observationError:"Enregistrement de l’observation impossible : ", observationSaved:"Observation enregistrée dans Supabase avec sa provenance.", observationRefresh:"L’observation a été enregistrée, mais l’actualisation de l’historique a échoué. Utilisez Actualiser pour recharger les données.", observationFailed:"L’enregistrement de l’observation a échoué.", saveObservation:"Enregistrer l’observation" },
    en: { organization:"Organization missing. Please sign in again.", target:"Choose a culture or batch, a parameter, a numeric value, and a unit.", incompatible:"The selected unit is incompatible with the parameter dimension.", expired:"Your session has expired. Sign in again.", saving:"Saving…", cultureMissing:"The selected culture is no longer available.", batchMissing:"The selected batch is no longer available.", eventError:"Could not create the traceability event: ", invalidTarget:"Invalid measurement target.", measureError:"Could not save the measurement: ", measureSaved:"Measurement saved to Supabase with its provenance.", measureRefresh:"The measurement was saved, but its history could not be refreshed. Use Refresh to reload the data.", measureFailed:"The measurement could not be saved.", saveMeasure:"Save measurement", observationTarget:"Choose a target and category, then describe the observation.", observationInvalid:"Invalid observation target.", observationError:"Could not save the observation: ", observationSaved:"Observation saved to Supabase with its provenance.", observationRefresh:"The observation was saved, but its history could not be refreshed. Use Refresh to reload the data.", observationFailed:"The observation could not be saved.", saveObservation:"Save observation" },
    pt: { organization:"Organização ausente. Inicie sessão novamente.", target:"Escolha uma cultura ou lote, um parâmetro, um valor numérico e uma unidade.", incompatible:"A unidade escolhida não é compatível com a dimensão do parâmetro.", expired:"A sua sessão expirou. Inicie sessão novamente.", saving:"A guardar…", cultureMissing:"A cultura selecionada já não está disponível.", batchMissing:"O lote selecionado já não está disponível.", eventError:"Não foi possível criar o evento de rastreabilidade: ", invalidTarget:"Alvo de medição inválido.", measureError:"Não foi possível guardar a medição: ", measureSaved:"Medição guardada no Supabase com a respetiva proveniência.", measureRefresh:"A medição foi guardada, mas não foi possível atualizar o histórico. Use Atualizar para recarregar os dados.", measureFailed:"Não foi possível guardar a medição.", saveMeasure:"Guardar medição", observationTarget:"Escolha um alvo e uma categoria e descreva a observação.", observationInvalid:"Alvo de observação inválido.", observationError:"Não foi possível guardar a observação: ", observationSaved:"Observação guardada no Supabase com a respetiva proveniência.", observationRefresh:"A observação foi guardada, mas não foi possível atualizar o histórico. Use Atualizar para recarregar os dados.", observationFailed:"Não foi possível guardar a observação.", saveObservation:"Guardar observação" },
    ar: { organization:"المنظمة غير محددة. سجّل الدخول مجددًا.", target:"اختر مزرعة أو دفعة، ومعيارًا، وقيمة رقمية، ووحدة قياس.", incompatible:"وحدة القياس المختارة غير متوافقة مع بُعد المعيار.", expired:"انتهت جلستك. سجّل الدخول مجددًا.", saving:"جارٍ الحفظ…", cultureMissing:"لم تعد المزرعة المحددة متاحة.", batchMissing:"لم تعد الدفعة المحددة متاحة.", eventError:"تعذّر إنشاء حدث التتبّع: ", invalidTarget:"هدف القياس غير صالح.", measureError:"تعذّر حفظ القياس: ", measureSaved:"تم حفظ القياس في Supabase مع مصدره.", measureRefresh:"تم حفظ القياس، لكن تعذّر تحديث السجل. استخدم «تحديث» لإعادة تحميل البيانات.", measureFailed:"تعذّر حفظ القياس.", saveMeasure:"حفظ القياس", observationTarget:"اختر هدفًا وفئة، ثم صِف الملاحظة.", observationInvalid:"هدف الملاحظة غير صالح.", observationError:"تعذّر حفظ الملاحظة: ", observationSaved:"تم حفظ الملاحظة في Supabase مع مصدرها.", observationRefresh:"تم حفظ الملاحظة، لكن تعذّر تحديث السجل. استخدم «تحديث» لإعادة تحميل البيانات.", observationFailed:"تعذّر حفظ الملاحظة.", saveObservation:"حفظ الملاحظة" }
  };
  return (messages[lang] || messages.fr)[key] || messages.fr[key] || key;
}

const pendingManualWriteKeys = new Map();

async function getManualWriteIdempotencyKey(scope, payload) {
  const storageKey = `ba-labs:pending-write:${organizationId}:${scope}`;
  const serialized = JSON.stringify(payload);
  let fingerprint = serialized;
  if (globalThis.crypto?.subtle && globalThis.TextEncoder) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(serialized));
    fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  }

  let stored = pendingManualWriteKeys.get(storageKey);
  try {
    const persisted = JSON.parse(sessionStorage.getItem(storageKey) || "null");
    if (persisted?.fingerprint === fingerprint && persisted?.key) stored = persisted;
  } catch {}

  if (stored?.fingerprint === fingerprint && stored?.key) return stored.key;

  const next = { fingerprint, key: crypto.randomUUID() };
  pendingManualWriteKeys.set(storageKey, next);
  try { sessionStorage.setItem(storageKey, JSON.stringify(next)); } catch {}
  return next.key;
}

function clearManualWriteIdempotencyKey(scope) {
  const storageKey = `ba-labs:pending-write:${organizationId}:${scope}`;
  pendingManualWriteKeys.delete(storageKey);
  try { sessionStorage.removeItem(storageKey); } catch {}
}

async function saveMeasurement() {
  const operationRevision = authStateRevision;
  const operationOrganizationId = organizationId;

  if (!operationOrganizationId) {
    showMessage(cultureWorkflowText("organization"), "error");
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
    showMessage(cultureWorkflowText("target"), "error");
    return;
  }
  if (variable.dimension !== unit.dimension) {
    showMessage(cultureWorkflowText("incompatible"), "error");
    return;
  }

  let session;
  try {
    session = await getCurrentSession();
  } catch (error) {
    if (!isCurrentWorkspaceRevision(operationRevision, operationOrganizationId)) return;
    console.error("Vérification de session avant mesure impossible :", error);
    showMessage("Impossible de vérifier votre session. Vérifiez la connexion puis réessayez. Aucune mesure n’a été enregistrée.", "error");
    return;
  }
  if (!isCurrentWorkspaceRevision(operationRevision, operationOrganizationId)) return;
  if (!session) {
    showMessage(cultureWorkflowText("expired"), "error");
    return;
  }

  saveMeasurementButton.disabled = true;
  saveMeasurementButton.textContent = cultureWorkflowText("saving");
  let measurementSaved = false;

  try {
    let cultureId = null;
    let batchId = null;
    let plantCultureId = null;
    let environmentId = null;
    let locationId = null;
    const [targetType, targetId] = targetValue.split(":");

    if (targetType === "culture") {
      const culture = cultureOptions.find(item => item.id === targetId);
      if (!culture) throw new Error(cultureWorkflowText("cultureMissing"));
      cultureId = culture.id;
    } else if (targetType === "plant") {
      const plant = plantCultureOptions.find(item => item.id === targetId);
      if (!plant) throw new Error("L’unité végétale sélectionnée n’est plus disponible.");
      plantCultureId = plant.id;
      environmentId = plant.environment_id || null;
      locationId = plant.location_id || null;
    } else if (targetType === "batch") {
      const batch = latestBatches.find(item => item.id === targetId);
      if (!batch) throw new Error(cultureWorkflowText("batchMissing"));
      batchId = batch.id;
      cultureId = batch.culture_id || null;

    } else {
      throw new Error(cultureWorkflowText("invalidTarget"));
    }

    const sameAsCanonical = variable.canonical_unit_code === unit.code;
    const eventPayload = {
      organization_id: operationOrganizationId,
      event_type: "measurement_recorded",
      occurred_at: measuredAt,
      actor_user_id: session.user.id,
      culture_id: cultureId,
      plant_culture_id: plantCultureId,
      environment_id: environmentId,
      location_id: locationId,
      batch_id: batchId,
      payload: {
        variable_code: variable.code,
        raw_value: rawValue,
        raw_unit_code: unit.code,
        method: measurementMethodInput.value.trim() || null,
        instrument: measurementInstrumentInput.value.trim() || null,
        note: measurementNoteInput.value.trim() || null,
        source: targetType === "plant" ? "agritech-manual" : "batch-tracker-manual"
      }
    };
    const measurementPayload = {
      organization_id: operationOrganizationId,
      variable_code: variable.code,
      raw_value: rawValue,
      raw_unit_code: unit.code,
      normalized_value: sameAsCanonical ? rawValue : null,
      normalized_unit_code: sameAsCanonical ? unit.code : null,
      measured_at: measuredAt,
      method: measurementMethodInput.value.trim() || null,
      instrument: measurementInstrumentInput.value.trim() || null,
      culture_id: cultureId,
      plant_culture_id: plantCultureId,
      environment_id: environmentId,
      metadata: {
        source: "batch-tracker-manual",
        note: measurementNoteInput.value.trim() || null,
        target_type: targetType,
        batch_id: batchId
      }
    };
    if (!isCurrentWorkspaceRevision(operationRevision, operationOrganizationId)) throw new Error("Session ou espace de travail modifié pendant l’opération. Recommencez.");
    const idempotencyKey = await getManualWriteIdempotencyKey("measurement", { event: eventPayload, measurement: measurementPayload });
    const { error: recordError } = await supabaseClient.rpc("record_manual_measurement", {
      p_event: eventPayload,
      p_measurement: measurementPayload,
      p_idempotency_key: idempotencyKey
    });
    if (recordError) throw new Error(cultureWorkflowText("measureError") + recordError.message);
    clearManualWriteIdempotencyKey("measurement");
    measurementSaved = true;
    if (!isCurrentWorkspaceRevision(operationRevision, operationOrganizationId)) return;

    measurementValueInput.value = "";
    measurementInstrumentInput.value = "";
    measurementMethodInput.value = "";
    measurementNoteInput.value = "";

    showMessage(cultureWorkflowText("measureSaved"), "success");
    await loadRecentMeasurements();
  } catch (error) {
    if (!isCurrentWorkspaceRevision(operationRevision, operationOrganizationId)) return;
    console.error("Enregistrement mesure :", error);
    if (measurementSaved) {
      showMessage(cultureWorkflowText("measureRefresh"), "warning");
    } else {
      showMessage(error.message || cultureWorkflowText("measureFailed"), "error");
    }
  } finally {
    if (isCurrentWorkspaceRevision(operationRevision, operationOrganizationId)) {
      saveMeasurementButton.disabled = false;
      saveMeasurementButton.textContent = cultureWorkflowText("saveMeasure");
    }
  }
}

function belongsToActiveWorkspace(record, eventsById = {}) {
  const domain = document.body.dataset.domain || "mycology";
  const event = record.event_id ? eventsById[record.event_id] : null;
  const cultureId = record.culture_id || event?.culture_id;
  const plantId = record.plant_culture_id || event?.plant_culture_id;
  const batchId = event?.batch_id;
  if (domain === "agronomy") {
    return Boolean(plantId && plantCultureOptions.some(plant => plant.id === plantId));
  }
  if (domain === "mycology") {
    return Boolean(cultureId && cultureOptions.some(culture => culture.id === cultureId));
  }
  return Boolean(
    (cultureId && cultureOptions.some(culture => culture.id === cultureId)) ||
    (batchId && latestBatches.some(batch => batch.id === batchId))
  );
}

async function loadRecentMeasurements() {
  const requestId = ++measurementHistoryRequestId;
  const loadRevision = authStateRevision;
  const loadOrganizationId = organizationId;
  if (!loadOrganizationId || !measurementHistory) return;

  const { data, error } = await supabaseClient
    .from("measurements")
    .select("id, variable_code, raw_value, raw_unit_code, normalized_value, normalized_unit_code, measured_at, method, instrument, culture_id, plant_culture_id, event_id, metadata")
    .eq("organization_id", loadOrganizationId)
    .order("measured_at", { ascending: false })
    .limit(1000);

  if (requestId !== measurementHistoryRequestId || !isCurrentWorkspaceRevision(loadRevision, loadOrganizationId)) return;
  if (error) throw new Error(`Chargement de l’historique des mesures impossible : ${error.message}`);

  const rows = data || [];
  const eventIds = [...new Set(rows.map(row => row.event_id).filter(Boolean))];
  let eventsById = {};
  if (eventIds.length) {
    const { data: events, error: eventsError } = await supabaseClient
      .from("events")
      .select("id, batch_id, culture_id, plant_culture_id")
      .eq("organization_id", loadOrganizationId)
      .in("id", eventIds);
    if (requestId !== measurementHistoryRequestId || !isCurrentWorkspaceRevision(loadRevision, loadOrganizationId)) return;
    if (eventsError) console.warn("Détails des événements de mesure indisponibles :", eventsError.message);
    for (const event of events || []) eventsById[event.id] = event;
  }

  if (requestId !== measurementHistoryRequestId || !isCurrentWorkspaceRevision(loadRevision, loadOrganizationId)) return;
  const visibleRows = rows.filter(row => belongsToActiveWorkspace(row, eventsById)).slice(0, 10);
  if (!visibleRows.length) {
    measurementHistory.innerHTML = '<p class="muted">Aucune mesure enregistrée dans cet univers pour le moment.</p>';
    return;
  }

  measurementHistory.innerHTML = visibleRows.map(row => {
    const variable = measurementVariables.find(item => item.code === row.variable_code);
    const culture = cultureOptions.find(item => item.id === row.culture_id);
    const batchId = row.event_id ? eventsById[row.event_id]?.batch_id : null;
    const batch = batchId ? latestBatches.find(item => item.id === batchId) : null;
    const plant = plantCultureOptions.find(item => item.id === row.plant_culture_id);
    const target = plant
      ? `AgriTech · ${escapeHtml(plant.code)} · ${escapeHtml(plant.cultivar_name || plant.crop_type)}`
      : batch
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
  const operationRevision = authStateRevision;
  const operationOrganizationId = organizationId;

  if (!operationOrganizationId) {
    showMessage(cultureWorkflowText("organization"), "error");
    return;
  }

  const targetValue = measurementTargetSelect.value;
  const variable = measurementVariables.find(item => item.code === observationVariableSelect.value);
  const valueText = observationValueInput.value.trim();
  const observedAt = observationAtInput.value ? new Date(observationAtInput.value).toISOString() : new Date().toISOString();

  if (!targetValue || !variable || !valueText) {
    showMessage(cultureWorkflowText("observationTarget"), "error");
    return;
  }

  let session;
  try {
    session = await getCurrentSession();
  } catch (error) {
    if (!isCurrentWorkspaceRevision(operationRevision, operationOrganizationId)) return;
    console.error("Vérification de session avant observation impossible :", error);
    showMessage("Impossible de vérifier votre session. Vérifiez la connexion puis réessayez. Aucune observation n’a été enregistrée.", "error");
    return;
  }
  if (!isCurrentWorkspaceRevision(operationRevision, operationOrganizationId)) return;
  if (!session) {
    showMessage(cultureWorkflowText("expired"), "error");
    return;
  }

  saveObservationButton.disabled = true;
  saveObservationButton.textContent = cultureWorkflowText("saving");
  let observationSaved = false;

  try {
    let cultureId = null;
    let batchId = null;
    let plantCultureId = null;
    let environmentId = null;
    let locationId = null;
    const parts = targetValue.split(":");
    const targetType = parts[0];
    const targetId = parts[1];

    if (targetType === "culture") {
      const culture = cultureOptions.find(item => item.id === targetId);
      if (!culture) throw new Error(cultureWorkflowText("cultureMissing"));
      cultureId = culture.id;
    } else if (targetType === "plant") {
      const plant = plantCultureOptions.find(item => item.id === targetId);
      if (!plant) throw new Error("L’unité végétale sélectionnée n’est plus disponible.");
      plantCultureId = plant.id;
      environmentId = plant.environment_id || null;
      locationId = plant.location_id || null;
    } else if (targetType === "batch") {
      const batch = latestBatches.find(item => item.id === targetId);
      if (!batch) throw new Error(cultureWorkflowText("batchMissing"));
      batchId = batch.id;
      cultureId = batch.culture_id || null;

    } else {
      throw new Error(cultureWorkflowText("observationInvalid"));
    }

    const eventPayload = {
      organization_id: operationOrganizationId,
      event_type: "observation_recorded",
      occurred_at: observedAt,
      actor_user_id: session.user.id,
      culture_id: cultureId,
      plant_culture_id: plantCultureId,
      environment_id: environmentId,
      location_id: locationId,
      batch_id: batchId,
      payload: {
        variable_code: variable.code,
        value_text: valueText,
        method: observationMethodInput.value.trim() || null,
        instrument: observationInstrumentInput.value.trim() || null,
        note: observationNoteInput.value.trim() || null,
        source: targetType === "plant" ? "agritech-manual" : "batch-tracker-manual"
      }
    };
    const observationPayload = {
      organization_id: operationOrganizationId,
      variable_code: variable.code,
      value_text: valueText,
      observed_at: observedAt,
      culture_id: cultureId,
      plant_culture_id: plantCultureId,
      metadata: {
        source: "batch-tracker-manual",
        method: observationMethodInput.value.trim() || null,
        instrument: observationInstrumentInput.value.trim() || null,
        note: observationNoteInput.value.trim() || null,
        target_type: targetType,
        batch_id: batchId
      }
    };
    if (!isCurrentWorkspaceRevision(operationRevision, operationOrganizationId)) throw new Error("Session ou espace de travail modifié pendant l’opération. Recommencez.");
    const idempotencyKey = await getManualWriteIdempotencyKey("observation", { event: eventPayload, observation: observationPayload });
    const { error: recordError } = await supabaseClient.rpc("record_manual_observation", {
      p_event: eventPayload,
      p_observation: observationPayload,
      p_idempotency_key: idempotencyKey
    });
    if (recordError) throw new Error(cultureWorkflowText("observationError") + recordError.message);
    clearManualWriteIdempotencyKey("observation");
    observationSaved = true;
    if (!isCurrentWorkspaceRevision(operationRevision, operationOrganizationId)) return;
    observationValueInput.value = "";
    observationMethodInput.value = "";
    observationInstrumentInput.value = "";
    observationNoteInput.value = "";
    showMessage(cultureWorkflowText("observationSaved"), "success");
    await loadRecentObservations();
  } catch (error) {
    if (!isCurrentWorkspaceRevision(operationRevision, operationOrganizationId)) return;
    console.error("Enregistrement observation :", error);
    if (observationSaved) {
      showMessage(cultureWorkflowText("observationRefresh"), "warning");
    } else {
      showMessage(error.message || cultureWorkflowText("observationFailed"), "error");
    }
  } finally {
    if (isCurrentWorkspaceRevision(operationRevision, operationOrganizationId)) {
      saveObservationButton.disabled = false;
      saveObservationButton.textContent = cultureWorkflowText("saveObservation");
    }
  }
}

async function loadRecentObservations() {
  const requestId = ++observationHistoryRequestId;
  const loadRevision = authStateRevision;
  const loadOrganizationId = organizationId;
  if (!loadOrganizationId || !observationHistory) return;

  const query = await supabaseClient.from("observations")
    .select("id, variable_code, value_text, observed_at, culture_id, plant_culture_id, event_id, metadata")
    .eq("organization_id", loadOrganizationId)
    .order("observed_at", { ascending: false })
    .limit(1000);

  if (requestId !== observationHistoryRequestId || !isCurrentWorkspaceRevision(loadRevision, loadOrganizationId)) return;
  if (query.error) throw new Error("Chargement de l’historique des observations impossible : " + query.error.message);
  const observationRows = query.data || [];
  const eventIds = [...new Set(observationRows.map(row => row.event_id).filter(Boolean))];
  const eventsById = {};

  if (eventIds.length) {
    const eventsResult = await supabaseClient.from("events")
      .select("id, batch_id, culture_id, plant_culture_id")
      .eq("organization_id", loadOrganizationId)
      .in("id", eventIds);
    if (requestId !== observationHistoryRequestId || !isCurrentWorkspaceRevision(loadRevision, loadOrganizationId)) return;
    if (eventsResult.error) console.warn("Détails des événements d’observation indisponibles :", eventsResult.error.message);
    for (const event of eventsResult.data || []) eventsById[event.id] = event;
  }

  if (requestId !== observationHistoryRequestId || !isCurrentWorkspaceRevision(loadRevision, loadOrganizationId)) return;
  recentObservations = observationRows.filter(row => belongsToActiveWorkspace(row, eventsById)).slice(0, 8);
  updateOverview();
  if (!recentObservations.length) {
    observationHistory.innerHTML = '<p class="muted">Aucune observation enregistrée dans cet univers pour le moment.</p>';
    return;
  }

  observationHistory.innerHTML = recentObservations.map(row => {
    const variable = measurementVariables.find(item => item.code === row.variable_code);
    const culture = cultureOptions.find(item => item.id === row.culture_id);
    const batchId = row.event_id ? (eventsById[row.event_id] || {}).batch_id : null;
    const batch = batchId ? latestBatches.find(item => item.id === batchId) : null;
    const plant = plantCultureOptions.find(item => item.id === row.plant_culture_id);
    const target = plant ? "AgriTech · " + escapeHtml(plant.code) + " · " + escapeHtml(plant.cultivar_name || plant.crop_type) :
      batch ? "Lot · " + escapeHtml(batch.batch_code) :
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
  const domain = document.body.dataset.domain || "mycology";
  const visibleVariables = workspaceMeasurementVariables(measurementVariables, domain);
  const visibleTargets = domain === "agronomy" ? plantCultureOptions : cultureOptions;
  const previousVariable = variableSelect.value;
  const previousCulture = cultureSelect.value;
  const previousBatch = batchSelect.value;

  variableSelect.replaceChildren();
  const variablePlaceholder = document.createElement("option");
  variablePlaceholder.value = "";
  variablePlaceholder.textContent = visibleVariables.length ? "Sélectionner une variable…" : "Aucune variable adaptée à cet univers";
  variableSelect.appendChild(variablePlaceholder);
  visibleVariables.forEach(variable => {
    const option = document.createElement("option");
    option.value = variable.code;
    option.textContent = variable.label + " · " + variable.code;
    variableSelect.appendChild(option);
  });
  if (visibleVariables.some(variable => variable.code === previousVariable)) variableSelect.value = previousVariable;

  const targetLabel = document.querySelector('label[for="statisticsCulture"]');
  if (targetLabel) targetLabel.textContent = domain === "agronomy" ? "Unité végétale" : domain === "laboratory" ? "Culture de laboratoire" : "Culture mycologique";
  cultureSelect.replaceChildren();
  const targetPlaceholder = document.createElement("option");
  targetPlaceholder.value = "";
  targetPlaceholder.textContent = domain === "agronomy" ? "Toutes les unités végétales" : domain === "laboratory" ? "Toutes les cultures de laboratoire" : "Toutes les cultures mycologiques";
  cultureSelect.appendChild(targetPlaceholder);
  visibleTargets.forEach(target => {
    const option = document.createElement("option");
    option.value = target.id;
    option.textContent = domain === "agronomy"
      ? (target.code || "Unité sans code") + " · " + (target.cultivar_name || target.crop_type || "")
      : target.code || "Culture sans code";
    cultureSelect.appendChild(option);
  });
  if (visibleTargets.some(target => target.id === previousCulture)) cultureSelect.value = previousCulture;

  const batchField = batchSelect.closest("div");
  if (batchField) batchField.hidden = domain !== "laboratory";
  batchSelect.disabled = domain !== "laboratory";
  batchSelect.replaceChildren();
  const batchPlaceholder = document.createElement("option");
  batchPlaceholder.value = "";
  batchPlaceholder.textContent = "Tous les lots récents (30 max.)";
  batchSelect.appendChild(batchPlaceholder);
  if (domain === "laboratory") {
    latestBatches.forEach(batch => {
      const option = document.createElement("option");
      option.value = batch.id;
      option.textContent = (batch.batch_code || "Lot sans code") + (batch.name ? " · " + batch.name : "");
      batchSelect.appendChild(option);
    });
    if (latestBatches.some(batch => batch.id === previousBatch)) batchSelect.value = previousBatch;
  }
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
      : document.body.dataset.domain === "laboratory"
        ? "Aucune fiche classée Laboratoire. Les fiches historiques non classées restent en Mycologie ; créez ici les cultures suivies spécifiquement au laboratoire."
        : "Aucune culture mycologique chargée. Créez une culture avec le formulaire ci-dessus.";
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

function getStatisticsTranslations(language) {
  const translations = {
    fr: { login:"Connectez-vous pour analyser les données de votre organisation.", variable:"Sélectionnez une variable mesurée.", loading:"Chargement des mesures depuis Supabase…", loadingData:"Chargement des données…", buttonLoading:"Chargement…", buttonAnalyze:"Analyser les données", loadedMeasurements:"Mesures chargées", numericValues:"Valeurs numériques", comparableValues:"Valeurs comparables", capped:"Au moins 1 000 mesures correspondent aux filtres. Le résultat peut être tronqué ; réduisez la période ou sélectionnez une culture.", excluded:n=>n+" valeur(s) exclue(s) du graphique car l’unité n’est pas comparable. ", loaded:"Données chargées depuis Supabase. Les résultats sont descriptifs.", empty:"Aucune mesure ne correspond aux filtres sélectionnés.", needTwo:"Il faut au moins deux mesures numériques comparables pour tracer une évolution. Les données brutes restent consultables ci-dessous.", unknownDate:"Date inconnue", measurementDate:"Date de mesure", unknownUnit:"unité inconnue", period:"Période représentée : ", noRows:"Aucune mesure pour ces filtres.", limited:n=>"Affichage limité aux 200 mesures les plus récentes sur "+n+" chargées.", graphError:"Le graphique n’a pas pu être produit.", unavailable:"Données indisponibles.", loadError:"Impossible de charger les mesures : ", cultureLinked:"Culture liée par identifiant", noCulture:"Lot / cible sans culture directe", unitMissing:"Unité non renseignée" },
    en: { login:"Sign in to analyze your organization's data.", variable:"Select a measured variable.", loading:"Loading measurements from Supabase…", loadingData:"Loading data…", buttonLoading:"Loading…", buttonAnalyze:"Analyze data", loadedMeasurements:"Measurements loaded", numericValues:"Numeric values", comparableValues:"Comparable values", capped:"At least 1,000 measurements match the filters. Results may be truncated; narrow the period or select a culture.", excluded:n=>n+" value(s) excluded from the chart because the unit is not comparable. ", loaded:"Data loaded from Supabase. Results are descriptive.", empty:"No measurements match the selected filters.", needTwo:"At least two comparable numeric measurements are needed to plot a trend. Raw data remain available below.", unknownDate:"Unknown date", measurementDate:"Measurement date", unknownUnit:"unknown unit", period:"Period shown: ", noRows:"No measurements for these filters.", limited:n=>"Showing the 200 most recent measurements out of "+n+" loaded.", graphError:"The chart could not be generated.", unavailable:"Data unavailable.", loadError:"Unable to load measurements: ", cultureLinked:"Culture linked by ID", noCulture:"Batch / target without direct culture", unitMissing:"Unit not specified" },
    pt: { login:"Inicie sessão para analisar os dados da sua organização.", variable:"Selecione uma variável medida.", loading:"A carregar medições do Supabase…", loadingData:"A carregar dados…", buttonLoading:"A carregar…", buttonAnalyze:"Analisar dados", loadedMeasurements:"Medições carregadas", numericValues:"Valores numéricos", comparableValues:"Valores comparáveis", capped:"Pelo menos 1.000 medições correspondem aos filtros. Os resultados podem estar truncados; reduza o período ou selecione uma cultura.", excluded:n=>n+" valor(es) excluído(s) do gráfico porque a unidade não é comparável. ", loaded:"Dados carregados do Supabase. Os resultados são descritivos.", empty:"Nenhuma medição corresponde aos filtros selecionados.", needTwo:"São necessárias pelo menos duas medições numéricas comparáveis para traçar uma evolução. Os dados brutos continuam disponíveis abaixo.", unknownDate:"Data desconhecida", measurementDate:"Data da medição", unknownUnit:"unidade desconhecida", period:"Período apresentado: ", noRows:"Nenhuma medição para estes filtros.", limited:n=>"A mostrar as 200 medições mais recentes de "+n+" carregadas.", graphError:"Não foi possível gerar o gráfico.", unavailable:"Dados indisponíveis.", loadError:"Não foi possível carregar as medições: ", cultureLinked:"Cultura associada por identificador", noCulture:"Lote / alvo sem cultura direta", unitMissing:"Unidade não indicada" },
    ar: { login:"سجّل الدخول لتحليل بيانات مؤسستك.", variable:"اختر متغيرًا مقاسًا.", loading:"جارٍ تحميل القياسات من Supabase…", loadingData:"جارٍ تحميل البيانات…", buttonLoading:"جارٍ التحميل…", buttonAnalyze:"تحليل البيانات", loadedMeasurements:"القياسات المحمّلة", numericValues:"القيم الرقمية", comparableValues:"القيم القابلة للمقارنة", capped:"تطابق ١٬٠٠٠ قياس على الأقل عوامل التصفية. قد تكون النتائج مقتطعة؛ قلّص الفترة أو اختر مزرعة.", excluded:n=>n+" قيمة مستبعدة من الرسم لأن الوحدة غير قابلة للمقارنة. ", loaded:"تم تحميل البيانات من Supabase. النتائج وصفية.", empty:"لا توجد قياسات تطابق عوامل التصفية المحددة.", needTwo:"يلزم قياسان رقميان قابلان للمقارنة على الأقل لرسم الاتجاه. تبقى البيانات الخام متاحة أدناه.", unknownDate:"تاريخ غير معروف", measurementDate:"تاريخ القياس", unknownUnit:"وحدة غير معروفة", period:"الفترة المعروضة: ", noRows:"لا توجد قياسات لهذه العوامل.", limited:n=>"يقتصر العرض على أحدث ٢٠٠ قياس من أصل "+n+" قياسًا محمّلًا.", graphError:"تعذر إنشاء الرسم البياني.", unavailable:"البيانات غير متاحة.", loadError:"تعذر تحميل القياسات: ", cultureLinked:"مزرعة مرتبطة بالمعرّف", noCulture:"دفعة / هدف دون مزرعة مباشرة", unitMissing:"الوحدة غير محددة" }
  };
  return translations[language] || translations.fr;
}

let statisticsRequestId = 0;

async function loadStatistics() {
  const requestId = ++statisticsRequestId;
  const loadRevision = authStateRevision;
  const loadOrganizationId = organizationId;
  const variableCode = document.getElementById("statisticsVariable").value;
  const domain = document.body.dataset.domain || "mycology";
  const selectedTargetId = document.getElementById("statisticsCulture").value;
  const cultureId = domain === "agronomy" ? "" : selectedTargetId;
  const plantCultureId = domain === "agronomy" ? selectedTargetId : "";
  const batchId = domain === "laboratory" ? document.getElementById("statisticsBatch").value : "";
  const period = document.getElementById("statisticsPeriod").value;
  const status = document.getElementById("statisticsStatus");
  const chart = document.getElementById("statisticsChart");
  const summary = document.getElementById("statisticsSummary");
  const tbody = document.getElementById("statisticsRows");
  const lang = window.BALabsI18n?.language || "fr";
  const L = getStatisticsTranslations(lang);
  if (!loadOrganizationId) { status.textContent = L.login; return; }
  if (!variableCode) { status.textContent = L.variable; return; }
  const button = document.getElementById("loadStatisticsButton");
  button.disabled = true; button.textContent = L.buttonLoading;
  status.textContent = L.loading; chart.innerHTML = '<p class="muted">' + L.loadingData + '</p>'; summary.innerHTML = ""; tbody.innerHTML = "";
  try {
    let batchEventIds = null;
    let cultureEventIds = null;
    let noMatchingCultureBatchEvents = false;
    let noWorkspaceTargets = false;
    if (batchId) {
      const {data: batchEvents, error: batchEventsError} = await supabaseClient.from("events").select("id").eq("organization_id", loadOrganizationId).eq("batch_id", batchId);
      if (batchEventsError) throw new Error("Chargement des événements du lot impossible : " + batchEventsError.message);
      if (requestId !== statisticsRequestId || !isCurrentWorkspaceRevision(loadRevision, loadOrganizationId) || domain !== (document.body.dataset.domain || "mycology")) return;
      batchEventIds = (batchEvents || []).map(event => event.id);
    }
    if (cultureId) {
      const {data: cultureBatches, error: cultureBatchesError} = await supabaseClient.from("batches").select("id").eq("organization_id", loadOrganizationId).eq("culture_id", cultureId).order("created_at", {ascending:false}).limit(1000);
      if (cultureBatchesError) throw new Error("Chargement des lots liés à la culture impossible : " + cultureBatchesError.message);
      if (requestId !== statisticsRequestId || !isCurrentWorkspaceRevision(loadRevision, loadOrganizationId) || domain !== (document.body.dataset.domain || "mycology")) return;
      const cultureBatchIds = (cultureBatches || []).map(batch => batch.id);
      const cultureEventQueries = [
        supabaseClient.from("events").select("id").eq("organization_id", loadOrganizationId).eq("culture_id", cultureId)
      ];
      if (cultureBatchIds.length) {
        cultureEventQueries.push(supabaseClient.from("events").select("id").eq("organization_id", loadOrganizationId).in("batch_id", cultureBatchIds));
      }
      const cultureEventResults = await Promise.all(cultureEventQueries);
      if (requestId !== statisticsRequestId || !isCurrentWorkspaceRevision(loadRevision, loadOrganizationId) || domain !== (document.body.dataset.domain || "mycology")) return;
      for (const result of cultureEventResults) {
        if (result.error) throw new Error("Chargement des événements liés à la culture impossible : " + result.error.message);
      }
      cultureEventIds = [...new Set(cultureEventResults.flatMap(result => (result.data || []).map(event => event.id)))];
    }
    let query = supabaseClient.from("measurements").select("id, variable_code, raw_value, raw_unit_code, normalized_value, normalized_unit_code, measured_at, method, culture_id, plant_culture_id, event_id, metadata").eq("organization_id", loadOrganizationId).eq("variable_code", variableCode).order("measured_at", {ascending:false}).limit(1000);
    if (plantCultureId) {
      query = query.eq("plant_culture_id", plantCultureId);
    } else if (cultureId && batchId) {
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
    if (!plantCultureId && !cultureId && !batchId) {
      if (domain === "agronomy") {
        const plantIds = plantCultureOptions.map(plant => plant.id);
        if (plantIds.length) query = query.in("plant_culture_id", plantIds);
        else noWorkspaceTargets = true;
      } else {
        const cultureIds = cultureOptions.map(culture => culture.id);
        const batchIds = domain === "laboratory" ? latestBatches.map(batch => batch.id) : [];
        const eventQueries = [];
        if (cultureIds.length) eventQueries.push(supabaseClient.from("events").select("id").eq("organization_id", loadOrganizationId).in("culture_id", cultureIds));
        if (batchIds.length) eventQueries.push(supabaseClient.from("events").select("id").eq("organization_id", loadOrganizationId).in("batch_id", batchIds));
        const eventResults = await Promise.all(eventQueries);
        if (requestId !== statisticsRequestId || !isCurrentWorkspaceRevision(loadRevision, loadOrganizationId) || domain !== (document.body.dataset.domain || "mycology")) return;
        for (const result of eventResults) {
          if (result.error) throw new Error("Chargement du périmètre des statistiques impossible : " + result.error.message);
        }
        const workspaceEventIds = [...new Set(eventResults.flatMap(result => (result.data || []).map(event => event.id)))];
        const scopeClauses = [];
        if (cultureIds.length) scopeClauses.push("culture_id.in.(" + cultureIds.join(",") + ")");
        if (workspaceEventIds.length) scopeClauses.push("event_id.in.(" + workspaceEventIds.join(",") + ")");
        if (scopeClauses.length) query = query.or(scopeClauses.join(","));
        else noWorkspaceTargets = true;
      }
    }
    if (period !== "all") { const since = new Date(); since.setDate(since.getDate() - Number(period)); query = query.gte("measured_at", since.toISOString()); }
    const queryResult = noWorkspaceTargets || (batchId && !batchEventIds.length) || (cultureId && !cultureEventIds.length && batchId) || noMatchingCultureBatchEvents ? {data:[],error:null} : await query;
    if (requestId !== statisticsRequestId || !isCurrentWorkspaceRevision(loadRevision, loadOrganizationId) || domain !== (document.body.dataset.domain || "mycology")) return;
    const {data,error} = queryResult; if (error) throw new Error(error.message);
    const rows = (data || []).slice().sort((a,b) => new Date(a.measured_at || 0).getTime() - new Date(b.measured_at || 0).getTime()), variable = measurementVariables.find(item => item.code === variableCode), cultureById = new Map(cultureOptions.map(culture => [culture.id,culture]));
    const prepared = rows.map(row => { const normalized = row.normalized_value !== null && row.normalized_value !== undefined && row.normalized_value !== "" && row.normalized_unit_code; const raw = normalized ? row.normalized_value : row.raw_value; const hasValue = raw !== null && raw !== undefined && raw !== "" && typeof raw !== "boolean"; return {...row, plotValue:hasValue ? Number(raw) : NaN, plotUnit:normalized ? row.normalized_unit_code : row.raw_unit_code, normalized:Boolean(normalized)}; }).filter(row => Number.isFinite(row.plotValue));
    const canonical = variable?.canonical_unit_code;
    const plotted = canonical ? prepared.filter(row => row.plotUnit === canonical) : (prepared[0]?.plotUnit ? prepared.filter(row => row.plotUnit === prepared[0].plotUnit) : []);
    const excluded = prepared.length - plotted.length;
    const addSummary = (label,value) => { const item=document.createElement("div"); item.className="statistics-summary-item"; const name=document.createElement("span"); name.textContent=label; const number=document.createElement("strong"); number.textContent=value; item.append(name,number); summary.appendChild(item); };
    addSummary(L.loadedMeasurements,String(rows.length)); addSummary(L.numericValues,String(prepared.length)); addSummary(L.comparableValues,String(plotted.length));
    status.textContent = rows.length >= 1000 ? L.capped : rows.length ? (excluded ? L.excluded(excluded) : "") + L.loaded : L.empty;
    chart.innerHTML = "";
    if (plotted.length < 2) {
      const demoSets = {
        agronomy: { title: "GreenTech · suivi végétal illustratif", metric: "Humidité relative", unit: "%", values: [61, 64, 60, 68, 66, 71, 69], stroke: "#65b982" },
        mycology: { title: "Mycologie · incubation illustrative", metric: "Température d’incubation", unit: "°C", values: [21.2, 21.8, 22.1, 21.7, 22.4, 22.0, 21.9], stroke: "#d78b56" },
        laboratory: { title: "Laboratoire · mesures illustratives", metric: "pH", unit: "pH", values: [6.2, 6.4, 6.35, 6.5, 6.45, 6.6, 6.55], stroke: "#69a9e0" }
      };
      const demo = demoSets[domain] || demoSets.laboratory;
      const width=760,height=290,left=64,right=22,top=40,bottom=48,values=demo.values,min=Math.min(...values),max=Math.max(...values),span=max-min||1;
      const x=i=>left+i*(width-left-right)/(values.length-1), y=value=>top+20+(max-value)*(height-top-bottom-20)/span, ns="http://www.w3.org/2000/svg", svg=document.createElementNS(ns,"svg");
      svg.setAttribute("viewBox","0 0 "+width+" "+height); svg.setAttribute("role","img"); svg.setAttribute("aria-label",demo.title+" — "+demo.metric); svg.classList.add("statistics-demo-svg");
      const title=document.createElementNS(ns,"text"); title.setAttribute("x",left); title.setAttribute("y",20); title.setAttribute("font-size","14"); title.setAttribute("font-weight","700"); title.setAttribute("fill","currentColor"); title.textContent=demo.title; svg.appendChild(title);
      for(let tick=0;tick<5;tick++){const value=min+span*tick/4,yy=y(value),line=document.createElementNS(ns,"line");line.setAttribute("x1",left);line.setAttribute("x2",width-right);line.setAttribute("y1",yy);line.setAttribute("y2",yy);line.setAttribute("stroke","currentColor");line.setAttribute("stroke-opacity",".16");svg.appendChild(line);const label=document.createElementNS(ns,"text");label.setAttribute("x",left-9);label.setAttribute("y",yy+4);label.setAttribute("text-anchor","end");label.setAttribute("font-size","11");label.setAttribute("fill","currentColor");label.textContent=Number(value.toPrecision(3)).toString();svg.appendChild(label);}
      const polyline=document.createElementNS(ns,"polyline");polyline.setAttribute("points",values.map((value,i)=>x(i)+","+y(value)).join(" "));polyline.setAttribute("fill","none");polyline.setAttribute("stroke",demo.stroke);polyline.setAttribute("stroke-width","3");polyline.setAttribute("stroke-linecap","round");polyline.setAttribute("stroke-linejoin","round");svg.appendChild(polyline);
      values.forEach((value,i)=>{const circle=document.createElementNS(ns,"circle");circle.setAttribute("cx",x(i));circle.setAttribute("cy",y(value));circle.setAttribute("r","4");circle.setAttribute("fill",demo.stroke);const pointTitle=document.createElementNS(ns,"title");pointTitle.textContent="Point illustratif "+(i+1)+": "+value+" "+demo.unit;circle.appendChild(pointTitle);svg.appendChild(circle);});
      const axis=document.createElementNS(ns,"text");axis.setAttribute("x",(left+width-right)/2);axis.setAttribute("y",height-10);axis.setAttribute("text-anchor","middle");axis.setAttribute("font-size","11");axis.setAttribute("fill","currentColor");axis.textContent="Séquence illustrative";svg.appendChild(axis);
      chart.appendChild(svg);
      const note=document.createElement("p");note.className="statistics-demo-note";note.textContent="DONNÉES DE DÉMONSTRATION — exemple synthétique uniquement. Non mesuré, non enregistré et jamais mélangé aux données de l’organisation.";chart.appendChild(note);
      const explanation=document.createElement("p");explanation.className="muted";explanation.textContent=L.needTwo;chart.appendChild(explanation);
    } else {
      const width=760,height=270,left=64,right=20,top=22,bottom=50,values=plotted.map(row=>row.plotValue),min=Math.min(...values),max=Math.max(...values),span=max-min||Math.max(Math.abs(max)*.1,1);
      const x=i=>left+i*(width-left-right)/(plotted.length-1), y=value=>top+(max-value)*(height-top-bottom)/span, ns="http://www.w3.org/2000/svg", svg=document.createElementNS(ns,"svg");
      svg.setAttribute("viewBox","0 0 "+width+" "+height); svg.setAttribute("role","img"); svg.setAttribute("aria-label","Évolution de "+(variable?.label||variableCode)+", unité "+(canonical||plotted[0].plotUnit||"non renseignée"));
      for(let tick=0;tick<5;tick++){const value=min+(max-min)*tick/4,yy=y(value),line=document.createElementNS(ns,"line");line.setAttribute("x1",left);line.setAttribute("x2",width-right);line.setAttribute("y1",yy);line.setAttribute("y2",yy);line.setAttribute("stroke","#e5ebe1");svg.appendChild(line);const label=document.createElementNS(ns,"text");label.setAttribute("x",left-9);label.setAttribute("y",yy+4);label.setAttribute("text-anchor","end");label.setAttribute("font-size","11");label.setAttribute("fill","#657267");label.textContent=Number(value.toPrecision(4)).toString();svg.appendChild(label);}
      const polyline=document.createElementNS(ns,"polyline");polyline.setAttribute("points",plotted.map((row,i)=>x(i)+","+y(row.plotValue)).join(" "));polyline.setAttribute("fill","none");polyline.setAttribute("stroke","#47764d");polyline.setAttribute("stroke-width","2.5");polyline.setAttribute("stroke-linejoin","round");svg.appendChild(polyline);
      plotted.forEach((row,i)=>{const circle=document.createElementNS(ns,"circle");circle.setAttribute("cx",x(i));circle.setAttribute("cy",y(row.plotValue));circle.setAttribute("r","3.5");circle.setAttribute("fill","#47764d");const title=document.createElementNS(ns,"title");title.textContent=(row.measured_at?new Date(row.measured_at).toLocaleString("fr-FR"):L.unknownDate)+": "+row.plotValue+" "+(row.plotUnit||"");circle.appendChild(title);svg.appendChild(circle);});
      const xl=document.createElementNS(ns,"text");xl.setAttribute("x",(left+width-right)/2);xl.setAttribute("y",height-10);xl.setAttribute("text-anchor","middle");xl.setAttribute("font-size","11");xl.setAttribute("fill","#4f6252");xl.textContent=L.measurementDate;svg.appendChild(xl);
      const yl=document.createElementNS(ns,"text");yl.setAttribute("transform","translate(15 "+((top+height-bottom)/2)+") rotate(-90)");yl.setAttribute("text-anchor","middle");yl.setAttribute("font-size","11");yl.setAttribute("fill","#4f6252");yl.textContent=(variable?.label||variableCode)+" ("+(canonical||plotted[0].plotUnit||"unité inconnue")+")";svg.appendChild(yl);chart.appendChild(svg);
      const periodLabel=document.createElement("p");periodLabel.className="muted";periodLabel.textContent=L.period+(plotted[0].measured_at?new Date(plotted[0].measured_at).toLocaleDateString("fr-FR"):"date inconnue")+" — "+(plotted[plotted.length-1].measured_at?new Date(plotted[plotted.length-1].measured_at).toLocaleDateString("fr-FR"):"date inconnue");chart.appendChild(periodLabel);
    }
    if(!rows.length) tbody.innerHTML='<tr><td colspan="5">' + L.noRows + '</td></tr>';
    else { rows.slice().reverse().slice(0,200).forEach(row=>{const tr=document.createElement("tr"),culture=cultureById.get(row.culture_id),cells=[row.measured_at?new Date(row.measured_at).toLocaleString("fr-FR"):"Date inconnue",culture?.code||(row.culture_id?L.cultureLinked:L.noCulture),String(row.raw_value??"—"),row.raw_unit_code||"Unité non renseignée",row.method||"—"];cells.forEach(value=>{const td=document.createElement("td");td.textContent=value;tr.appendChild(td);});tbody.appendChild(tr);});if(rows.length>200){const tr=document.createElement("tr"),td=document.createElement("td");td.colSpan=5;td.textContent=L.limited(rows.length);tr.appendChild(td);tbody.appendChild(tr);}}
  } catch(error) { if (requestId !== statisticsRequestId || !isCurrentWorkspaceRevision(loadRevision, loadOrganizationId) || domain !== (document.body.dataset.domain || "mycology")) return; console.error("Analyse des mesures impossible :",error); status.textContent=L.loadError+error.message; chart.innerHTML='<p class="muted">' + L.graphError + '</p>'; summary.innerHTML=""; tbody.innerHTML='<tr><td colspan="5">' + L.unavailable + '</td></tr>'; }
  finally { if (requestId === statisticsRequestId && isCurrentWorkspaceRevision(loadRevision, loadOrganizationId) && domain === (document.body.dataset.domain || "mycology")) { button.disabled=false; button.textContent=L.buttonAnalyze; } }
}

function biologicalWorkflowText(key, count = 0) {
  const lang = window.BALabsI18n?.language || "fr";
  const messages = {
    fr: { loading:"Chargement de la filiation…", missing:"Culture introuvable dans cette organisation.", open:"Ouvrir la fiche de culture ", noCode:"sans code", typeMissing:"type non renseigné", materialOrigin:"Origine matérielle (de la souche source au matériel actuel)", materialNoCode:"Matériel sans code", unknownType:"type inconnu", generation:"génération ", parents:"Cultures parentes", selected:"Culture sélectionnée", openSheet:"Fiche ouverte", parentCulture:"Culture parente", descendants:"Descendants", noLineage:"Aucun ascendant ou descendant enregistré dans les fiches de culture. L’origine matérielle initiale reste indiquée par l’identifiant matériel de la fiche.", partial:"Filiation partielle : limite de résultats ou profondeur maximale de 250 niveaux atteinte.", loadError:"Impossible de charger la filiation : ", selectCulture:"Sélectionnez une culture avant d’enregistrer.", dateRequired:"Indiquez la date de l’opération.", childLimit:"Maximum : 12 descendants par opération.", invalidPropagation:"Cette opération ne peut pas créer de descendants. Retirez les codes ou choisissez une opération de propagation.", saving:"Enregistrement…", syncWarning:" La filiation est enregistrée dans Supabase ; vérifiez la synchronisation Notion des descendants.", syncWarningShort:" La filiation est enregistrée dans Supabase ; synchronisation Notion à vérifier.", saved:"Opération enregistrée", childCreated:" descendant(s) créé(s).", failed:"Échec : ", notSaved:"opération non enregistrée", save:"Enregistrer l’opération", loadMore:"Charger 200 descendants supplémentaires", loadingMore:"Chargement…" },
    en: { loading:"Loading lineage…", missing:"Culture not found in this organization.", open:"Open culture record ", noCode:"no code", typeMissing:"type not specified", materialOrigin:"Material origin (from source strain to current material)", materialNoCode:"Material without a code", unknownType:"unknown type", generation:"generation ", parents:"Parent cultures", selected:"Selected culture", openSheet:"Open record", parentCulture:"Parent culture", descendants:"Descendants", noLineage:"No ancestors or descendants are recorded in the culture records. The initial material origin remains indicated by the record's material ID.", partial:"Partial lineage: the result limit or maximum depth of 250 levels was reached.", loadError:"Could not load lineage: ", selectCulture:"Select a culture before saving.", dateRequired:"Enter the operation date.", childLimit:"Maximum: 12 descendants per operation.", invalidPropagation:"This operation cannot create descendants. Remove the codes or choose a propagation operation.", saving:"Saving…", syncWarning:" Lineage is saved in Supabase; check Notion synchronization for descendants.", syncWarningShort:" Lineage is saved in Supabase; verify Notion synchronization.", saved:"Operation saved", childCreated:" descendant(s) created.", failed:"Failed: ", notSaved:"operation not saved", save:"Save operation", loadMore:"Load 200 more descendants", loadingMore:"Loading…" },
    pt: { loading:"A carregar a filiação…", missing:"Cultura não encontrada nesta organização.", open:"Abrir ficha da cultura ", noCode:"sem código", typeMissing:"tipo não indicado", materialOrigin:"Origem material (da estirpe de origem ao material atual)", materialNoCode:"Material sem código", unknownType:"tipo desconhecido", generation:"geração ", parents:"Culturas progenitoras", selected:"Cultura selecionada", openSheet:"Ficha aberta", parentCulture:"Cultura progenitora", descendants:"Descendentes", noLineage:"Não há ascendentes ou descendentes registados nas fichas de cultura. A origem material inicial continua indicada pelo identificador do material.", partial:"Filiação parcial: foi atingido o limite de resultados ou a profundidade máxima de 250 níveis.", loadError:"Não foi possível carregar a filiação: ", selectCulture:"Selecione uma cultura antes de guardar.", dateRequired:"Indique a data da operação.", childLimit:"Máximo: 12 descendentes por operação.", invalidPropagation:"Esta operação não pode criar descendentes. Remova os códigos ou escolha uma operação de propagação.", saving:"A guardar…", syncWarning:" A filiação está guardada no Supabase; verifique a sincronização dos descendentes com o Notion.", syncWarningShort:" A filiação está guardada no Supabase; verifique a sincronização com o Notion.", saved:"Operação guardada", childCreated:" descendente(s) criado(s).", failed:"Falha: ", notSaved:"operação não guardada", save:"Guardar operação", loadMore:"Carregar mais 200 descendentes", loadingMore:"A carregar…" },
    ar: { loading:"جارٍ تحميل النسب…", missing:"الثقافة غير موجودة في هذه المؤسسة.", open:"فتح سجل المزرعة ", noCode:"بلا رمز", typeMissing:"النوع غير محدد", materialOrigin:"أصل المادة (من السلالة المصدر إلى المادة الحالية)", materialNoCode:"مادة بلا رمز", unknownType:"نوع غير معروف", generation:"الجيل ", parents:"المزارع الأم", selected:"المزرعة المحددة", openSheet:"السجل المفتوح", parentCulture:"المزرعة الأم", descendants:"الفروع", noLineage:"لا توجد أسلاف أو فروع مسجلة في سجلات المزارع. يظل أصل المادة الأولي موضحًا بمعرّف المادة في السجل.", partial:"النسب جزئي: تم بلوغ حد النتائج أو العمق الأقصى البالغ 250 مستوى.", loadError:"تعذّر تحميل النسب: ", selectCulture:"حدد مزرعة قبل الحفظ.", dateRequired:"أدخل تاريخ العملية.", childLimit:"الحد الأقصى 12 فرعًا لكل عملية.", invalidPropagation:"لا يمكن لهذه العملية إنشاء فروع. احذف الرموز أو اختر عملية إكثار.", saving:"جارٍ الحفظ…", syncWarning:" تم حفظ النسب في Supabase؛ تحقق من مزامنة الفروع مع Notion.", syncWarningShort:" تم حفظ النسب في Supabase؛ تحقق من المزامنة مع Notion.", saved:"تم حفظ العملية", childCreated:" فرع/فروع تم إنشاؤها.", failed:"فشل: ", notSaved:"لم تُحفظ العملية", save:"حفظ العملية", loadMore:"تحميل 200 فرع إضافي", loadingMore:"جارٍ التحميل…" }
  };
  const selected = (messages[lang] || messages.fr)[key];
  return typeof selected === "function" ? selected(count) : (selected ?? messages.fr[key] ?? key);
}

async function loadBiologicalLineage(cultureId, offset = 0) {
  const target = document.getElementById('cultureLineage');
  const loadRevision = authStateRevision;
  const loadOrganizationId = organizationId;
  if (!target || !loadOrganizationId) return;
  if (offset === 0) {
    target.__lineageRequestId = (target.__lineageRequestId || 0) + 1;
    target.__lineageCultureId = cultureId;
    target.__lineageRows = [];
    target.textContent = biologicalWorkflowText("loading");
  } else if (target.__lineageCultureId !== cultureId) {
    return;
  }
  const lineageRequestId = target.__lineageRequestId;
  try {
    const { data, error } = await supabaseClient.rpc('get_culture_lineage', {
      p_organization_id: loadOrganizationId,
      p_culture_id: cultureId,
      p_limit: 200,
      p_offset: offset
    });
    if (error) throw error;
    if (!isCurrentWorkspaceRevision(loadRevision, loadOrganizationId)) return;
    if (lineageRequestId !== target.__lineageRequestId ||
        target.__lineageCultureId !== cultureId) return;

    const pageRows = data || [];
    const previousRows = Array.isArray(target.__lineageRows) ? target.__lineageRows : [];
    const lineageRowKey = row => {
      if (row.culture_id) return `${row.relation}:culture:${row.culture_id}`;
      if (row.relation === 'material_ancestor' && row.material_id) {
        return `material_ancestor:material:${row.material_id}`;
      }
      return `${row.relation}:depth:${row.depth ?? 0}`;
    };
    const lineageRowsByKey = new Map();
    [...previousRows, ...pageRows].forEach(row => {
      lineageRowsByKey.set(lineageRowKey(row), row);
    });
    const rows = Array.from(lineageRowsByKey.values());
    target.__lineageRows = rows;
    const current = rows.find(row => row.relation === 'current');
    if (!current) { target.textContent = biologicalWorkflowText("missing"); return; }

    const toCultureRecord = row => ({
      id: row.culture_id,
      code: row.culture_code,
      culture_type: row.culture_type,
      material_id: row.material_id,
      parent_culture_id: row.parent_culture_id,
      started_at: row.started_at
    });
    const ancestors = rows
      .filter(row => row.relation === 'ancestor')
      .sort((a, b) => b.depth - a.depth)
      .map(toCultureRecord);
    const descendants = rows
      .filter(row => row.relation === 'descendant')
      .sort((a, b) => a.depth - b.depth || String(a.culture_code || '').localeCompare(String(b.culture_code || '')))
      .map(row => ({ ...toCultureRecord(row), depth: row.depth }));
    const materialAncestors = rows
      .filter(row => row.relation === 'material_ancestor')
      .sort((a, b) => b.depth - a.depth)
      .map(row => ({
        material_code: row.material_code,
        material_type: row.material_type,
        generation: row.material_generation,
        state: row.material_state,
        relationship_type: row.material_relationship_type
      }));
    const materialChain = [
      ...materialAncestors,
      ...(current.material_id ? [{
        material_code: current.material_code,
        material_type: current.material_type,
        generation: current.material_generation,
        state: current.material_state,
        relationship_type: null
      }] : [])
    ];
    const isTruncated = rows.some(row => row.truncated === true);
    const hasMore = current.has_more === true;
    const descendantTotal = Number(current.descendant_total || 0);

    const renderNode = (row, label) => {
      const node = document.createElement('button');
      node.type = 'button';
      node.className = 'culture-lineage-node';
      node.addEventListener('click', () => loadCultureDetail(row.id));
      node.setAttribute('aria-label', biologicalWorkflowText("open") + (row.code || biologicalWorkflowText("noCode")));
      const strong = document.createElement('strong');
      strong.textContent = row.code || 'Culture sans code';
      const small = document.createElement('small');
      small.textContent = label + ' · ' + (row.culture_type || biologicalWorkflowText("typeMissing"));
      node.append(strong, small);
      return node;
    };

    target.replaceChildren();
    const makeGroup = (title, items) => {
      const section = document.createElement('section');
      const heading = document.createElement('p');
      heading.className = 'muted';
      heading.textContent = title;
      section.appendChild(heading);
      const list = document.createElement('div');
      list.className = 'culture-lineage-list';
      items.forEach((item, index) => {
        if (index) {
          const arrow = document.createElement('span');
          arrow.className = 'culture-lineage-arrow';
          arrow.textContent = '→';
          list.appendChild(arrow);
        }
        list.appendChild(renderNode(item.row, item.label));
      });
      section.appendChild(list);
      target.appendChild(section);
    };

    if (materialChain.length) {
      const section = document.createElement('section');
      const heading = document.createElement('p');
      heading.className = 'muted';
      heading.textContent = biologicalWorkflowText("materialOrigin");
      section.appendChild(heading);
      const list = document.createElement('div');
      list.className = 'culture-lineage-list';
      materialChain.forEach((material, index) => {
        if (index) {
          const arrow = document.createElement('span');
          arrow.className = 'culture-lineage-arrow';
          arrow.textContent = '→';
          list.appendChild(arrow);
        }
        const node = document.createElement('div');
        node.className = 'culture-lineage-node';
        const strong = document.createElement('strong');
        strong.textContent = material.material_code || biologicalWorkflowText("materialNoCode");
        const small = document.createElement('small');
        small.textContent = (material.material_type || biologicalWorkflowText("unknownType")) +
          (material.generation == null ? '' : ' · ' + biologicalWorkflowText("generation") + material.generation) +
          (material.state ? ' · ' + material.state : '') +
          (material.relationship_type ? ' · ' + material.relationship_type : '');
        node.append(strong, small);
        list.appendChild(node);
      });
      section.appendChild(list);
      target.appendChild(section);
    }

    if (ancestors.length) {
      makeGroup(biologicalWorkflowText("parents"), ancestors.map(row => ({
        row, label: biologicalWorkflowText("parentCulture")
      })));
    }
    makeGroup(biologicalWorkflowText("selected"), [{
      row: toCultureRecord(current), label: biologicalWorkflowText("openSheet")
    }]);
    if (descendants.length) {
      makeGroup(biologicalWorkflowText("descendants") + ' (' + descendants.length + '/' + descendantTotal + ')',
        descendants.map(row => ({ row, label: biologicalWorkflowText("generation") + row.depth })));
    }
    if (!ancestors.length && !descendants.length) {
      const p = document.createElement('p');
      p.className = 'muted';
      p.textContent = biologicalWorkflowText("noLineage");
      target.appendChild(p);
    }
    if (isTruncated) {
      const note = document.createElement('p');
      note.className = 'muted';
      note.textContent = biologicalWorkflowText("partial");
      target.appendChild(note);
    }
    if (hasMore) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'culture-lineage-load-more';
      button.textContent = biologicalWorkflowText("loadMore");
      button.addEventListener('click', () => {
        button.disabled = true;
        button.textContent = biologicalWorkflowText("loadingMore");
        loadBiologicalLineage(cultureId, offset + 200);
      }, { once: true });
      target.appendChild(button);
    }
  } catch (error) {
    if (!isCurrentWorkspaceRevision(loadRevision, loadOrganizationId)) return;
    if (lineageRequestId !== target.__lineageRequestId ||
        target.__lineageCultureId !== cultureId) return;
    target.textContent = biologicalWorkflowText("loadError") + (error.message || error);
  }
}

async function saveBiologicalOperation(event) {
  const operationRevision = authStateRevision;
  const operationOrganizationId = organizationId;

  event.preventDefault();
  const button = document.getElementById('saveBioOperation');
  const message = document.getElementById('bioOperationMessage');
  const cultureId = document.getElementById('cultureDetailPanel')?.dataset.cultureId;
  if (!cultureId || !operationOrganizationId) { message.textContent = biologicalWorkflowText("selectCulture"); return; }
  const operationType = document.getElementById('bioOperationType').value;
  const dateValue = document.getElementById('bioOperationDate').value;
  const note = document.getElementById('bioOperationNote').value.trim();
  const conditions = document.getElementById('bioOperationConditions').value.trim();
  const outcome = document.getElementById('bioOperationOutcome').value;
  const childCodes = [...new Set(document.getElementById('bioChildCodes').value.split(',').map(value => value.trim()).filter(Boolean))];
  if (!dateValue) { message.textContent = biologicalWorkflowText("dateRequired"); return; }
  if (childCodes.length > 12) { message.textContent = biologicalWorkflowText("childLimit"); return; }
  if (childCodes.length && !['repiquage','passage','transfert','division_aliquotes','changement_milieu','conservation'].includes(operationType)) { message.textContent = biologicalWorkflowText("invalidPropagation"); return; }
  const occurredAt = new Date(dateValue).toISOString();
  const details = { source: 'BA Labs Culture Tracker', interface_version: '3.0', conditions: conditions || null, outcome: outcome || null };
  const biologicalOperationPayload = {
    organization_id: operationOrganizationId,
    parent_culture_id: cultureId,
    event_type: operationType,
    occurred_at: occurredAt,
    note: note || null,
    details,
    child_codes: childCodes
  };
  const idempotencyKey = await getManualWriteIdempotencyKey(
    "biological-operation",
    biologicalOperationPayload
  );
  button.disabled = true; button.textContent = biologicalWorkflowText("saving"); message.textContent = '';
  try {
    if (!isCurrentWorkspaceRevision(operationRevision, operationOrganizationId)) throw new Error("Session ou espace de travail modifié pendant l’opération. Recommencez.");
    const { data, error } = await supabaseClient.rpc('record_biological_operation', {
      p_organization_id: operationOrganizationId, p_parent_culture_id: cultureId, p_event_type: operationType,
      p_idempotency_key: idempotencyKey,
      p_occurred_at: occurredAt, p_note: note || null,
      p_details: details, p_child_codes: childCodes
    });
    if (error) throw error;
    clearManualWriteIdempotencyKey("biological-operation");
    if (!isCurrentWorkspaceRevision(operationRevision, operationOrganizationId)) return;
    const result = Array.isArray(data) ? data[0] : data;
    let notionSyncWarning = '';
    for (const child of (result?.children || [])) {
      try {
        const { data: syncData, error: syncError } = await supabaseClient.functions.invoke('sync-culture-to-notion', { body: { culture_id: child.id } });
        if (syncError || (syncData && syncData.ok === false)) notionSyncWarning = biologicalWorkflowText("syncWarning");
      } catch (syncError) { notionSyncWarning = biologicalWorkflowText("syncWarningShort"); }
    }
    document.getElementById('bioOperationNote').value = ''; document.getElementById('bioOperationConditions').value = ''; document.getElementById('bioOperationOutcome').value = ''; document.getElementById('bioChildCodes').value = '';
    message.textContent = biologicalWorkflowText("saved") + (result?.children?.length ? ' · ' + result.children.length + biologicalWorkflowText("childCreated") : '.') + notionSyncWarning;
    await loadCultureOptions();
    await loadCultureDetail(cultureId);
    await loadBiologicalLineage(cultureId);
  } catch (error) {
    if (!isCurrentWorkspaceRevision(operationRevision, operationOrganizationId)) return; message.textContent = biologicalWorkflowText("failed") + (error.message || biologicalWorkflowText("notSaved")); }
  finally {
    if (isCurrentWorkspaceRevision(operationRevision, operationOrganizationId)) {
      button.disabled = false;
      button.textContent = biologicalWorkflowText("save");
    }
  }
}

let cultureDetailRequestId = 0;

function sortCultureEventTimelineEntries(timeline, beforeElement = null) {
  const entries = [...timeline.querySelectorAll('[data-culture-event-entry="true"]')];
  entries.sort((a, b) => {
    const aTime = Number(a.dataset.sortTimestamp) || 0;
    const bTime = Number(b.dataset.sortTimestamp) || 0;
    return bTime - aTime;
  });
  entries.forEach(entry => timeline.insertBefore(entry, beforeElement));
}


async function loadMoreCultureEventHistory(cultureId, offset, button) {
  const requestId = ++cultureDetailRequestId;
  const loadRevision = authStateRevision;
  const loadOrganizationId = organizationId;
  const panel = document.getElementById("cultureDetailPanel");
  const timeline = document.getElementById("cultureDetailTimeline");
  if (!panel || !timeline || panel.dataset.cultureId !== cultureId) return;

  button.disabled = true;
  button.textContent = "Chargement des événements…";
  try {
    const { data: history, error: historyError } = await supabaseClient.rpc("get_culture_event_history", {
      p_organization_id: loadOrganizationId,
      p_culture_id: cultureId,
      p_limit: 100,
      p_offset: offset
    });
    if (historyError) throw new Error(historyError.message);
    if (requestId !== cultureDetailRequestId || !isCurrentWorkspaceRevision(loadRevision, loadOrganizationId)) return;

    const events = (history || []).map(row => ({
      id: row.event_id,
      event_type: row.event_type,
      occurred_at: row.occurred_at,
      batch_id: row.batch_id,
      source_relation: row.source_relation,
      payload: row.payload
    }));
    const eventIds = events.map(event => event.id);
    let measurements = [];
    let observations = [];
    if (eventIds.length) {
      const [measurementResult, observationResult] = await Promise.all([
        supabaseClient.from("measurements")
          .select("id, variable_code, raw_value, raw_unit_code, measured_at, event_id, metadata")
          .eq("organization_id", loadOrganizationId).in("event_id", eventIds)
          .order("measured_at", { ascending: false }).limit(100),
        supabaseClient.from("observations")
          .select("id, variable_code, value_text, observed_at, event_id, metadata")
          .eq("organization_id", loadOrganizationId).in("event_id", eventIds)
          .order("observed_at", { ascending: false }).limit(100)
      ]);
      if (measurementResult.error) throw new Error("Mesures : " + measurementResult.error.message);
      if (observationResult.error) throw new Error("Observations : " + observationResult.error.message);
      measurements = measurementResult.data || [];
      observations = observationResult.data || [];
    }
    if (requestId !== cultureDetailRequestId || !isCurrentWorkspaceRevision(loadRevision, loadOrganizationId)) return;

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
        type: (event.source_relation === "creation_operation" ? "Opération de création · " :
          event.source_relation === "descendant_culture" ? "Création d’une culture fille · " : "") +
          String(event.event_type || "Événement").replaceAll("_", " "),
        detail: [
          event.source_relation === "creation_operation" ? "Opération à l’origine de cette culture" :
          event.source_relation === "descendant_culture" ? "Culture fille créée depuis cette culture par génération directe" : null,
          event.payload?.parent_culture_code ? "Culture parent : " + event.payload.parent_culture_code : null,
          event.payload?.material_code ? "Matériel : " + event.payload.material_code : null,
          event.payload?.note,
          event.payload?.details?.conditions ? "Conditions : " + event.payload.details.conditions : null,
          event.payload?.details?.outcome ? "Résultat : " + String(event.payload.details.outcome).replaceAll("_", " ") : null,
          event.payload?.description
        ].filter(Boolean).join(" — ") || "Événement de traçabilité."
      });
    }
    entries.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    for (const entry of entries) {
      const article = document.createElement("article");
      article.className = "culture-timeline-entry";
      article.dataset.cultureEventEntry = "true";
      article.dataset.sortTimestamp = String(new Date(entry.date || 0).getTime() || 0);
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
      timeline.insertBefore(article, button);
    }
    sortCultureEventTimelineEntries(timeline, button);

    const historyHasMore = history?.some(row => row.has_more === true);
    if (historyHasMore) {
      button.disabled = false;
      button.textContent = "Charger 100 événements plus anciens";
      button.onclick = () => loadMoreCultureEventHistory(cultureId, offset + 100, button);
    } else {
      button.remove();
    }
  } catch (error) {
    if (requestId !== cultureDetailRequestId || !isCurrentWorkspaceRevision(loadRevision, loadOrganizationId)) return;
    console.error("Chargement de la suite de l’historique :", error);
    button.disabled = false;
    button.textContent = "Réessayer de charger les événements";
  }
}

function invalidateGenerationComparison(message = "Sélection modifiée. Relancez la comparaison pour actualiser le rapport.") {
  const results = document.getElementById("generationComparisonResults");
  if (results) {
    results.__generationComparisonRequestId = (results.__generationComparisonRequestId || 0) + 1;
    results.replaceChildren();
  }
  const button = document.getElementById("compareCultureGenerationsButton");
  if (button) button.disabled = false;
  const status = document.getElementById("generationComparisonStatus");
  if (status) status.textContent = message;
}

function filterGenerationComparisonOptions() {
  const search = document.getElementById("generationComparisonSearch");
  const options = document.getElementById("generationComparisonOptions");
  if (!search || !options) return;
  const query = search.value.trim().toLocaleLowerCase("fr");
  options.querySelectorAll("[data-culture-option]").forEach(label => {
    label.hidden = query !== "" && !label.dataset.search.includes(query);
  });
}

function populateGenerationComparisonOptions(currentCultureId) {
  const options = document.getElementById("generationComparisonOptions");
  const search = document.getElementById("generationComparisonSearch");
  if (!options) return;
  options.replaceChildren();
  if (search) search.value = "";

  cultureOptions
    .slice()
    .sort((a, b) => String(a.code || "").localeCompare(String(b.code || ""), "fr"))
    .forEach(culture => {
      const label = document.createElement("label");
      label.className = "generation-comparison-option";
      label.dataset.cultureOption = "true";
      label.dataset.search = [culture.code || "", culture.culture_type || "", culture.id || ""]
        .join(" ").toLocaleLowerCase("fr");

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = culture.id;
      checkbox.checked = culture.id === currentCultureId;
      checkbox.addEventListener("change", () => {
        const selectedCultureIds = options.querySelectorAll("input[type=checkbox]:checked");
        if (selectedCultureIds.length > 4) {
          checkbox.checked = false;
          const status = document.getElementById("generationComparisonStatus");
          if (status) status.textContent = "Quatre cultures maximum. Décochez une culture avant d’en ajouter une autre.";
          return;
        }
        invalidateGenerationComparison(
          selectedCultureIds.length + " culture(s) sélectionnée(s). " +
          (selectedCultureIds.length < 2 ? "Ajoutez au moins une autre culture." : "Relancez la comparaison pour actualiser le rapport.")
        );
      });

      const text = document.createElement("span");
      text.textContent = (culture.code || "Culture sans code") + " — " +
        (culture.culture_type || "type non renseigné");
      label.append(checkbox, text);
      options.appendChild(label);
    });
  filterGenerationComparisonOptions();
}

function renderGenerationComparisonReport(report) {
  const target = document.getElementById("generationComparisonResults");
  if (!target) return;
  target.replaceChildren();

  const cultureCodes = new Map((report.cultures || []).map(c => [c.id, c.code || c.id]));
  const sections = [
    ["cultures", "Cultures sélectionnées"],
    ["lineage", "Filiation et générations"],
    ["measurements", "Mesures quantitatives"],
    ["observations", "Observations qualitatives"],
    ["events", "Opérations et événements"],
    ["batches", "Lots de production"],
    ["results", "Résultats expérimentaux"],
    ["environmental_observations", "Données environnementales"]
  ];
  const fieldLabels = {
    culture_id:"Culture", selected_culture_id:"Culture suivie", ancestor_culture_id:"Ancêtre",
    parent_culture_id:"Culture parente", depth:"Profondeur", code:"Code",
    culture_type:"Type", started_at:"Démarrage", material_code:"Matériel",
    variable_code:"Variable", raw_value:"Valeur brute", raw_unit_code:"Unité brute",
    normalized_value:"Valeur normalisée", normalized_unit_code:"Unité normalisée",
    measured_at:"Mesuré le", observed_at:"Observé le", value_text:"Observation",
    quality_state:"Qualité", exclusion_reason:"Motif d’exclusion", event_type:"Événement",
    occurred_at:"Date", source_relation:"Origine", batch_code:"Code lot", status:"Statut",
    current_stage:"Étape", quantity_actual:"Quantité réelle", quantity_unit_code:"Unité",
    result_type:"Type de résultat", value:"Résultat", data_family:"Famille",
    provider_code:"Fournisseur", dataset_code:"Jeu de données", unit_code:"Unité",
    spatial_resolution_m:"Résolution spatiale", quality_flag:"Indicateur qualité",
    experiment_code:"Expérience", experiment_name:"Nom expérience",
    protocol_version:"Version protocole", generation:"Génération"
  };
  const format = value => {
    if (value === null || value === undefined || value === "") return "Non renseigné";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  };
  const heading = document.createElement("p");
  heading.className = "muted";
  heading.textContent = "Rapport v" + (report.schema_version || "?") + " · " +
    (report.cultures || []).length + " cultures · " +
    new Date(report.generated_at || Date.now()).toLocaleString();
  target.appendChild(heading);

  // Descriptive summaries use culture-linked measurements only. Shared
  // environmental readings remain contextual and are never attributed to a culture.
  const measurementRows = Array.isArray(report.measurements) ? report.measurements : [];
  const cultureMeasurementRows = measurementRows.filter(row =>
    row.source_relation === "culture" && row.culture_id
  );
  const environmentalMeasurementRows = measurementRows.filter(row =>
    row.source_relation === "environment" || !row.culture_id
  );
  const measurementGroups = new Map();
  let excludedMeasurements = 0;
  let nonNumericMeasurements = 0;
  cultureMeasurementRows.forEach(row => {
    if (row.quality_state === "excluded") {
      excludedMeasurements += 1;
      return;
    }
    const rawValue = row.normalized_value ?? row.raw_value;
    const numericValue = rawValue == null ? NaN : Number(rawValue);
    if (!Number.isFinite(numericValue)) {
      nonNumericMeasurements += 1;
      return;
    }
    const unit = row.normalized_value != null
      ? (row.normalized_unit_code || "unité normalisée non renseignée")
      : (row.raw_unit_code || "unité brute non renseignée");
    const key = [row.culture_id, row.variable_code || "variable inconnue", unit,
      row.quality_state || "qualité non renseignée"].join("||");
    if (!measurementGroups.has(key)) {
      measurementGroups.set(key, {
        cultureId: row.culture_id,
        variable: row.variable_code || "Variable inconnue",
        unit,
        quality: row.quality_state || "non renseignée",
        values: []
      });
    }
    measurementGroups.get(key).values.push(numericValue);
  });

  const statsSection = document.createElement("section");
  statsSection.className = "generation-comparison-section";
  const statsTitle = document.createElement("h5");
  statsTitle.textContent = "Synthèse statistique descriptive";
  statsSection.appendChild(statsTitle);
  const statsNote = document.createElement("p");
  statsNote.className = "muted";
  statsNote.textContent = "Calculs séparés par culture, variable, unité et état qualité. n représente le nombre de mesures enregistrées, pas le nombre de répétitions biologiques indépendantes.";
  statsSection.appendChild(statsNote);

  if (measurementGroups.size) {
    const statsTable = document.createElement("table");
    statsTable.className = "statistics-table";
    const statsHead = document.createElement("thead");
    const statsHeaderRow = document.createElement("tr");
    ["Culture", "Variable", "Unité", "Qualité", "n mesures", "Moyenne", "Médiane", "Q1–Q3", "Min–max"]
      .forEach(label => {
        const th = document.createElement("th");
        th.textContent = label;
        statsHeaderRow.appendChild(th);
      });
    statsHead.appendChild(statsHeaderRow);
    statsTable.appendChild(statsHead);
    const statsBody = document.createElement("tbody");
    const fmt = value => new Intl.NumberFormat(undefined, {maximumSignificantDigits: 5}).format(value);
    const quantile = (sorted, probability) => {
      const position = (sorted.length - 1) * probability;
      const lower = Math.floor(position);
      const upper = Math.ceil(position);
      return lower === upper ? sorted[lower] :
        sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
    };
    [...measurementGroups.values()].sort((a, b) =>
      String(cultureCodes.get(a.cultureId) || a.cultureId).localeCompare(String(cultureCodes.get(b.cultureId) || b.cultureId)) ||
      a.variable.localeCompare(b.variable) || a.unit.localeCompare(b.unit)
    ).forEach(group => {
      const sorted = group.values.slice().sort((a, b) => a - b);
      const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
      const cells = [
        cultureCodes.get(group.cultureId) || group.cultureId,
        group.variable, group.unit, group.quality, String(sorted.length),
        fmt(mean), fmt(quantile(sorted, .5)),
        fmt(quantile(sorted, .25)) + "–" + fmt(quantile(sorted, .75)),
        fmt(sorted[0]) + "–" + fmt(sorted[sorted.length - 1])
      ];
      const tr = document.createElement("tr");
      cells.forEach(value => {
        const td = document.createElement("td");
        td.textContent = value;
        tr.appendChild(td);
      });
      statsBody.appendChild(tr);
    });
    statsTable.appendChild(statsBody);
    statsSection.appendChild(statsTable);
  } else {
    const emptyStats = document.createElement("p");
    emptyStats.className = "muted";
    emptyStats.textContent = "Aucune mesure quantitative liée directement aux cultures sélectionnées ne permet un calcul statistique.";
    statsSection.appendChild(emptyStats);
  }

  const qualityNote = document.createElement("p");
  qualityNote.className = "muted";
  qualityNote.textContent =
    "Mesures culturelles exclues : " + excludedMeasurements +
    " · Valeurs absentes ou non numériques : " + nonNumericMeasurements +
    " · Mesures environnementales contextuelles : " + environmentalMeasurementRows.length +
    ". Les mesures environnementales partagées ne sont pas intégrées aux statistiques propres aux cultures.";
  statsSection.appendChild(qualityNote);
  target.appendChild(statsSection);

  // Replicate-aware comparison: collapse repeated readings within each
  // experimental unit first, then compare independent units within a cohort.
  const cultureMetadata = new Map((report.cultures || []).map(culture =>
    [culture.id, culture]
  ));
  const unitMeasurements = new Map();
  let measurementsWithoutExperimentalUnit = 0;
  cultureMeasurementRows.forEach(row => {
    if (row.quality_state === "excluded") return;
    const culture = cultureMetadata.get(row.culture_id);
    if (!culture?.experimental_unit_id || !culture?.experiment_id) {
      measurementsWithoutExperimentalUnit += 1;
      return;
    }
    const numericValue = Number(row.normalized_value ?? row.raw_value);
    if (!Number.isFinite(numericValue)) return;
    const unit = row.normalized_value != null
      ? (row.normalized_unit_code || "unité normalisée non renseignée")
      : (row.raw_unit_code || "unité brute non renseignée");
    const treatment = culture.treatment_code || "traitement non renseigné";
    const quality = row.quality_state || "qualité non renseignée";
    const cohortKey = [
      culture.experiment_id, treatment, row.variable_code || "variable inconnue",
      unit, quality
    ].join("||");
    const unitKey = [cohortKey, culture.experimental_unit_id].join("||");
    if (!unitMeasurements.has(unitKey)) {
      unitMeasurements.set(unitKey, {
        cohortKey,
        experiment: culture.experiment_code || culture.experiment_id,
        treatment,
        variable: row.variable_code || "Variable inconnue",
        unit,
        quality,
        unitId: culture.experimental_unit_id,
        unitCode: culture.unit_code || culture.replicate_no || culture.experimental_unit_id,
        cultureCodes: new Set(),
        values: []
      });
    }
    const unitGroup = unitMeasurements.get(unitKey);
    unitGroup.values.push(numericValue);
    unitGroup.cultureCodes.add(culture.code || culture.id);
  });

  const cohorts = new Map();
  unitMeasurements.forEach(unitGroup => {
    if (!cohorts.has(unitGroup.cohortKey)) {
      cohorts.set(unitGroup.cohortKey, {
        experiment: unitGroup.experiment,
        treatment: unitGroup.treatment,
        variable: unitGroup.variable,
        unit: unitGroup.unit,
        quality: unitGroup.quality,
        units: []
      });
    }
    const sortedValues = unitGroup.values.slice().sort((a, b) => a - b);
    const median = sortedValues.length % 2
      ? sortedValues[(sortedValues.length - 1) / 2]
      : (sortedValues[sortedValues.length / 2 - 1] + sortedValues[sortedValues.length / 2]) / 2;
    cohorts.get(unitGroup.cohortKey).units.push({
      unitId: unitGroup.unitId,
      unitCode: unitGroup.unitCode,
      median,
      measurementCount: sortedValues.length,
      cultureCount: unitGroup.cultureCodes.size
    });
  });

  const replicateSection = document.createElement("section");
  replicateSection.className = "generation-comparison-section";
  const replicateTitle = document.createElement("h5");
  replicateTitle.textContent = "Comparaison par unités expérimentales";
  replicateSection.appendChild(replicateTitle);
  const replicateNote = document.createElement("p");
  replicateNote.className = "muted";
  replicateNote.textContent = "Les mesures répétées d'une même unité sont d'abord résumées par leur médiane. Les statistiques portent ensuite sur les médianes des unités expérimentales distinctes, jamais sur le nombre brut de mesures. Le caractère biologiquement indépendant de ces unités doit être confirmé par le protocole : il n'est pas déduit automatiquement. Les groupes sans expérience ou unité identifiée sont exclus.";
  replicateSection.appendChild(replicateNote);

  const eligibleCohorts = [...cohorts.values()]
    .filter(cohort => cohort.units.length >= 2)
    .sort((a, b) => a.experiment.localeCompare(b.experiment) ||
      a.treatment.localeCompare(b.treatment) || a.variable.localeCompare(b.variable));
  if (eligibleCohorts.length) {
    const replicateTable = document.createElement("table");
    replicateTable.className = "statistics-table";
    const replicateHead = document.createElement("thead");
    const replicateHeader = document.createElement("tr");
    ["Expérience", "Traitement", "Variable", "Unité", "n unités distinctes",
      "Moyenne des médianes", "Médiane des unités", "Étendue des unités"]
      .forEach(label => {
        const th = document.createElement("th");
        th.textContent = label;
        replicateHeader.appendChild(th);
      });
    replicateHead.appendChild(replicateHeader);
    replicateTable.appendChild(replicateHead);
    const replicateBody = document.createElement("tbody");
    const replicateFmt = value => new Intl.NumberFormat(undefined, {
      maximumSignificantDigits: 5
    }).format(value);
    eligibleCohorts.forEach(cohort => {
      const values = cohort.units.map(unit => unit.median).sort((a, b) => a - b);
      const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
      const middle = values.length % 2
        ? values[(values.length - 1) / 2]
        : (values[values.length / 2 - 1] + values[values.length / 2]) / 2;
      const cells = [
        cohort.experiment, cohort.treatment, cohort.variable, cohort.unit,
        String(values.length), replicateFmt(mean), replicateFmt(middle),
        replicateFmt(values[0]) + "–" + replicateFmt(values[values.length - 1])
      ];
      const tr = document.createElement("tr");
      cells.forEach(value => {
        const td = document.createElement("td");
        td.textContent = value;
        tr.appendChild(td);
      });
      replicateBody.appendChild(tr);
    });
    replicateTable.appendChild(replicateBody);
    replicateSection.appendChild(replicateTable);

    const cohortDetails = document.createElement("p");
    cohortDetails.className = "muted";
    cohortDetails.textContent = eligibleCohorts.map(cohort =>
      cohort.experiment + " / " + cohort.treatment + " / " + cohort.variable +
      " : " + cohort.units.map(unit =>
        String(unit.unitCode) + " (" + unit.measurementCount + " mesures)"
      ).join(", ")
    ).join(" · ");
    replicateSection.appendChild(cohortDetails);
  } else {
    const noReplicates = document.createElement("p");
    noReplicates.className = "muted";
    noReplicates.textContent = "Aucun groupe ne possède au moins deux unités expérimentales distinctes avec une expérience identifiée. Les données restent consultables dans la synthèse descriptive, mais aucune comparaison de répétitions indépendantes n'est calculée.";
    replicateSection.appendChild(noReplicates);
  }
  const replicateLimit = document.createElement("p");
  replicateLimit.className = "muted";
  replicateLimit.textContent = "Mesures non rattachées à une unité expérimentale identifiable : " +
    measurementsWithoutExperimentalUnit + ". Aucune p-value ni conclusion causale n'est calculée à ce stade.";
  replicateSection.appendChild(replicateLimit);
  target.appendChild(replicateSection);

  // Candidate anomaly flags are descriptive only and operate on unit medians.
  const anomalySection = document.createElement("section");
  anomalySection.className = "generation-comparison-section";
  const anomalyTitle = document.createElement("h5");
  anomalyTitle.textContent = "Repérage descriptif des valeurs atypiques";
  anomalySection.appendChild(anomalyTitle);
  const anomalyNote = document.createElement("p");
  anomalyNote.className = "muted";
  anomalyNote.textContent = "Repérage par bornes de Tukey (1,5 × IQR) sur les médianes des unités expérimentales. Un signalement est une piste de vérification, pas une preuve d'erreur ni un motif d'exclusion.";
  anomalySection.appendChild(anomalyNote);

  const anomalyEligibleCohorts = eligibleCohorts.filter(cohort => cohort.units.length >= 4);
  const insufficientAnomalyCohorts = eligibleCohorts.filter(cohort => cohort.units.length < 4);
  insufficientAnomalyCohorts.forEach(cohort => {
    const note = document.createElement("p");
    note.className = "muted";
    note.textContent = cohort.experiment + " / " + cohort.treatment + " / " +
      cohort.variable + " : effectif insuffisant pour le repérage IQR (n = " +
      cohort.units.length + " unités distinctes ; minimum = 4).";
    anomalySection.appendChild(note);
  });

  let flaggedAnomalies = 0;
  const anomalyFormat = value => new Intl.NumberFormat(undefined, {
    maximumSignificantDigits: 5
  }).format(value);
  const anomalyQuantile = (sorted, probability) => {
    const position = (sorted.length - 1) * probability;
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    return lower === upper ? sorted[lower] :
      sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
  };
  anomalyEligibleCohorts.forEach(cohort => {
    const values = cohort.units.map(unit => unit.median).sort((a, b) => a - b);
    const q1 = anomalyQuantile(values, .25);
    const q3 = anomalyQuantile(values, .75);
    const iqr = q3 - q1;
    const lowerFence = q1 - 1.5 * iqr;
    const upperFence = q3 + 1.5 * iqr;
    cohort.units.forEach(unit => {
      if (unit.median < lowerFence || unit.median > upperFence) {
        flaggedAnomalies += 1;
        const candidate = document.createElement("p");
        candidate.textContent = cohort.experiment + " / " + cohort.treatment +
          " / " + cohort.variable + " : valeur atypique candidate — à vérifier · unité " +
          unit.unitCode + " · médiane " + anomalyFormat(unit.median) + " " + cohort.unit +
          " · bornes IQR " + anomalyFormat(lowerFence) + " à " + anomalyFormat(upperFence);
        anomalySection.appendChild(candidate);
      }
    });
  });
  if (!eligibleCohorts.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Aucun groupe avec au moins deux unités expérimentales distinctes ne permet ce repérage.";
    anomalySection.appendChild(empty);
  } else if (!anomalyEligibleCohorts.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Aucun groupe n'atteint l'effectif minimal de quatre unités distinctes pour le repérage IQR.";
    anomalySection.appendChild(empty);
  } else if (!flaggedAnomalies) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Aucune médiane d'unité ne dépasse les bornes IQR dans les groupes évaluables.";
    anomalySection.appendChild(empty);
  }
  const anomalySafetyNote = document.createElement("p");
  anomalySafetyNote.className = "muted";
  anomalySafetyNote.textContent = "Aucune mesure atypique n'est exclue automatiquement. Vérifier le cahier de laboratoire, le protocole, les unités et la saisie avant toute interprétation.";
  anomalySection.appendChild(anomalySafetyNote);
  target.appendChild(anomalySection);

  // Chronological culture series: never merge different cultures, variables,
  // units or quality states; shared environmental readings stay contextual.
  const timeSeriesGroups = new Map();
  let measurementsWithInvalidTime = 0;
  cultureMeasurementRows.forEach(row => {
    if (row.quality_state === "excluded") return;
    const rawValue = row.normalized_value ?? row.raw_value;
    const value = rawValue == null ? NaN : Number(rawValue);
    if (!Number.isFinite(value)) return;
    const timestamp = row.measured_at ? Date.parse(row.measured_at) : NaN;
    if (!Number.isFinite(timestamp)) {
      measurementsWithInvalidTime += 1;
      return;
    }
    const unit = row.normalized_value != null
      ? (row.normalized_unit_code || "unité normalisée non renseignée")
      : (row.raw_unit_code || "unité brute non renseignée");
    const quality = row.quality_state || "qualité non renseignée";
    const cultureId = row.culture_id;
    const variable = row.variable_code || "variable inconnue";
    const key = [cultureId, variable, unit, quality].join("||");
    if (!timeSeriesGroups.has(key)) {
      timeSeriesGroups.set(key, {
        cultureId,
        culture: cultureCodes.get(cultureId) || cultureId,
        variable,
        unit,
        quality,
        points: []
      });
    }
    timeSeriesGroups.get(key).points.push({
      id: row.id || "",
      timestamp,
      value
    });
  });

  const timeSeriesSection = document.createElement("section");
  timeSeriesSection.className = "generation-comparison-section";
  const timeSeriesTitle = document.createElement("h5");
  timeSeriesTitle.textContent = "Évolution temporelle des mesures";
  timeSeriesSection.appendChild(timeSeriesTitle);
  const timeSeriesNote = document.createElement("p");
  timeSeriesNote.className = "muted";
  timeSeriesNote.textContent = "Séries séparées par culture, variable, unité et état qualité : unités comparables uniquement. La variation depuis le relevé précédent est calculée dans l'ordre chronologique. Les relevés environnementaux partagés restent hors de ces séries.";
  timeSeriesSection.appendChild(timeSeriesNote);

  const timeSeriesFormat = value => new Intl.NumberFormat(undefined, {
    maximumSignificantDigits: 5
  }).format(value);
  const sortedTimeSeries = [...timeSeriesGroups.values()].sort((a, b) =>
    String(a.culture).localeCompare(String(b.culture)) ||
    a.variable.localeCompare(b.variable) || a.unit.localeCompare(b.unit)
  );
  sortedTimeSeries.forEach(series => {
    series.points.sort((a, b) => a.timestamp - b.timestamp ||
      String(a.id).localeCompare(String(b.id)));
    const heading = document.createElement("h6");
    heading.textContent = series.culture + " · " + series.variable +
      " · " + series.unit + " · " + series.quality +
      " · " + series.points.length + " relevé(s)";
    timeSeriesSection.appendChild(heading);

    const table = document.createElement("table");
    table.className = "statistics-table";
    const head = document.createElement("thead");
    const headerRow = document.createElement("tr");
    ["Date", "Valeur", "Variation depuis le relevé précédent", "Variation (%)", "Délai"]
      .forEach(label => {
        const th = document.createElement("th");
        th.textContent = label;
        headerRow.appendChild(th);
      });
    head.appendChild(headerRow);
    table.appendChild(head);
    const body = document.createElement("tbody");
    series.points.forEach((point, index) => {
      const previous = index > 0 ? series.points[index - 1] : null;
      const delta = previous ? point.value - previous.value : null;
      const percent = previous && previous.value !== 0
        ? (delta / Math.abs(previous.value)) * 100
        : null;
      const elapsedDays = previous
        ? (point.timestamp - previous.timestamp) / 86400000
        : null;
      const cells = [
        new Date(point.timestamp).toLocaleString(),
        timeSeriesFormat(point.value) + " " + series.unit,
        previous ? (delta > 0 ? "+" : "") + timeSeriesFormat(delta) + " " + series.unit : "—",
        previous
          ? (percent == null ? "variation en % non calculable (valeur précédente nulle)"
            : (percent > 0 ? "+" : "") + timeSeriesFormat(percent) + " %")
          : "—",
        previous ? timeSeriesFormat(elapsedDays) + " jour(s)" : "Premier relevé"
      ];
      const rowElement = document.createElement("tr");
      cells.forEach(value => {
        const cell = document.createElement("td");
        cell.textContent = value;
        rowElement.appendChild(cell);
      });
      body.appendChild(rowElement);
    });
    table.appendChild(body);
    timeSeriesSection.appendChild(table);

    // Accessible, dependency-free SVG plot. X is elapsed time (not row index),
    // so irregular sampling intervals remain visually honest.
    const chart = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    chart.setAttribute("viewBox", "0 0 720 190");
    chart.setAttribute("role", "img");
    chart.setAttribute("aria-label", "Graphique temporel : " + series.culture + ", " +
      series.variable + ", " + series.points.length + " relevés");
    chart.setAttribute("preserveAspectRatio", "xMidYMid meet");
    chart.style.width = "100%";
    chart.style.height = "auto";
    chart.style.maxHeight = "220px";
    const chartTitle = document.createElementNS("http://www.w3.org/2000/svg", "title");
    chartTitle.textContent = "Évolution de " + series.variable + " — " + series.culture;
    chart.appendChild(chartTitle);
    const chartDescription = document.createElementNS("http://www.w3.org/2000/svg", "desc");
    chartDescription.textContent = "Valeurs mesurées dans le temps, unité " + series.unit +
      ". Les valeurs exactes et dates figurent dans le tableau accessible adjacent.";
    chart.appendChild(chartDescription);
    const chartLeft = 54;
    const chartRight = 690;
    const chartTop = 18;
    const chartBottom = 145;
    const values = series.points.map(point => point.value);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const valuePadding = maxValue === minValue
      ? Math.max(Math.abs(maxValue) * 0.05, 1)
      : (maxValue - minValue) * 0.08;
    const yMin = minValue - valuePadding;
    const yMax = maxValue + valuePadding;
    const firstTime = series.points[0].timestamp;
    const lastTime = series.points[series.points.length - 1].timestamp;
    const xFor = point => lastTime === firstTime
      ? (chartLeft + chartRight) / 2
      : chartLeft + ((point.timestamp - firstTime) / (lastTime - firstTime)) *
        (chartRight - chartLeft);
    const yFor = value => chartBottom - ((value - yMin) / (yMax - yMin)) *
      (chartBottom - chartTop);
    const axis = document.createElementNS("http://www.w3.org/2000/svg", "path");
    axis.setAttribute("d", "M " + chartLeft + " " + chartTop + " V " +
      chartBottom + " H " + chartRight);
    axis.setAttribute("fill", "none");
    axis.setAttribute("stroke", "currentColor");
    axis.setAttribute("stroke-opacity", "0.45");
    chart.appendChild(axis);
    const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    polyline.setAttribute("points", series.points.map(point =>
      xFor(point) + "," + yFor(point.value)
    ).join(" "));
    polyline.setAttribute("fill", "none");
    polyline.setAttribute("stroke", "currentColor");
    polyline.setAttribute("stroke-width", "2.5");
    polyline.setAttribute("stroke-linejoin", "round");
    polyline.setAttribute("stroke-linecap", "round");
    chart.appendChild(polyline);
    series.points.forEach(point => {
      const marker = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      marker.setAttribute("cx", String(xFor(point)));
      marker.setAttribute("cy", String(yFor(point.value)));
      marker.setAttribute("r", "4");
      marker.setAttribute("fill", "currentColor");
      chart.appendChild(marker);
    });
    const startLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
    startLabel.setAttribute("x", String(chartLeft));
    startLabel.setAttribute("y", "174");
    startLabel.setAttribute("font-size", "11");
    startLabel.textContent = new Date(firstTime).toLocaleDateString();
    chart.appendChild(startLabel);
    const endLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
    endLabel.setAttribute("x", String(chartRight));
    endLabel.setAttribute("y", "174");
    endLabel.setAttribute("text-anchor", "end");
    endLabel.setAttribute("font-size", "11");
    endLabel.textContent = new Date(lastTime).toLocaleDateString();
    chart.appendChild(endLabel);
    timeSeriesSection.appendChild(chart);
  });

  if (!sortedTimeSeries.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Aucune série chronologique exploitable pour les cultures sélectionnées.";
    timeSeriesSection.appendChild(empty);
  }
  if (measurementsWithInvalidTime) {
    const invalidTimeNote = document.createElement("p");
    invalidTimeNote.className = "muted";
    invalidTimeNote.textContent = measurementsWithInvalidTime +
      " mesure(s) numérique(s) ignorée(s) dans les séries : date non exploitable.";
    timeSeriesSection.appendChild(invalidTimeNote);
  }
  target.appendChild(timeSeriesSection);

  // External environmental data is matched by the explicit culture -> environment
  // -> location mapping returned by the tenant-scoped comparison RPC. It is never
  // merged into culture measurements or described as a direct culture reading.
  const environmentalContextSection = document.createElement("section");
  environmentalContextSection.className = "generation-comparison-section";
  const environmentalContextTitle = document.createElement("h5");
  environmentalContextTitle.textContent = "Contexte environnemental par lieu";
  environmentalContextSection.appendChild(environmentalContextTitle);
  const environmentalContextNote = document.createElement("p");
  environmentalContextNote.className = "muted";
  environmentalContextNote.textContent = "Les séries ci-dessous sont des données environnementales externes associées au lieu enregistré de chaque culture. Elles ne sont pas des mesures directes de la culture. Les données météo ou satellitaires à maille spatiale décrivent un contexte géographique, pas nécessairement le microclimat du contenant, de la serre ou de la salle.";
  environmentalContextSection.appendChild(environmentalContextNote);

  const cultureEnvironmentContext = Array.isArray(report.culture_environment_context)
    ? report.culture_environment_context : [];
  const environmentalObservations = Array.isArray(report.environmental_observations)
    ? report.environmental_observations : [];
  const contextsByLocation = new Map();
  cultureEnvironmentContext.forEach(context => {
    if (!context.location_id) return;
    if (!contextsByLocation.has(context.location_id)) {
      contextsByLocation.set(context.location_id, {
        locationCode: context.location_code || context.location_name || context.location_id,
        locationName: context.location_name || "Lieu sans nom",
        latitude: context.latitude,
        longitude: context.longitude,
        coordinateAccuracy: context.coordinate_accuracy_m,
        coordinateSource: context.coordinate_source,
        environments: new Set(),
        cultures: new Set(),
        contextRelations: new Set(),
        batchCodes: new Set()
      });
    }
    const locationContext = contextsByLocation.get(context.location_id);
    locationContext.cultures.add(cultureCodes.get(context.culture_id) || context.culture_id);
    if (context.environment_name) locationContext.environments.add(context.environment_name);
    if (context.context_relation) locationContext.contextRelations.add(context.context_relation);
    if (context.batch_code) locationContext.batchCodes.add(context.batch_code);
  });

  const environmentalSeriesGroups = new Map();
  let environmentalRowsWithoutNumericValue = 0;
  let environmentalRowsWithoutTime = 0;
  environmentalObservations.forEach(row => {
    if (!row.location_id || !contextsByLocation.has(row.location_id)) return;
    const value = row.value == null ? NaN : Number(row.value);
    const timestamp = row.observed_at ? Date.parse(row.observed_at) : NaN;
    if (!Number.isFinite(value)) {
      environmentalRowsWithoutNumericValue += 1;
      return;
    }
    if (!Number.isFinite(timestamp)) {
      environmentalRowsWithoutTime += 1;
      return;
    }
    const key = [
      row.location_id, row.data_family || "famille inconnue",
      row.provider_code || "source inconnue", row.dataset_code || "jeu inconnu",
      row.variable_code || "variable inconnue", row.unit_code || "unité non renseignée",
      row.quality_flag || "qualité non renseignée"
    ].join("||");
    if (!environmentalSeriesGroups.has(key)) {
      environmentalSeriesGroups.set(key, {
        locationId: row.location_id,
        dataFamily: row.data_family || "famille inconnue",
        provider: row.provider_code || "source inconnue",
        dataset: row.dataset_code || "jeu inconnu",
        variable: row.variable_code || "variable inconnue",
        unit: row.unit_code || "unité non renseignée",
        quality: row.quality_flag || "qualité non renseignée",
        resolution: row.spatial_resolution_m,
        points: []
      });
    }
    environmentalSeriesGroups.get(key).points.push({
      id: row.id || "",
      timestamp,
      value,
      retrievedAt: row.retrieved_at || null,
      sourceUrl: row.source_url || null
    });
  });

  const environmentalFormat = value => new Intl.NumberFormat(undefined, {
    maximumSignificantDigits: 5
  }).format(value);
  const locationsWithObservations = new Set();
  [...environmentalSeriesGroups.values()].sort((a, b) =>
    String(contextsByLocation.get(a.locationId)?.locationCode || "").localeCompare(
      String(contextsByLocation.get(b.locationId)?.locationCode || "")
    ) || a.variable.localeCompare(b.variable)
  ).forEach(series => {
    series.points.sort((a, b) => a.timestamp - b.timestamp ||
      String(a.id).localeCompare(String(b.id)));
    const location = contextsByLocation.get(series.locationId);
    if (!location) return;
    locationsWithObservations.add(series.locationId);

    const heading = document.createElement("h6");
    heading.textContent = location.locationCode + " — " + series.variable +
      " · " + series.unit + " · " + series.dataFamily +
      " · " + series.points.length + " observation(s)";
    environmentalContextSection.appendChild(heading);

    const provenance = document.createElement("p");
    provenance.className = "muted";
    const resolutionLabel = series.resolution == null
      ? "résolution spatiale non renseignée"
      : "résolution spatiale : " + environmentalFormat(series.resolution) + " m";
    provenance.textContent = "Lieu : " + location.locationName +
      " · Cultures associées : " + [...location.cultures].join(", ") +
      " · Lien de contexte : " + ([...location.contextRelations].map(relation => ({
        culture_environment: "environnement déclaré sur la culture",
        linked_batch_environment: "environnement d'un lot lié",
        linked_batch_location: "lieu déclaré sur un lot lié"
      })[relation] || relation).join(", ") || "origine non précisée") +
      (location.batchCodes.size ? " · Lots liés : " + [...location.batchCodes].join(", ") : "") +
      " · Environnements : " + ([...location.environments].join(", ") || "non renseigné") +
      " · Source : " + series.provider + " / " + series.dataset +
      " · " + resolutionLabel +
      " · précision déclarée des coordonnées : " +
      (location.coordinateAccuracy == null
        ? "non renseignée"
        : "±" + environmentalFormat(location.coordinateAccuracy) + " m") +
      " · origine des coordonnées : " + (location.coordinateSource || "non renseignée") +
      " · Qualité source : " + series.quality;
    environmentalContextSection.appendChild(provenance);

    const latestPoints = series.points.slice(-20).reverse();
    const table = document.createElement("table");
    table.className = "statistics-table";
    const head = document.createElement("thead");
    const headerRow = document.createElement("tr");
    ["Date d'observation", "Valeur", "Récupérée le", "Source"].forEach(label => {
      const th = document.createElement("th");
      th.textContent = label;
      headerRow.appendChild(th);
    });
    head.appendChild(headerRow);
    table.appendChild(head);
    const body = document.createElement("tbody");
    latestPoints.forEach(point => {
      const cells = [
        new Date(point.timestamp).toLocaleString(),
        environmentalFormat(point.value) + " " + series.unit,
        point.retrievedAt ? new Date(point.retrievedAt).toLocaleString() : "Non renseignée",
        point.sourceUrl || series.provider
      ];
      const rowElement = document.createElement("tr");
      cells.forEach(value => {
        const cell = document.createElement("td");
        cell.textContent = value;
        rowElement.appendChild(cell);
      });
      body.appendChild(rowElement);
    });
    table.appendChild(body);
    environmentalContextSection.appendChild(table);
    if (series.points.length > 20) {
      const truncationNote = document.createElement("p");
      truncationNote.className = "muted";
      truncationNote.textContent = "Tableau limité aux 20 observations les plus récentes ; le graphique conserve les " +
        series.points.length + " observations retournées.";
      environmentalContextSection.appendChild(truncationNote);
    }

    const chart = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    chart.setAttribute("viewBox", "0 0 720 160");
    chart.setAttribute("role", "img");
    chart.setAttribute("aria-label", "Contexte environnemental du lieu " +
      location.locationCode + " : " + series.variable + ", " +
      series.points.length + " observations");
    chart.setAttribute("preserveAspectRatio", "xMidYMid meet");
    chart.style.width = "100%";
    chart.style.height = "auto";
    chart.style.maxHeight = "190px";
    const chartTitle = document.createElementNS("http://www.w3.org/2000/svg", "title");
    chartTitle.textContent = "Contexte environnemental — " + location.locationCode +
      " — " + series.variable;
    chart.appendChild(chartTitle);
    const values = series.points.map(point => point.value);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const padding = maxValue === minValue
      ? Math.max(Math.abs(maxValue) * 0.05, 1)
      : (maxValue - minValue) * 0.08;
    const left = 54, right = 690, top = 14, bottom = 118;
    const firstTime = series.points[0].timestamp;
    const lastTime = series.points[series.points.length - 1].timestamp;
    const xFor = point => lastTime === firstTime ? (left + right) / 2 :
      left + ((point.timestamp - firstTime) / (lastTime - firstTime)) * (right - left);
    const yFor = value => bottom - ((value - (minValue - padding)) /
      ((maxValue + padding) - (minValue - padding))) * (bottom - top);
    const axis = document.createElementNS("http://www.w3.org/2000/svg", "path");
    axis.setAttribute("d", "M " + left + " " + top + " V " + bottom + " H " + right);
    axis.setAttribute("fill", "none");
    axis.setAttribute("stroke", "currentColor");
    axis.setAttribute("stroke-opacity", "0.45");
    chart.appendChild(axis);
    const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    polyline.setAttribute("points", series.points.map(point =>
      xFor(point) + "," + yFor(point.value)
    ).join(" "));
    polyline.setAttribute("fill", "none");
    polyline.setAttribute("stroke", "currentColor");
    polyline.setAttribute("stroke-width", "2.5");
    polyline.setAttribute("stroke-linejoin", "round");
    polyline.setAttribute("stroke-linecap", "round");
    chart.appendChild(polyline);
    const startLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
    startLabel.setAttribute("x", String(left));
    startLabel.setAttribute("y", "145");
    startLabel.setAttribute("font-size", "11");
    startLabel.textContent = new Date(firstTime).toLocaleDateString();
    chart.appendChild(startLabel);
    const endLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
    endLabel.setAttribute("x", String(right));
    endLabel.setAttribute("y", "145");
    endLabel.setAttribute("text-anchor", "end");
    endLabel.setAttribute("font-size", "11");
    endLabel.textContent = new Date(lastTime).toLocaleDateString();
    chart.appendChild(endLabel);
    environmentalContextSection.appendChild(chart);
  });

  contextsByLocation.forEach((location, locationId) => {
    if (locationsWithObservations.has(locationId)) return;
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = location.locationCode +
      " : aucune observation environnementale retournée pour ce lieu dans le périmètre disponible.";
    environmentalContextSection.appendChild(empty);
  });
  const contextsWithoutLocation = cultureEnvironmentContext.filter(context => !context.location_id);
  if (contextsWithoutLocation.length) {
    const missingLocation = document.createElement("p");
    missingLocation.className = "muted";
    missingLocation.textContent = contextsWithoutLocation.length +
      " environnement(s) de culture sans lieu géographique associé : aucune donnée externe ne leur est attribuée.";
    environmentalContextSection.appendChild(missingLocation);
  }
  if (!cultureEnvironmentContext.length) {
    const noContext = document.createElement("p");
    noContext.className = "muted";
    noContext.textContent = "Aucun environnement explicitement associé aux cultures sélectionnées. Aucune donnée météo ou satellite ne peut être rapprochée sans lien de lieu enregistré.";
    environmentalContextSection.appendChild(noContext);
  }
  if (environmentalRowsWithoutNumericValue || environmentalRowsWithoutTime) {
    const quality = document.createElement("p");
    quality.className = "muted";
    quality.textContent = "Observations environnementales non représentées : " +
      environmentalRowsWithoutNumericValue + " valeur(s) absente(s) ou non numérique(s), " +
      environmentalRowsWithoutTime + " date(s) inexploitable(s).";
    environmentalContextSection.appendChild(quality);
  }
  target.appendChild(environmentalContextSection);

  // Monitoring is descriptive: sustained direction and robust deviations
  // are candidates for review, never automatic biological diagnoses.
  const monitoringSection = document.createElement("section");
  monitoringSection.className = "generation-comparison-section";
  const monitoringTitle = document.createElement("h5");
  monitoringTitle.textContent = "Surveillance temporelle";
  monitoringSection.appendChild(monitoringTitle);
  const monitoringNote = document.createElement("p");
  monitoringNote.className = "muted";
  monitoringNote.textContent = "Repérage descriptif sur séries chronologiques comparables. Une rupture candidate nécessite 5 relevés (4 de référence + le dernier). Une tendance monotone candidate nécessite 9 relevés (4 de référence + 5 récents). Les candidats nécessitent une vérification du protocole, des conditions de mesure et du cahier de laboratoire ; aucun seuil biologique universel n'est supposé.";
  monitoringSection.appendChild(monitoringNote);

  let monitoringSeriesCount = 0;
  let trendCandidates = 0;
  let ruptureCandidates = 0;
  const medianOf = values => {
    const sorted = values.slice().sort((a, b) => a - b);
    if (!sorted.length) return NaN;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] :
      (sorted[middle - 1] + sorted[middle]) / 2;
  };
  sortedTimeSeries.forEach(series => {
    if (series.points.length < 5) {
      const insufficient = document.createElement("p");
      insufficient.className = "muted";
      insufficient.textContent = series.culture + " / " + series.variable +
        " : minimum de 5 relevés requis pour la surveillance (actuel : " +
        series.points.length + ").";
      monitoringSection.appendChild(insufficient);
      return;
    }
    monitoringSeriesCount += 1;
    const values = series.points.map(point => point.value);
    const recent = values.slice(-5);
    const deltas = recent.slice(1).map((value, index) => value - recent[index]);
    const increasing = deltas.every(delta => delta > 0);
    const decreasing = deltas.every(delta => delta < 0);
    const baseline = values.slice(-9, -5);
    if (baseline.length < 4) {
      const note = document.createElement("p");
      note.className = "muted";
      note.textContent = series.culture + " / " + series.variable +
        " : tendance monotone non évaluée — 9 relevés requis (actuel : " +
        series.points.length + ").";
      monitoringSection.appendChild(note);
    }
    if (baseline.length === 4 && (increasing || decreasing)) {
      const baselineMedian = medianOf(baseline);
      const deviations = baseline.map(value => Math.abs(value - baselineMedian));
      const mad = medianOf(deviations);
      const netChange = Math.abs(recent[4] - recent[0]);
      if (mad > 0) {
        const threshold = 3 * mad;
        if (netChange > threshold) {
          trendCandidates += 1;
          const item = document.createElement("p");
          item.textContent = series.culture + " / " + series.variable +
            " : tendance monotone candidate (" + (increasing ? "hausse" : "baisse") +
            ") sur 5 relevés · variation nette " +
            timeSeriesFormat(recent[4] - recent[0]) + " " + series.unit +
            " · référence MAD " + timeSeriesFormat(mad) + ".";
          monitoringSection.appendChild(item);
        }
      } else {
        const note = document.createElement("p");
        note.className = "muted";
        note.textContent = series.culture + " / " + series.variable +
          " : tendance non qualifiée par MAD (MAD nul sur la référence ; seuil robuste non estimable sans tolérance de protocole).";
        monitoringSection.appendChild(note);
      }
    }

    const previousValues = values.slice(-5, -1);
    const currentValue = values[values.length - 1];
    const baselineMedian = medianOf(previousValues);
    const mad = medianOf(previousValues.map(value => Math.abs(value - baselineMedian)));
    const deviation = Math.abs(currentValue - baselineMedian);
    if (mad > 0) {
      const ruptureThreshold = 3 * mad;
      if (deviation > ruptureThreshold) {
        ruptureCandidates += 1;
        const item = document.createElement("p");
        item.textContent = series.culture + " / " + series.variable +
          " : rupture candidate au dernier relevé · valeur " +
          timeSeriesFormat(currentValue) + " " + series.unit +
          " · médiane des 4 relevés précédents " +
          timeSeriesFormat(baselineMedian) + " · MAD " +
          timeSeriesFormat(mad) + ".";
        monitoringSection.appendChild(item);
      }
    } else {
      const note = document.createElement("p");
      note.className = "muted";
      note.textContent = series.culture + " / " + series.variable +
        " : rupture non qualifiée par MAD (MAD nul sur la référence ; seuil robuste non estimable sans tolérance de protocole).";
      monitoringSection.appendChild(note);
    }
  });

  if (!monitoringSeriesCount) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Aucune série ne comporte au moins 5 relevés valides pour activer la surveillance temporelle.";
    monitoringSection.appendChild(empty);
  } else if (!trendCandidates && !ruptureCandidates) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Aucune tendance monotone ou rupture candidate détectée dans les séries évaluables.";
    monitoringSection.appendChild(empty);
  }
  const monitoringSummary = document.createElement("p");
  monitoringSummary.className = "muted";
  monitoringSummary.textContent = monitoringSeriesCount +
    " série(s) avec au moins 5 relevés · " + trendCandidates +
    " tendance(s) monotone(s) candidate(s) · " + ruptureCandidates +
    " rupture(s) candidate(s). Ce repérage ne modifie pas les mesures et ne constitue pas un diagnostic biologique.";
  monitoringSection.appendChild(monitoringSummary);
  target.appendChild(monitoringSection);

  sections.forEach(([key, title]) => {
    const rows = Array.isArray(report[key]) ? report[key] : [];
    const section = document.createElement("section");
    section.className = "generation-comparison-section";
    const h = document.createElement("h5");
    h.textContent = title + " (" + rows.length + ")";
    section.appendChild(h);
    if (!rows.length) {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = "Aucune donnée enregistrée pour cette catégorie.";
      section.appendChild(empty);
    } else {
      rows.forEach((row, index) => {
        const details = document.createElement("details");
        details.className = "generation-comparison-record";
        const summary = document.createElement("summary");
        const identity = row.code || row.culture_code || row.batch_code ||
          row.variable_code || row.event_type || row.result_type || row.dataset_code ||
          row.material_code || ("Enregistrement " + (index + 1));
        summary.textContent = format(identity);
        details.appendChild(summary);
        const dl = document.createElement("dl");
        Object.entries(row).forEach(([field, value]) => {
          if (field === "organization_id" || field === "id" || value === null || value === undefined) return;
          const dt = document.createElement("dt");
          dt.textContent = fieldLabels[field] || field.replaceAll("_", " ");
          const dd = document.createElement("dd");
          if (field === "culture_id" || field === "selected_culture_id" ||
              field === "ancestor_culture_id" || field === "parent_culture_id") {
            dd.textContent = cultureCodes.get(value) || format(value);
          } else {
            dd.textContent = format(value);
          }
          dl.append(dt, dd);
        });
        details.appendChild(dl);
        section.appendChild(details);
      });
    }
    target.appendChild(section);
  });

  const quality = report.data_quality || {};
  const qualitySection = document.createElement("section");
  qualitySection.className = "generation-comparison-quality";
  const qualityTitle = document.createElement("h5");
  qualityTitle.textContent = "Complétude et qualité des données";
  qualitySection.appendChild(qualityTitle);
  const qualityList = document.createElement("dl");
  Object.entries(quality).forEach(([key, value]) => {
    const dt = document.createElement("dt");
    dt.textContent = key.replaceAll("_", " ");
    const dd = document.createElement("dd");
    dd.textContent = format(value);
    qualityList.append(dt, dd);
  });
  qualitySection.appendChild(qualityList);
  target.appendChild(qualitySection);
}

async function compareCultureGenerations() {
  const results = document.getElementById("generationComparisonResults");
  if (!results) return;
  const requestId = (results.__generationComparisonRequestId || 0) + 1;
  results.__generationComparisonRequestId = requestId;
  const revision = authStateRevision;
  const orgId = organizationId;
  const panel = document.getElementById("cultureDetailPanel");
  const options = document.getElementById("generationComparisonOptions");
  const button = document.getElementById("compareCultureGenerationsButton");
  const status = document.getElementById("generationComparisonStatus");
  if (!panel || !options || !button || !status || !orgId) return;
  const cultureIds = [...options.querySelectorAll("input[type=checkbox]:checked")].map(option => option.value);
  const selectedDetailCultureId = panel.dataset.cultureId;
  if (cultureIds.length < 2 || cultureIds.length > 4) {
    status.textContent = "Sélectionnez entre 2 et 4 cultures.";
    return;
  }
  button.disabled = true;
  status.textContent = "Construction du rapport comparatif…";
  results.replaceChildren();
  try {
    const { data, error } = await supabaseClient.rpc("compare_culture_generations", {
      p_organization_id: orgId,
      p_culture_ids: cultureIds
    });
    if (error) throw error;
    if (requestId !== results.__generationComparisonRequestId ||
        !isCurrentWorkspaceRevision(revision, orgId) ||
        panel.dataset.cultureId !== selectedDetailCultureId) return;
    renderGenerationComparisonReport(data || {});
    status.textContent = "Rapport comparatif chargé. Les résultats sont descriptifs et les limites de données sont indiquées ci-dessous.";
  } catch (error) {
    if (requestId !== results.__generationComparisonRequestId ||
        !isCurrentWorkspaceRevision(revision, orgId)) return;
    console.error("Comparaison intergénérationnelle :", error);
    status.textContent = "Impossible de construire le rapport : " + (error.message || "erreur inconnue");
  } finally {
    if (requestId === results.__generationComparisonRequestId) button.disabled = false;
  }
}

async function loadCultureDetail(cultureId) {
  const requestId = ++cultureDetailRequestId;
  const loadRevision = authStateRevision;
  const loadOrganizationId = organizationId;
  const culture = cultureOptions.find(item => item.id === cultureId);
  const panel = document.getElementById("cultureDetailPanel");
  const title = document.getElementById("cultureDetailTitle");
  const meta = document.getElementById("cultureDetailMeta");
  const summary = document.getElementById("cultureDetailSummary");
  const timeline = document.getElementById("cultureDetailTimeline");
  if (!culture || !panel || !title || !meta || !summary || !timeline) return;

  panel.dataset.cultureId = culture.id;
  const comparisonResults = document.getElementById("generationComparisonResults");
  if (comparisonResults) {
    comparisonResults.__generationComparisonRequestId = (comparisonResults.__generationComparisonRequestId || 0) + 1;
    comparisonResults.replaceChildren();
  }
  const comparisonButton = document.getElementById("compareCultureGenerationsButton");
  if (comparisonButton) comparisonButton.disabled = false;
  populateGenerationComparisonOptions(culture.id);
  document.getElementById("generationComparisonStatus").textContent = "Choisissez au moins une autre culture pour comparer les générations.";
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
      .eq("organization_id", loadOrganizationId)
      .eq("culture_id", culture.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (batchesError) throw new Error("Lots liés à la culture : " + batchesError.message);
    if (requestId !== cultureDetailRequestId || !isCurrentWorkspaceRevision(loadRevision, loadOrganizationId)) return;

    const batches = cultureBatches || [];
    const { data: eventHistory, error: eventHistoryError } = await supabaseClient.rpc("get_culture_event_history", {
      p_organization_id: loadOrganizationId,
      p_culture_id: culture.id,
      p_limit: 100,
      p_offset: 0
    });
    if (eventHistoryError) throw new Error("Événements : " + eventHistoryError.message);
    if (requestId !== cultureDetailRequestId || !isCurrentWorkspaceRevision(loadRevision, loadOrganizationId)) return;
    const events = (eventHistory || []).map(row => ({
      id: row.event_id,
      event_type: row.event_type,
      occurred_at: row.occurred_at,
      batch_id: row.batch_id,
      source_relation: row.source_relation,
      payload: row.payload
    }));
    const linkedEventIds = events.map(event => event.id);
    const measurementQueries = [
      supabaseClient.from("measurements").select("id, variable_code, raw_value, raw_unit_code, measured_at, event_id, metadata")
        .eq("organization_id", loadOrganizationId).eq("culture_id", culture.id)
        .order("measured_at", { ascending: false }).limit(100)
    ];
    const observationQueries = [
      supabaseClient.from("observations").select("id, variable_code, value_text, observed_at, event_id, metadata")
        .eq("organization_id", loadOrganizationId).eq("culture_id", culture.id)
        .order("observed_at", { ascending: false }).limit(100)
    ];
    if (linkedEventIds.length) {
      measurementQueries.push(
        supabaseClient.from("measurements").select("id, variable_code, raw_value, raw_unit_code, measured_at, event_id, metadata")
          .eq("organization_id", loadOrganizationId).in("event_id", linkedEventIds)
          .order("measured_at", { ascending: false }).limit(100)
      );
      observationQueries.push(
        supabaseClient.from("observations").select("id, variable_code, value_text, observed_at, event_id, metadata")
          .eq("organization_id", loadOrganizationId).in("event_id", linkedEventIds)
          .order("observed_at", { ascending: false }).limit(100)
      );
    }
    const [measurementResults, observationResults] = await Promise.all([
      Promise.all(measurementQueries), Promise.all(observationQueries)
    ]);
    if (requestId !== cultureDetailRequestId || !isCurrentWorkspaceRevision(loadRevision, loadOrganizationId)) return;
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
        type: (event.source_relation === "creation_operation" ? "Opération de création · " :
          event.source_relation === "descendant_culture" ? "Création d’une culture fille · " : "") +
          String(event.event_type || "Événement").replaceAll("_", " "),
        detail: [
          event.source_relation === "creation_operation" ? "Opération à l’origine de cette culture" :
          event.source_relation === "descendant_culture" ? "Culture fille créée depuis cette culture par génération directe" : null,
          event.payload?.parent_culture_code ? "Culture parent : " + event.payload.parent_culture_code : null,
          event.payload?.material_code ? "Matériel : " + event.payload.material_code : null,
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
    if (fields[4]) fields[4].textContent = String(eventHistory?.[0]?.total_rows ?? events.length);
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
    if (measurements.length >= 100 || observations.length >= 100 || batches.length === 100) {
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
        article.dataset.cultureEventEntry = "true";
        article.dataset.sortTimestamp = String(new Date(entry.date || 0).getTime() || 0);
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
      sortCultureEventTimelineEntries(timeline);
    }
    const historyHasMore = eventHistory?.some(row => row.has_more === true) === true;
    if (historyHasMore) {
      const loadMoreButton = document.createElement("button");
      loadMoreButton.type = "button";
      loadMoreButton.className = "culture-catalog-action";
      loadMoreButton.textContent = "Charger 100 événements plus anciens";
      loadMoreButton.onclick = () =>
        loadMoreCultureEventHistory(culture.id, events.length, loadMoreButton);
      timeline.appendChild(loadMoreButton);
    }
    panel.scrollIntoView({block:"start",behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"});
  } catch (error) {
    if (requestId !== cultureDetailRequestId || !isCurrentWorkspaceRevision(loadRevision, loadOrganizationId)) return;
    if (requestId !== cultureDetailRequestId || !isCurrentWorkspaceRevision(loadRevision, loadOrganizationId)) return;
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

  const domain = document.body.dataset.domain;
  const cultureMetricLabel = cultureCount.closest(".overview-metric")?.querySelector(".overview-metric-label");
  const batchMetric = batchCount.closest(".overview-metric");
  const observationMetricLabel = observationCount.closest(".overview-metric")?.querySelector(".overview-metric-label");
  if (domain === "agronomy") {
    cultureCount.textContent = String(plantCultureOptions.length);
    if (cultureMetricLabel) cultureMetricLabel.textContent = "Fiches végétales";
    if (batchMetric) batchMetric.hidden = true;
    if (observationMetricLabel) observationMetricLabel.textContent = "Observations récentes";
  } else {
    cultureCount.textContent = String(cultureOptions.length);
    if (cultureMetricLabel) cultureMetricLabel.textContent = domain === "mycology" ? "Cultures mycologiques" : "Cultures de laboratoire";
    if (batchMetric) batchMetric.hidden = false;
    if (observationMetricLabel) observationMetricLabel.textContent = domain === "mycology" ? "Observations mycologiques" : "Observations récentes";
  }
  batchCount.textContent = String(latestBatches.length);
  observationCount.textContent = String(recentObservations.length);

  // These meters show the share of the current fetch limit used, not database completeness.
  const meterSpecs = [
    { id: "overviewCultureMeter", value: cultureCount.textContent, limit: 100, note: "overviewCultureNote", track: cultureCount.closest(".overview-metric")?.querySelector(".overview-meter") },
    { id: "overviewBatchMeter", value: batchCount.textContent, limit: 30, note: "overviewBatchNote", track: batchCount.closest(".overview-metric")?.querySelector(".overview-meter") },
    { id: "overviewObservationMeter", value: observationCount.textContent, limit: 8, note: "overviewObservationNote", track: observationCount.closest(".overview-metric")?.querySelector(".overview-meter") }
  ];
  meterSpecs.forEach(({ id, value, limit, note, track }) => {
    const count = Math.max(0, Number(value) || 0);
    const percent = Math.min(100, Math.round((count / limit) * 100));
    const fill = document.getElementById(id);
    if (fill) fill.style.width = percent + "%";
    if (track) track.setAttribute("aria-valuenow", String(Math.min(count, limit)));
    const noteElement = document.getElementById(note);
    if (noteElement) noteElement.textContent = count + " chargé(s) · limite technique " + limit;
  });

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
    agronomy: ["overviewCard", "plantCard", "measurementCard", "statisticsCard"],
    mycology: ["overviewCard", "trackerCard", "measurementCard", "statisticsCard"],
    laboratory: ["overviewCard", "trackerCard", "batchCard", "measurementCard", "statisticsCard"]
  };
  const activeDomain = document.body.dataset.domain;
  const modules = modulesByDomain[activeDomain] || modulesByDomain.laboratory;
  document.getElementById("trackerCard")?.classList.toggle("workspace-inactive", activeDomain === "agronomy");
  document.getElementById("plantCard")?.classList.toggle("workspace-inactive", activeDomain !== "agronomy");
  document.getElementById("batchCard")?.classList.toggle("workspace-inactive", activeDomain !== "laboratory");
  document.querySelectorAll("[data-domain-nav]").forEach(link => {
    link.hidden = link.dataset.domainNav === "agronomy" ? activeDomain !== "agronomy" : activeDomain === "agronomy";
  });
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
      if (target === "#overviewCard" || target === "#trackerCard" || target === "#plantCard" || target === "#batchCard" || target === "#measurementCard" || target === "#statisticsCard") {
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
    document.querySelectorAll("[data-domain-nav='biological']").forEach(el => el.hidden = true);
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
  document.getElementById("statisticsVariable")?.addEventListener("change", () => { document.getElementById("statisticsStatus").textContent = "Variable modifiée. Lancez l’analyse pour actualiser les résultats."; });
  document.getElementById("statisticsCulture")?.addEventListener("change", () => { document.getElementById("statisticsStatus").textContent = "Culture modifiée. Lancez l’analyse pour actualiser les résultats."; });
  document.getElementById("statisticsBatch")?.addEventListener("change", () => { document.getElementById("statisticsStatus").textContent = "Lot modifié. Lancez l’analyse pour actualiser les résultats."; });
  document.getElementById("statisticsPeriod")?.addEventListener("change", () => { document.getElementById("statisticsStatus").textContent = "Période modifiée. Lancez l’analyse pour actualiser les résultats."; });
  document.getElementById("cultureSearch")?.addEventListener("input", renderCultureCatalog);
  document.getElementById("cultureTypeFilter")?.addEventListener("change", renderCultureCatalog);
  document.getElementById("bioOperationForm")?.addEventListener("submit", saveBiologicalOperation);
  document.getElementById("compareCultureGenerationsButton")?.addEventListener("click", compareCultureGenerations);
  document.getElementById("generationComparisonSearch")?.addEventListener("input", filterGenerationComparisonOptions);

  document.getElementById("bioOperationDate")?.setAttribute("value", new Date().toISOString().slice(0,16));
  document.getElementById("closeCultureDetail")?.addEventListener("click", () => {
    invalidateGenerationComparison("Comparaison fermée.");
    document.getElementById("cultureDetailPanel")?.classList.add("hidden");
  });

  measurementVariableSelect.addEventListener("change", updateMeasurementUnits);
  saveMeasurementButton.addEventListener("click", saveMeasurement);
  saveObservationButton.addEventListener("click", saveObservation);
  reloadMeasurementsButton.addEventListener("click", () => {
    const operationRevision = authStateRevision;
    const operationOrganizationId = organizationId;
    loadRecentMeasurements().catch(error => {
      if (!isCurrentWorkspaceRevision(operationRevision, operationOrganizationId)) return;
      showMessage(error.message, "error");
    });
  });

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

/* ============================================================
   AGRITECH — REGISTRE DES CULTURES VEGETALES
   ============================================================ */

const PLANT_CROP_OPTIONS = {
  tomato_cherry: { label: "Tomate cerise", species: "Solanum lycopersicum", cultivars: ["Yellow Pear", "Cerise — variété non précisée"] },
  tomato: { label: "Tomate", species: "Solanum lycopersicum", cultivars: ["Marmande", "Variété non précisée"] },
  zucchini: { label: "Courgette", species: "Cucurbita pepo", cultivars: ["Quarantaine", "Diamant", "Variété non précisée"] },
  basil: { label: "Basilic", species: "Ocimum basilicum", cultivars: ["Variété non précisée"] },
  mint: { label: "Menthe", species: "Mentha sp.", cultivars: ["Variété non précisée"] },
  long_bean: { label: "Haricot kilomètre", species: "Vigna unguiculata subsp. sesquipedalis", cultivars: ["Variété non précisée"] },
  pattypan_squash: { label: "Pâtisson", species: "Cucurbita pepo", cultivars: ["Pâtisson blanc", "Variété non précisée"] },
  luffa: { label: "Luffa", species: "Luffa aegyptiaca", cultivars: ["Variété non précisée"] },
  bottle_gourd: { label: "Gourde pèlerine", species: "Lagenaria siceraria", cultivars: ["Gourde pèlerine"] },
  other: { label: "Autre culture", species: "À préciser", cultivars: ["Variété non précisée"] }
};

function setupPlantRegistry() {
  const form = document.getElementById("plantCultureForm");
  const crop = document.getElementById("plantCropType");
  const cultivar = document.getElementById("plantCultivar");
  const location = document.getElementById("plantLocation");
  const environment = document.getElementById("plantEnvironment");
  if (!form || !crop || !cultivar) return;

  const updateCultivarSuggestions = () => {
    const selected = PLANT_CROP_OPTIONS[crop.value];
    const list = document.getElementById("plantCultivarOptions");
    if (!list) return;
    list.replaceChildren();
    (selected?.cultivars || []).forEach(name => {
      const option = document.createElement("option");
      option.value = name;
      list.appendChild(option);
    });
    if (cultivar.value && !(selected?.cultivars || []).includes(cultivar.value)) cultivar.value = "";
    if (selected?.cultivars.length === 1 && !cultivar.value) cultivar.value = selected.cultivars[0];
  };
  const renderPlantEnvironments = () => {
    if (!environment) return;
    const previous = environment.value;
    const locationId = location?.value || "";
    const available = batchEnvironmentOptions.filter(item =>
      locationId ? (!item.location_id || item.location_id === locationId) : !item.location_id
    );
    environment.replaceChildren();
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Non précisé";
    environment.appendChild(placeholder);
    available.forEach(item => {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = item.name || item.id;
      environment.appendChild(option);
    });
    environment.value = available.some(item => item.id === previous) ? previous : "";
  };
  crop.addEventListener("change", updateCultivarSuggestions);
  location?.addEventListener("change", renderPlantEnvironments);
  form.addEventListener("submit", savePlantCulture);
  populatePlantLocationOptions();
  updateCultivarSuggestions();
  renderPlantEnvironments();
}

function populatePlantLocationOptions() {
  const location = document.getElementById("plantLocation");
  if (!location) return;
  const previous = location.value;
  location.replaceChildren();
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Non précisé";
  location.appendChild(placeholder);
  batchLocationOptions.forEach(item => {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.name || item.code || item.id;
    location.appendChild(option);
  });
  location.value = batchLocationOptions.some(item => item.id === previous) ? previous : "";
}

function renderPlantCultureList(rows) {
  plantCultureOptions = rows || [];
  const list = document.getElementById("plantCultureList");
  const count = document.getElementById("plantCultureCount");
  if (!list || !count) return;
  count.textContent = String(rows.length);
  list.replaceChildren();
  updateOverview();
  if (!rows.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Aucune culture végétale enregistrée. Ajoutez une plante ou un groupe de plantes ci-dessus.";
    list.appendChild(empty);
    return;
  }
  const statusLabels = { planned: "Planifiée", active: "En culture", harvested: "Récoltée", lost: "Perdue / arrêtée", archived: "Archivée" };
  rows.forEach(row => {
    const article = document.createElement("article");
    article.className = "culture-catalog-row";
    const main = document.createElement("div");
    main.className = "culture-catalog-main";
    const code = document.createElement("strong");
    code.className = "culture-catalog-code";
    code.textContent = row.code || "Unité végétale sans code";
    const meta = document.createElement("div");
    meta.className = "culture-catalog-meta";
    const crop = PLANT_CROP_OPTIONS[row.crop_type]?.label || row.crop_type || "Culture végétale";
    const details = document.createElement("span");
    details.textContent = crop + " · " + (row.cultivar_name || "Variété non renseignée") + " · " + row.quantity + " " + (row.unit_code || "plants");
    const place = document.createElement("span");
    const location = batchLocationOptions.find(item => item.id === row.location_id);
    const environment = batchEnvironmentOptions.find(item => item.id === row.environment_id);
    place.textContent = [location?.name, environment?.name, row.substrate].filter(Boolean).join(" · ") || "Emplacement / substrat non précisé";
    const status = document.createElement("span");
    status.textContent = statusLabels[row.status] || row.status || "État non renseigné";
    meta.append(details, place, status);
    if (row.started_at) {
      const date = document.createElement("span");
      date.textContent = "Démarrage : " + new Date(row.started_at).toLocaleDateString("fr-FR");
      meta.appendChild(date);
    }
    main.append(code, meta);
    article.appendChild(main);
    if (row.notes) {
      const notes = document.createElement("p");
      notes.className = "muted";
      notes.textContent = row.notes;
      article.appendChild(notes);
    }
    list.appendChild(article);
  });
}

async function loadPlantCultures() {
  const loadRevision = authStateRevision;
  const loadOrganizationId = organizationId;
  if (!loadOrganizationId) return;
  const requestedOrganizationId = organizationId;
  const requestedDomain = document.body.dataset.domain;
  const status = document.getElementById("plantCultureStatus");
  try {
    const data = await loadOrganizationRowsInPages(
      "plant_cultures",
      "id,code,crop_type,species_name,cultivar_name,quantity,unit_code,location_id,environment_id,substrate,started_at,status,notes",
      "Chargement du registre végétal impossible"
    );
    if (!isCurrentWorkspaceRevision(loadRevision, loadOrganizationId) ||
        requestedOrganizationId !== organizationId ||
        requestedDomain !== document.body.dataset.domain ||
        requestedDomain !== "agronomy") return;
    renderPlantCultureList(data || []);
    plantCultureOptions = data || [];
    renderMeasurementTargets();
    renderStatisticsFilters();
    if (status) status.textContent = "Registre végétal chargé depuis Supabase.";
  } catch (error) {
    if (!isCurrentWorkspaceRevision(loadRevision, loadOrganizationId) ||
        requestedOrganizationId !== organizationId ||
        requestedDomain !== document.body.dataset.domain ||
        requestedDomain !== "agronomy") return;
    console.error("Chargement du registre végétal impossible :", error);
    initializationWarnings.push("registre végétal");
    if (status) status.textContent = "Registre végétal indisponible : " + (error.message || "erreur inconnue");
    const list = document.getElementById("plantCultureList");
    if (list) list.textContent = "Impossible de charger le registre végétal. Vérifiez que la migration est déployée puis rechargez la page.";
  }
}

async function savePlantCulture(event) {
  const operationRevision = authStateRevision;
  const operationOrganizationId = organizationId;

  event.preventDefault();
  if (!operationOrganizationId) {
    showMessage("Organisation absente : reconnectez-vous avant d’enregistrer une culture végétale.", "error");
    return;
  }
  const form = document.getElementById("plantCultureForm");
  const button = document.getElementById("savePlantCultureButton");
  const status = document.getElementById("plantCultureStatus");
  const cropType = document.getElementById("plantCropType").value;
  const crop = PLANT_CROP_OPTIONS[cropType];
  const code = document.getElementById("plantCode").value.trim();
  const cultivarName = document.getElementById("plantCultivar").value.trim();
  const quantity = Number(document.getElementById("plantQuantity").value);
  if (!crop || !code || !cultivarName || !Number.isInteger(quantity) || quantity < 1) {
    showMessage("Renseignez un code, une culture, une variété et une quantité entière positive.", "error");
    return;
  }
  button.disabled = true;
  const oldLabel = button.textContent;
  button.textContent = "Enregistrement…";
  if (status) status.textContent = "Enregistrement de la fiche végétale…";
  try {
    const startedValue = document.getElementById("plantStartedAt").value;
    if (!isCurrentWorkspaceRevision(operationRevision, operationOrganizationId)) throw new Error("Session ou espace de travail modifié pendant l’opération. Recommencez.");
    const { error } = await supabaseClient.from("plant_cultures").insert({
      organization_id: operationOrganizationId,
      code,
      crop_type: cropType,
      species_name: crop.species,
      cultivar_name: cultivarName,
      quantity,
      unit_code: "plants",
      location_id: document.getElementById("plantLocation").value || null,
      environment_id: document.getElementById("plantEnvironment").value || null,
      substrate: document.getElementById("plantSubstrate").value.trim() || null,
      started_at: startedValue ? new Date(startedValue).toISOString() : null,
      status: document.getElementById("plantStatus").value || "active",
      notes: document.getElementById("plantNotes").value.trim() || null,
      metadata: { source: "BA Labs CultureOps", domain: "agronomy", interface_version: "1.0" }
    });
    if (error) throw error;
    if (!isCurrentWorkspaceRevision(operationRevision, operationOrganizationId)) return;
    form.reset();
    document.getElementById("plantQuantity").value = "1";
    document.getElementById("plantStatus").value = "active";
    document.getElementById("plantCultivarOptions")?.replaceChildren();
    populatePlantLocationOptions();
    const plantEnvironment = document.getElementById("plantEnvironment");
    if (plantEnvironment) {
      plantEnvironment.replaceChildren();
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "Non précisé";
      plantEnvironment.appendChild(option);
    }
    await loadPlantCultures();
    showMessage("Culture végétale enregistrée.", "success");
    if (status) status.textContent = "Culture enregistrée dans le registre AgriTech.";
  } catch (error) {
    if (!isCurrentWorkspaceRevision(operationRevision, operationOrganizationId)) return;
    console.error("Enregistrement de la culture végétale impossible :", error);
    showMessage("Enregistrement impossible : " + (error.message || "erreur inconnue"), "error");
    if (status) status.textContent = "Échec de l’enregistrement. Vérifiez le code unique et les références.";
  } finally {
    if (isCurrentWorkspaceRevision(operationRevision, operationOrganizationId)) {
      button.disabled = false;
      button.textContent = oldLabel;
    }
  }
}

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
  let workspaceSwitchRevision = 0;
  const setDomain = (domain, persist = true) => {
    const switchRevision = ++workspaceSwitchRevision;
    const activeDomain = Object.hasOwn(modes, domain) ? domain : "agronomy";
    const config = modes[activeDomain];
    document.body.dataset.domain = activeDomain;
    buttons.forEach(button => button.setAttribute("aria-pressed", String(button.dataset.domainChoice === activeDomain)));
    if (heading) heading.textContent = config.heading;
    if (description) description.textContent = config.description;
    const cultureEntryTitle = document.getElementById("cultureEntryTitle");
    const strainLabel = document.getElementById("strainLabel");
    const cultureTypeLabel = document.getElementById("cultureTypeLabel");
    const entryLabels = {
      agronomy: { cultureTitle: "Nouvelle culture agronomique", strain: "Culture / ressource végétale source", cultureType: "Type de culture agronomique" },
      mycology: { cultureTitle: "Nouvelle culture fongique", strain: "Souche fongique source", cultureType: "Support / forme de culture" },
      laboratory: { cultureTitle: "Nouvelle culture de laboratoire", strain: "Souche / ressource biologique source", cultureType: "Format de culture au laboratoire" }
    }[activeDomain];
    if (cultureEntryTitle) cultureEntryTitle.textContent = entryLabels.cultureTitle;
    if (strainLabel?.firstChild) strainLabel.firstChild.textContent = entryLabels.strain;
    if (cultureTypeLabel?.firstChild) cultureTypeLabel.firstChild.textContent = entryLabels.cultureType;
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

    // A signed-in workspace switch must refresh its domain-scoped data, not only its labels.
    if (persist && organizationId) {
      const plantCard = document.getElementById("plantCard");
      if (activeDomain === "agronomy") {
        hideElement(trackerCard);
        hideElement(batchCard);
        showElement(plantCard);
      } else {
        showElement(trackerCard);
        if (activeDomain === "laboratory") showElement(batchCard);
        else hideElement(batchCard);
        hideElement(plantCard);
      }
      document.querySelectorAll('.section-nav a[href="#trackerCard"], [data-workspace-target="trackerCard"]')
        .forEach(element => { element.hidden = activeDomain === "agronomy"; });
      document.querySelectorAll('.section-nav a[href="#plantCard"], [data-workspace-target="plantCard"]')
        .forEach(element => { element.hidden = activeDomain !== "agronomy"; });
      document.querySelectorAll('.section-nav a[href="#batchCard"], [data-workspace-target="batchCard"]')
        .forEach(element => { element.hidden = activeDomain !== "laboratory"; });
      document.querySelectorAll("[data-domain-nav='biological']")
        .forEach(element => { element.hidden = activeDomain === "agronomy"; });
      document.querySelectorAll("[data-domain-nav='agronomy']")
        .forEach(element => { element.hidden = activeDomain !== "agronomy"; });
      document.querySelector(".bio-operation-panel")?.classList.toggle("hidden", activeDomain === "agronomy");
      document.querySelector(".bio-lineage-panel")?.classList.toggle("hidden", activeDomain === "agronomy");
      showElement(measurementCard);
      showElement(document.getElementById("statisticsCard"));
      showElement(document.getElementById("overviewCard"));

      void (async () => {
        try {
          if (switchRevision !== workspaceSwitchRevision || activeDomain !== document.body.dataset.domain) return;
          if (activeDomain === "agronomy") {
            cultureOptions = [];
            latestBatches = [];
            renderMeasurementTargets();
            renderStatisticsFilters();
            await loadPlantCultures();
            if (switchRevision !== workspaceSwitchRevision || activeDomain !== document.body.dataset.domain) return;
          } else {
            await loadCultureOptions();
            if (switchRevision !== workspaceSwitchRevision || activeDomain !== document.body.dataset.domain) return;
            await loadLatestBatches();
            if (switchRevision !== workspaceSwitchRevision || activeDomain !== document.body.dataset.domain) return;
          }
          renderMeasurementTargets();
          renderStatisticsFilters();
          await loadMeasurementReferences();
          if (switchRevision !== workspaceSwitchRevision || activeDomain !== document.body.dataset.domain) return;
          await Promise.all([loadRecentMeasurements(), loadRecentObservations()]);
          if (switchRevision !== workspaceSwitchRevision || activeDomain !== document.body.dataset.domain) return;
          updateOverview();
        } catch (error) {
          if (switchRevision !== workspaceSwitchRevision || activeDomain !== document.body.dataset.domain) return;
          console.error("Actualisation de l’espace de travail impossible :", error);
          showMessage("L’espace a changé, mais certaines données n’ont pas pu être actualisées. Utilisez Actualiser ou rechargez la page.", "warning");
        }
      })();
    }
  };
  buttons.forEach(button => button.addEventListener("click", () => setDomain(button.dataset.domainChoice)));
  setDomain(window.BA_LABS_DOMAIN, false);
}
setupDomainWorkspaces();
setupPlantRegistry();
setupProgressiveCultureEntry();
setupBioOperationFormGuidance();


/* Only operations that can create descendants expose descendant-code entry. */
function setupBioOperationFormGuidance() {
  const operation = document.getElementById("bioOperationType");
  const field = document.getElementById("bioChildCodesField");
  const codes = document.getElementById("bioChildCodes");
  if (!operation || !field || !codes) return;

  const operationsWithDescendants = new Set([
    "repiquage",
    "passage",
    "transfert",
    "division_aliquotes",
    "changement_milieu",
    "conservation"
  ]);
  const update = () => {
    const allowed = operationsWithDescendants.has(operation.value);
    field.hidden = !allowed;
    codes.disabled = !allowed;
    if (!allowed) codes.value = "";
  };
  operation.addEventListener("change", update);
  update();
}


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

