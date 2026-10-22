

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
        environment_id,
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

async function compareSelectedBatches() {
  const select = document.getElementById("batchCompareSelect");
  const status = document.getElementById("batchCompareStatus");
  const results = document.getElementById("batchCompareResults");
  const button = document.getElementById("compareBatchesButton");
  if (!select || !status || !results || !button) return;
  const language = window.BALabsI18n?.language || "fr";
  const ui = ({
    fr: { selection:"Sélectionnez entre 2 et 4 lots.", stale:"Un ou plusieurs lots ne sont plus dans la liste chargée. Actualisez la page.", loading:"Chargement des étapes et des mesures…", loaded:"Comparaison chargée.", capped:"Comparaison chargée avec une limite de 1 000 mesures récentes par lien culture/environnement ; les comptes peuvent être incomplets.", count:"n_mesures désigne le nombre de mesures, pas le nombre de répétitions biologiques indépendantes.", shared:"Les mesures d'un environnement partagé peuvent apparaître pour plusieurs lots.", repeated:n=>`Attention : ${n} lien(s) d'unité expérimentale sont partagés entre les lots sélectionnés ; ces lots ne constituent pas autant de répétitions indépendantes.`, missing:"Les données manquantes ne sont pas interprétées comme zéro.", impossible:"Impossible de comparer les lots.", culture:"Culture", environment:"Environnement", observations:n=>`${n} observation(s)`, noObservations:"Aucune observation", treatment:"traitement", replicate:"répétition", excluded:"exclue" },
    en: { selection:"Select between 2 and 4 batches.", stale:"One or more batches are no longer in the loaded list. Refresh the page.", loading:"Loading stages and measurements…", loaded:"Comparison loaded.", capped:"Comparison loaded with a limit of 1,000 recent measurements per culture/environment link; counts may be incomplete.", count:"n_measurements is the number of measurements, not the number of independent biological replicates.", shared:"Measurements from a shared environment may appear for multiple batches.", repeated:n=>`Warning: ${n} experimental-unit link(s) are shared by the selected batches; these batches do not represent that many independent replicates.`, missing:"Missing data is not treated as zero.", impossible:"Unable to compare batches.", culture:"Culture", environment:"Environment", observations:n=>`${n} observation(s)`, noObservations:"No observations", treatment:"treatment", replicate:"replicate", excluded:"excluded" },
    pt: { selection:"Selecione entre 2 e 4 lotes.", stale:"Um ou mais lotes já não estão na lista carregada. Atualize a página.", loading:"A carregar etapas e medições…", loaded:"Comparação carregada.", capped:"Comparação carregada com um limite de 1.000 medições recentes por ligação cultura/ambiente; as contagens podem estar incompletas.", count:"n_medições indica o número de medições, não o número de repetições biológicas independentes.", shared:"As medições de um ambiente partilhado podem aparecer em vários lotes.", repeated:n=>`Atenção: ${n} ligação(ões) de unidade experimental são partilhadas pelos lotes selecionados; estes lotes não representam esse número de repetições independentes.`, missing:"Os dados em falta não são tratados como zero.", impossible:"Não foi possível comparar os lotes.", culture:"Cultura", environment:"Ambiente", observations:n=>`${n} observação(ões)`, noObservations:"Sem observações", treatment:"tratamento", replicate:"repetição", excluded:"excluída" },
    ar: { selection:"اختر من دفعتين إلى أربع دفعات.", stale:"لم تعد دفعة واحدة أو أكثر موجودة في القائمة المحمّلة. حدّث الصفحة.", loading:"جارٍ تحميل المراحل والقياسات…", loaded:"اكتملت المقارنة.", capped:"اكتملت المقارنة مع حد أقصى قدره ١٬٠٠٠ قياس حديث لكل ارتباط بين المزرعة والبيئة؛ وقد تكون الأعداد غير مكتملة.", count:"n_measurements هو عدد القياسات وليس عدد المكررات البيولوجية المستقلة.", shared:"قد تظهر قياسات البيئة المشتركة في عدة دفعات.", repeated:n=>`تحذير: توجد ${n} روابط لوحدات تجريبية مشتركة بين الدفعات المحددة؛ ولا تمثل هذه الدفعات هذا العدد من المكررات المستقلة.`, missing:"لا تُعامل البيانات المفقودة على أنها صفر.", impossible:"تعذرت مقارنة الدفعات.", culture:"المزرعة", environment:"البيئة", observations:n=>`${n} ملاحظة`, noObservations:"لا توجد ملاحظات", treatment:"المعاملة", replicate:"مكرر", excluded:"مستبعدة" }
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
        .eq("organization_id", organizationId).in("batch_id", ids),
      cultureIds.length
        ? supabaseClient.from("measurements")
            .select("id,culture_id,environment_id,variable_code,raw_value,raw_unit_code,normalized_value,normalized_unit_code,measured_at,quality_state,exclusion_reason")
            .eq("organization_id", organizationId).in("culture_id", cultureIds)
            .order("measured_at", { ascending: false }).limit(1000)
        : Promise.resolve({data:[],error:null}),
      environmentIds.length
        ? supabaseClient.from("measurements")
            .select("id,culture_id,environment_id,variable_code,raw_value,raw_unit_code,normalized_value,normalized_unit_code,measured_at,quality_state,exclusion_reason")
            .eq("organization_id", organizationId).in("environment_id", environmentIds)
            .order("measured_at", { ascending: false }).limit(1000)
        : Promise.resolve({data:[],error:null}),
      cultureIds.length
        ? supabaseClient.from("cultures")
            .select("id,experiment_id,experimental_unit_id")
            .eq("organization_id", organizationId).in("id", cultureIds)
        : Promise.resolve({data:[],error:null})
    ]);
    if (stageResult.error) throw new Error("Chargement des étapes impossible : " + stageResult.error.message);
    if (cultureMeasurementResult.error) throw new Error("Chargement des mesures de culture impossible : " + cultureMeasurementResult.error.message);
    if (environmentMeasurementResult.error) throw new Error("Chargement des mesures d'environnement impossible : " + environmentMeasurementResult.error.message);
    if (cultureContextResult.error) throw new Error("Chargement du contexte expérimental impossible : " + cultureContextResult.error.message);
    const cultureContexts = cultureContextResult.data || [];
    const unitIds = [...new Set(cultureContexts.map(row => row.experimental_unit_id).filter(Boolean))];
    const [unitResult] = await Promise.all([
      unitIds.length
        ? supabaseClient.from("experimental_units")
            .select("id,experiment_id,unit_code,replicate_no,treatment_code")
            .eq("organization_id", organizationId).in("id", unitIds)
        : Promise.resolve({data:[],error:null})
    ]);
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
          .eq("organization_id", organizationId).in("id", experimentIds)
      : {data:[],error:null};
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
      ? await supabaseClient.from("observations")
          .select("id,culture_id,experimental_unit_id,variable_code,value_text,observed_at,quality_state")
          .eq("organization_id", organizationId).in("culture_id", cultureIds)
          .order("observed_at", { ascending: false }).limit(1000)
      : {data:[],error:null};
    if (observationCultureResult.error) throw new Error("Chargement des observations de culture impossible : " + observationCultureResult.error.message);
    const observationUnitResult = unitIds.length
      ? await supabaseClient.from("observations")
          .select("id,culture_id,experimental_unit_id,variable_code,value_text,observed_at,quality_state")
          .eq("organization_id", organizationId).in("experimental_unit_id", unitIds)
          .order("observed_at", { ascending: false }).limit(1000)
      : {data:[],error:null};
    if (observationUnitResult.error) throw new Error("Chargement des observations expérimentales impossible : " + observationUnitResult.error.message);
    const observationMap = new Map();
    [...(observationCultureResult.data || []), ...(observationUnitResult.data || [])].forEach(row => {
      if (row.id) observationMap.set(row.id, row);
    });
    const observations = [...observationMap.values()];
    const stages = stageResult.data || [];
    const measurementMap = new Map();
    [...(cultureMeasurementResult.data || []), ...(environmentMeasurementResult.data || [])].forEach(row => {
      if (row.id) measurementMap.set(row.id, row);
    });
    const measurements = [...measurementMap.values()];
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
        fr: {mean:"moyenne",range:"min–max",excluded:"exclues",nonNumeric:"sans valeur numérique",empty:"Aucune mesure numérique exploitable"},
        en: {mean:"mean",range:"min–max",excluded:"excluded",nonNumeric:"without numeric value",empty:"No usable numeric measurements"},
        pt: {mean:"média",range:"mín–máx",excluded:"excluídas",nonNumeric:"sem valor numérico",empty:"Sem medições numéricas utilizáveis"},
        ar: {mean:"المتوسط",range:"الحد الأدنى–الأقصى",excluded:"مستبعدة",nonNumeric:"دون قيمة رقمية",empty:"لا توجد قياسات رقمية قابلة للاستخدام"}
      }[language] || {mean:"moyenne",range:"min–max",excluded:"exclues",nonNumeric:"sans valeur numérique",empty:"Aucune mesure numérique exploitable"};
      const summaries = [...groups.entries()].map(([key, values]) => {
        const [variable, unit, quality] = key.split("||");
        const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
        const min = Math.min(...values);
        const max = Math.max(...values);
        const fmt = value => new Intl.NumberFormat(undefined, {maximumSignificantDigits: 5}).format(value);
        return `${variable}${unit ? " (" + unit + ")" : ""}: ${labels.mean} ${fmt(mean)}, ${labels.range} ${fmt(min)}–${fmt(max)}, n_mesures=${values.length} [${quality}]`;
      });
      const excluded = rows.filter(row => row.quality_state === "excluded").length;
      const nonNumeric = rows.filter(row => row.quality_state !== "excluded" && (row.normalized_value ?? row.raw_value) == null).length;
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
    const capped = cultureMeasurementResult.data?.length >= 1000 || environmentMeasurementResult.data?.length >= 1000;
    const statusParts = [
      capped ? labels.capped : labels.loaded,
      labels.count,
      labels.shared,
      repeatedUnitCount > 0 ? labels.repeated(repeatedUnitCount) : "",
      labels.missing
    ].filter(Boolean);
    status.textContent = statusParts.join(" ");
  } catch (error) {
    status.textContent = error?.message || labels.impossible;
  } finally {
    button.disabled = false;
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
      .select("code, label, dimension")
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

async function saveMeasurement() {
  if (!organizationId) {
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

  const session = await getCurrentSession();
  if (!session) {
    showMessage(cultureWorkflowText("expired"), "error");
    return;
  }

  saveMeasurementButton.disabled = true;
  saveMeasurementButton.textContent = cultureWorkflowText("saving");
  let eventId = null;
  let measurementSaved = false;

  try {
    let cultureId = null;
    let batchId = null;
    const [targetType, targetId] = targetValue.split(":");

    if (targetType === "culture") {
      const culture = cultureOptions.find(item => item.id === targetId);
      if (!culture) throw new Error(cultureWorkflowText("cultureMissing"));
      cultureId = culture.id;
    } else if (targetType === "batch") {
      const batch = latestBatches.find(item => item.id === targetId);
      if (!batch) throw new Error(cultureWorkflowText("batchMissing"));
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

      if (eventError) throw new Error(cultureWorkflowText("eventError") + eventError.message);
      eventId = event.id;
    } else {
      throw new Error(cultureWorkflowText("invalidTarget"));
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

    if (measurementError) throw new Error(cultureWorkflowText("measureError") + measurementError.message);
    measurementSaved = true;

    measurementValueInput.value = "";
    measurementInstrumentInput.value = "";
    measurementMethodInput.value = "";
    measurementNoteInput.value = "";

    showMessage(cultureWorkflowText("measureSaved"), "success");
    await loadRecentMeasurements();
  } catch (error) {
    console.error("Enregistrement mesure :", error);
    if (measurementSaved) {
      showMessage(cultureWorkflowText("measureRefresh"), "warning");
    } else {
      if (eventId) {
        const { error: cleanupError } = await supabaseClient
          .from("events")
          .delete()
          .eq("organization_id", organizationId)
          .eq("id", eventId);
        if (cleanupError) console.error("Nettoyage de l’événement incomplet :", cleanupError);
      }
      showMessage(error.message || cultureWorkflowText("measureFailed"), "error");
    }
  } finally {
    saveMeasurementButton.disabled = false;
    saveMeasurementButton.textContent = cultureWorkflowText("saveMeasure");
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

  const session = await getCurrentSession();
  if (!session) {
    showMessage(cultureWorkflowText("expired"), "error");
    return;
  }

  saveObservationButton.disabled = true;
  saveObservationButton.textContent = cultureWorkflowText("saving");
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
      if (!culture) throw new Error(cultureWorkflowText("cultureMissing"));
      cultureId = culture.id;
    } else if (targetType === "batch") {
      const batch = latestBatches.find(item => item.id === targetId);
      if (!batch) throw new Error(cultureWorkflowText("batchMissing"));
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

      if (eventResult.error) throw new Error(cultureWorkflowText("eventError") + eventResult.error.message);
      eventId = eventResult.data.id;
    } else {
      throw new Error(cultureWorkflowText("observationInvalid"));
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

    if (insertResult.error) throw new Error(cultureWorkflowText("observationError") + insertResult.error.message);
    observationSaved = true;
    observationValueInput.value = "";
    observationMethodInput.value = "";
    observationInstrumentInput.value = "";
    observationNoteInput.value = "";
    showMessage(cultureWorkflowText("observationSaved"), "success");
    await loadRecentObservations();
  } catch (error) {
    console.error("Enregistrement observation :", error);
    if (observationSaved) {
      showMessage(cultureWorkflowText("observationRefresh"), "warning");
    } else {
      if (eventId) {
        const cleanup = await supabaseClient.from("events").delete()
          .eq("organization_id", organizationId).eq("id", eventId);
        if (cleanup.error) console.error("Nettoyage de l’événement incomplet :", cleanup.error);
      }
      showMessage(error.message || cultureWorkflowText("observationFailed"), "error");
    }
  } finally {
    saveObservationButton.disabled = false;
    saveObservationButton.textContent = cultureWorkflowText("saveObservation");
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
  const lang = window.BALabsI18n?.language || "fr";
  const tr = ({
    fr: { login:"Connectez-vous pour analyser les données de votre organisation.", variable:"Sélectionnez une variable mesurée.", loading:"Chargement des mesures depuis Supabase…", loadingData:"Chargement des données…", buttonLoading:"Chargement…", buttonAnalyze:"Analyser les données", loadedMeasurements:"Mesures chargées", numericValues:"Valeurs numériques", comparableValues:"Valeurs comparables", capped:"Au moins 1 000 mesures correspondent aux filtres. Le résultat peut être tronqué ; réduisez la période ou sélectionnez une culture.", excluded:n=>n+" valeur(s) exclue(s) du graphique car l’unité n’est pas comparable. ", loaded:"Données chargées depuis Supabase. Les résultats sont descriptifs.", empty:"Aucune mesure ne correspond aux filtres sélectionnés.", needTwo:"Il faut au moins deux mesures numériques comparables pour tracer une évolution. Les données brutes restent consultables ci-dessous.", unknownDate:"Date inconnue", measurementDate:"Date de mesure", unknownUnit:"unité inconnue", period:"Période représentée : ", noRows:"Aucune mesure pour ces filtres.", limited:n=>"Affichage limité aux 200 mesures les plus récentes sur "+n+" chargées.", graphError:"Le graphique n’a pas pu être produit.", unavailable:"Données indisponibles.", loadError:"Impossible de charger les mesures : ", cultureLinked:"Culture liée par identifiant", noCulture:"Lot / cible sans culture directe", unitMissing:"Unité non renseignée" },
    en: { login:"Sign in to analyze your organization's data.", variable:"Select a measured variable.", loading:"Loading measurements from Supabase…", loadingData:"Loading data…", buttonLoading:"Loading…", buttonAnalyze:"Analyze data", loadedMeasurements:"Measurements loaded", numericValues:"Numeric values", comparableValues:"Comparable values", capped:"At least 1,000 measurements match the filters. Results may be truncated; narrow the period or select a culture.", excluded:n=>n+" value(s) excluded from the chart because the unit is not comparable. ", loaded:"Data loaded from Supabase. Results are descriptive.", empty:"No measurements match the selected filters.", needTwo:"At least two comparable numeric measurements are needed to plot a trend. Raw data remain available below.", unknownDate:"Unknown date", measurementDate:"Measurement date", unknownUnit:"unknown unit", period:"Period shown: ", noRows:"No measurements for these filters.", limited:n=>"Showing the 200 most recent measurements out of "+n+" loaded.", graphError:"The chart could not be generated.", unavailable:"Data unavailable.", loadError:"Unable to load measurements: ", cultureLinked:"Culture linked by ID", noCulture:"Batch / target without direct culture", unitMissing:"Unit not specified" },
    pt: { login:"Inicie sessão para analisar os dados da sua organização.", variable:"Selecione uma variável medida.", loading:"A carregar medições do Supabase…", loadingData:"A carregar dados…", buttonLoading:"A carregar…", buttonAnalyze:"Analisar dados", loadedMeasurements:"Medições carregadas", numericValues:"Valores numéricos", comparableValues:"Valores comparáveis", capped:"Pelo menos 1.000 medições correspondem aos filtros. Os resultados podem estar truncados; reduza o período ou selecione uma cultura.", excluded:n=>n+" valor(es) excluído(s) do gráfico porque a unidade não é comparável. ", loaded:"Dados carregados do Supabase. Os resultados são descritivos.", empty:"Nenhuma medição corresponde aos filtros selecionados.", needTwo:"São necessárias pelo menos duas medições numéricas comparáveis para traçar uma evolução. Os dados brutos continuam disponíveis abaixo.", unknownDate:"Data desconhecida", measurementDate:"Data da medição", unknownUnit:"unidade desconhecida", period:"Período apresentado: ", noRows:"Nenhuma medição para estes filtros.", limited:n=>"A mostrar as 200 medições mais recentes de "+n+" carregadas.", graphError:"Não foi possível gerar o gráfico.", unavailable:"Dados indisponíveis.", loadError:"Não foi possível carregar as medições: ", cultureLinked:"Cultura associada por identificador", noCulture:"Lote / alvo sem cultura direta", unitMissing:"Unidade não indicada" },
    ar: { login:"سجّل الدخول لتحليل بيانات مؤسستك.", variable:"اختر متغيرًا مقاسًا.", loading:"جارٍ تحميل القياسات من Supabase…", loadingData:"جارٍ تحميل البيانات…", buttonLoading:"جارٍ التحميل…", buttonAnalyze:"تحليل البيانات", loadedMeasurements:"القياسات المحمّلة", numericValues:"القيم الرقمية", comparableValues:"القيم القابلة للمقارنة", capped:"تطابق ١٬٠٠٠ قياس على الأقل عوامل التصفية. قد تكون النتائج مقتطعة؛ قلّص الفترة أو اختر مزرعة.", excluded:n=>n+" قيمة مستبعدة من الرسم لأن الوحدة غير قابلة للمقارنة. ", loaded:"تم تحميل البيانات من Supabase. النتائج وصفية.", empty:"لا توجد قياسات تطابق عوامل التصفية المحددة.", needTwo:"يلزم قياسان رقميان قابلان للمقارنة على الأقل لرسم الاتجاه. تبقى البيانات الخام متاحة أدناه.", unknownDate:"تاريخ غير معروف", measurementDate:"تاريخ القياس", unknownUnit:"وحدة غير معروفة", period:"الفترة المعروضة: ", noRows:"لا توجد قياسات لهذه العوامل.", limited:n=>"يقتصر العرض على أحدث ٢٠٠ قياس من أصل "+n+" قياسًا محمّلًا.", graphError:"تعذر إنشاء الرسم البياني.", unavailable:"البيانات غير متاحة.", loadError:"تعذر تحميل القياسات: ", cultureLinked:"مزرعة مرتبطة بالمعرّف", noCulture:"دفعة / هدف دون مزرعة مباشرة", unitMissing:"الوحدة غير محددة" }
  })[lang] || null;
  const L = tr || ({ fr: true }).fr && ({ login:"Connectez-vous pour analyser les données de votre organisation.", variable:"Sélectionnez une variable mesurée.", loading:"Chargement des mesures depuis Supabase…", loadingData:"Chargement des données…", buttonLoading:"Chargement…", buttonAnalyze:"Analyser les données", loadedMeasurements:"Mesures chargées", numericValues:"Valeurs numériques", comparableValues:"Valeurs comparables", capped:"Au moins 1 000 mesures correspondent aux filtres. Le résultat peut être tronqué ; réduisez la période ou sélectionnez une culture.", excluded:n=>n+" valeur(s) exclue(s) du graphique car l’unité n’est pas comparable. ", loaded:"Données chargées depuis Supabase. Les résultats sont descriptifs.", empty:"Aucune mesure ne correspond aux filtres sélectionnés.", needTwo:"Il faut au moins deux mesures numériques comparables pour tracer une évolution. Les données brutes restent consultables ci-dessous.", unknownDate:"Date inconnue", measurementDate:"Date de mesure", unknownUnit:"unité inconnue", period:"Période représentée : ", noRows:"Aucune mesure pour ces filtres.", limited:n=>"Affichage limité aux 200 mesures les plus récentes sur "+n+" chargées.", graphError:"Le graphique n’a pas pu être produit.", unavailable:"Données indisponibles.", loadError:"Impossible de charger les mesures : ", cultureLinked:"Culture liée par identifiant", noCulture:"Lot / cible sans culture directe", unitMissing:"Unité non renseignée" });
  if (!organizationId) { status.textContent = L.login; return; }
  if (!variableCode) { status.textContent = L.variable; return; }
  const button = document.getElementById("loadStatisticsButton");
  button.disabled = true; button.textContent = L.buttonLoading;
  status.textContent = L.loading; chart.innerHTML = '<p class="muted">' + L.loadingData + '</p>'; summary.innerHTML = ""; tbody.innerHTML = "";
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
    addSummary(L.loadedMeasurements,String(rows.length)); addSummary(L.numericValues,String(prepared.length)); addSummary(L.comparableValues,String(plotted.length));
    status.textContent = rows.length >= 1000 ? L.capped : rows.length ? (excluded ? L.excluded(excluded) : "") + L.loaded : L.empty;
    chart.innerHTML = "";
    if (plotted.length < 2) { chart.innerHTML = '<p class="muted">' + L.needTwo + '</p>'; }
    else {
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
  } catch(error) { if (requestId !== statisticsRequestId) return; console.error("Analyse des mesures impossible :",error); status.textContent=L.loadError+error.message; chart.innerHTML='<p class="muted">' + L.graphError + '</p>'; summary.innerHTML=""; tbody.innerHTML='<tr><td colspan="5">' + L.unavailable + '</td></tr>'; }
  finally { if (requestId === statisticsRequestId) { button.disabled=false; button.textContent=L.buttonAnalyze; } }
}

function biologicalWorkflowText(key, count = 0) {
  const lang = window.BALabsI18n?.language || "fr";
  const messages = {
    fr: { loading:"Chargement de la filiation…", missing:"Culture absente du périmètre chargé.", open:"Ouvrir la fiche de culture ", noCode:"sans code", typeMissing:"type non renseigné", materialOrigin:"Origine matérielle (de la souche source au matériel actuel)", materialNoCode:"Matériel sans code", unknownType:"type inconnu", generation:"génération ", parents:"Cultures parentes", selected:"Culture sélectionnée", openSheet:"Fiche ouverte", parentCulture:"Culture parente", descendants:"Descendants", noLineage:"Aucun ascendant ou descendant enregistré dans les fiches de culture. L’origine matérielle initiale reste indiquée par l’identifiant matériel de la fiche.", partial:"Filiation partielle : limite de 1 000 cultures atteinte.", loadError:"Impossible de charger la filiation : ", selectCulture:"Sélectionnez une culture avant d’enregistrer.", dateRequired:"Indiquez la date de l’opération.", childLimit:"Maximum : 12 descendants par opération.", invalidPropagation:"Cette opération ne peut pas créer de descendants. Retirez les codes ou choisissez une opération de propagation.", saving:"Enregistrement…", syncWarning:" La filiation est enregistrée dans Supabase ; vérifiez la synchronisation Notion des descendants.", syncWarningShort:" La filiation est enregistrée dans Supabase ; synchronisation Notion à vérifier.", saved:"Opération enregistrée", childCreated:" descendant(s) créé(s).", failed:"Échec : ", notSaved:"opération non enregistrée", save:"Enregistrer l’opération" },
    en: { loading:"Loading lineage…", missing:"Culture is outside the loaded scope.", open:"Open culture record ", noCode:"no code", typeMissing:"type not specified", materialOrigin:"Material origin (from source strain to current material)", materialNoCode:"Material without a code", unknownType:"unknown type", generation:"generation ", parents:"Parent cultures", selected:"Selected culture", openSheet:"Open record", parentCulture:"Parent culture", descendants:"Descendants", noLineage:"No ancestors or descendants are recorded in the culture records. The initial material origin remains indicated by the record's material ID.", partial:"Partial lineage: the 1,000-culture limit was reached.", loadError:"Could not load lineage: ", selectCulture:"Select a culture before saving.", dateRequired:"Enter the operation date.", childLimit:"Maximum: 12 descendants per operation.", invalidPropagation:"This operation cannot create descendants. Remove the codes or choose a propagation operation.", saving:"Saving…", syncWarning:" Lineage is saved in Supabase; check Notion synchronization for descendants.", syncWarningShort:" Lineage is saved in Supabase; verify Notion synchronization.", saved:"Operation saved", childCreated:" descendant(s) created.", failed:"Failed: ", notSaved:"operation not saved", save:"Save operation" },
    pt: { loading:"A carregar a filiação…", missing:"A cultura não está no âmbito carregado.", open:"Abrir ficha da cultura ", noCode:"sem código", typeMissing:"tipo não indicado", materialOrigin:"Origem material (da estirpe de origem ao material atual)", materialNoCode:"Material sem código", unknownType:"tipo desconhecido", generation:"geração ", parents:"Culturas progenitoras", selected:"Cultura selecionada", openSheet:"Ficha aberta", parentCulture:"Cultura progenitora", descendants:"Descendentes", noLineage:"Não há ascendentes ou descendentes registados nas fichas de cultura. A origem material inicial continua indicada pelo identificador do material.", partial:"Filiação parcial: foi atingido o limite de 1 000 culturas.", loadError:"Não foi possível carregar a filiação: ", selectCulture:"Selecione uma cultura antes de guardar.", dateRequired:"Indique a data da operação.", childLimit:"Máximo: 12 descendentes por operação.", invalidPropagation:"Esta operação não pode criar descendentes. Remova os códigos ou escolha uma operação de propagação.", saving:"A guardar…", syncWarning:" A filiação está guardada no Supabase; verifique a sincronização dos descendentes com o Notion.", syncWarningShort:" A filiação está guardada no Supabase; verifique a sincronização com o Notion.", saved:"Operação guardada", childCreated:" descendente(s) criado(s).", failed:"Falha: ", notSaved:"operação não guardada", save:"Guardar operação" },
    ar: { loading:"جارٍ تحميل النسب…", missing:"المزرعة خارج نطاق البيانات المحمّلة.", open:"فتح سجل المزرعة ", noCode:"بلا رمز", typeMissing:"النوع غير محدد", materialOrigin:"أصل المادة (من السلالة المصدر إلى المادة الحالية)", materialNoCode:"مادة بلا رمز", unknownType:"نوع غير معروف", generation:"الجيل ", parents:"المزارع الأم", selected:"المزرعة المحددة", openSheet:"السجل المفتوح", parentCulture:"المزرعة الأم", descendants:"الفروع", noLineage:"لا توجد أسلاف أو فروع مسجلة في سجلات المزارع. يظل أصل المادة الأولي موضحًا بمعرّف المادة في السجل.", partial:"النسب جزئي: تم بلوغ حد 1000 مزرعة.", loadError:"تعذّر تحميل النسب: ", selectCulture:"حدد مزرعة قبل الحفظ.", dateRequired:"أدخل تاريخ العملية.", childLimit:"الحد الأقصى 12 فرعًا لكل عملية.", invalidPropagation:"لا يمكن لهذه العملية إنشاء فروع. احذف الرموز أو اختر عملية إكثار.", saving:"جارٍ الحفظ…", syncWarning:" تم حفظ النسب في Supabase؛ تحقق من مزامنة الفروع مع Notion.", syncWarningShort:" تم حفظ النسب في Supabase؛ تحقق من المزامنة مع Notion.", saved:"تم حفظ العملية", childCreated:" فرع/فروع تم إنشاؤها.", failed:"فشل: ", notSaved:"لم تُحفظ العملية", save:"حفظ العملية" }
  };
  const selected = (messages[lang] || messages.fr)[key];
  return typeof selected === "function" ? selected(count) : (selected ?? messages.fr[key] ?? key);
}

async function loadBiologicalLineage(cultureId) {
  const target = document.getElementById('cultureLineage');
  if (!target || !organizationId) return;
  target.textContent = biologicalWorkflowText("loading");
  try {
    const { data, error } = await supabaseClient.from('cultures')
      .select('id,code,culture_type,material_id,parent_culture_id,started_at,metadata')
      .eq('organization_id', organizationId).order('created_at', { ascending: true }).limit(1000);
    if (error) throw error;
    const rows = data || [];
    const byId = new Map(rows.map(row => [row.id, row]));
    const current = byId.get(cultureId);
    if (!current) { target.textContent = biologicalWorkflowText("missing"); return; }
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
    const renderNode = (row, label) => { const node = document.createElement('button'); node.type = 'button'; node.className = 'culture-lineage-node'; node.addEventListener('click', () => loadCultureDetail(row.id)); node.setAttribute('aria-label', biologicalWorkflowText("open") + (row.code || biologicalWorkflowText("noCode"))); const strong = document.createElement('strong'); strong.textContent = row.code || 'Culture sans code'; const small = document.createElement('small'); small.textContent = label + ' · ' + (row.culture_type || biologicalWorkflowText("typeMissing")); node.append(strong, small); return node; };
    target.replaceChildren();
    const makeGroup = (title, items) => { const section = document.createElement('section'); const heading = document.createElement('p'); heading.className = 'muted'; heading.textContent = title; section.appendChild(heading); const list = document.createElement('div'); list.className = 'culture-lineage-list'; items.forEach((item, index) => { if (index) { const arrow = document.createElement('span'); arrow.className = 'culture-lineage-arrow'; arrow.textContent = '→'; list.appendChild(arrow); } list.appendChild(renderNode(item.row, item.label)); }); section.appendChild(list); target.appendChild(section); };
    if (materialChain.length) {
      const section = document.createElement('section'); const heading = document.createElement('p'); heading.className = 'muted'; heading.textContent = biologicalWorkflowText("materialOrigin"); section.appendChild(heading);
      const list = document.createElement('div'); list.className = 'culture-lineage-list';
      materialChain.forEach((material, index) => { if (index) { const arrow = document.createElement('span'); arrow.className = 'culture-lineage-arrow'; arrow.textContent = '→'; list.appendChild(arrow); } const node = document.createElement('div'); node.className = 'culture-lineage-node'; const strong = document.createElement('strong'); strong.textContent = material.material_code || biologicalWorkflowText("materialNoCode"); const small = document.createElement('small'); small.textContent = (material.material_type || biologicalWorkflowText("unknownType")) + (material.generation == null ? '' : ' · ' + biologicalWorkflowText("generation") + material.generation) + (material.state ? ' · ' + material.state : ''); node.append(strong,small); list.appendChild(node); });
      section.appendChild(list); target.appendChild(section);
    }
    if (ancestors.length) makeGroup(biologicalWorkflowText("parents"), ancestors.map(row => ({ row, label: biologicalWorkflowText("parentCulture") })));
    makeGroup(biologicalWorkflowText("selected"), [{ row: current, label: biologicalWorkflowText("openSheet") }]);
    if (descendants.length) makeGroup(biologicalWorkflowText("descendants") + ' (' + descendants.length + ')', descendants.map(row => ({ row, label: biologicalWorkflowText("generation") + (row.depth || 1) })));
    if (!ancestors.length && !descendants.length) { const p = document.createElement('p'); p.className = 'muted'; p.textContent = biologicalWorkflowText("noLineage"); target.appendChild(p); }
    if (rows.length >= 1000) { const note = document.createElement('p'); note.className = 'muted'; note.textContent = biologicalWorkflowText("partial"); target.appendChild(note); }
  } catch (error) { target.textContent = biologicalWorkflowText("loadError") + (error.message || error); }
}

async function saveBiologicalOperation(event) {
  event.preventDefault();
  const button = document.getElementById('saveBioOperation');
  const message = document.getElementById('bioOperationMessage');
  const cultureId = document.getElementById('cultureDetailPanel')?.dataset.cultureId;
  if (!cultureId || !organizationId) { message.textContent = biologicalWorkflowText("selectCulture"); return; }
  const operationType = document.getElementById('bioOperationType').value;
  const dateValue = document.getElementById('bioOperationDate').value;
  const note = document.getElementById('bioOperationNote').value.trim();
  const conditions = document.getElementById('bioOperationConditions').value.trim();
  const outcome = document.getElementById('bioOperationOutcome').value;
  const childCodes = [...new Set(document.getElementById('bioChildCodes').value.split(',').map(value => value.trim()).filter(Boolean))];
  if (!dateValue) { message.textContent = biologicalWorkflowText("dateRequired"); return; }
  if (childCodes.length > 12) { message.textContent = biologicalWorkflowText("childLimit"); return; }
  if (childCodes.length && !['repiquage','passage','transfert','division_aliquotes','changement_milieu','conservation'].includes(operationType)) { message.textContent = biologicalWorkflowText("invalidPropagation"); return; }
  button.disabled = true; button.textContent = biologicalWorkflowText("saving"); message.textContent = '';
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
        if (syncError || (syncData && syncData.ok === false)) notionSyncWarning = biologicalWorkflowText("syncWarning");
      } catch (syncError) { notionSyncWarning = biologicalWorkflowText("syncWarningShort"); }
    }
    document.getElementById('bioOperationNote').value = ''; document.getElementById('bioOperationConditions').value = ''; document.getElementById('bioOperationOutcome').value = ''; document.getElementById('bioChildCodes').value = '';
    message.textContent = biologicalWorkflowText("saved") + (result?.children?.length ? ' · ' + result.children.length + biologicalWorkflowText("childCreated") : '.') + notionSyncWarning;
    await loadCultureOptions();
    await loadCultureDetail(cultureId);
    await loadBiologicalLineage(cultureId);
  } catch (error) { message.textContent = biologicalWorkflowText("failed") + (error.message || biologicalWorkflowText("notSaved")); }
  finally { button.disabled = false; button.textContent = biologicalWorkflowText("save"); }
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

