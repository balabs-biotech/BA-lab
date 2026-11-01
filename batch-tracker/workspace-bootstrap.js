(() => {
  if (window.BA_LABS_WORKSPACE_BOOTSTRAP?.ready) return;

  const root = document.getElementById("workspace-root");
  let startupPromise = null;

  function showStartupError(title, message) {
    if (!root) return;
    root.innerHTML = `<main class="container"><section class="card" role="alert"><h1>${title}</h1><p>${message}</p></section></main>`;
  }

  function loadScript(src, label) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.async = false;
      script.dataset.baLabsBootstrap = "true";
      script.onload = resolve;
      script.onerror = () => reject(new Error(label));
      document.body.appendChild(script);
    });
  }

  async function initializeWorkspace() {
    const domain = document.body?.dataset?.domain;
    const moduleByDomain = {
      mycology: "../smart-entry.js?v=20261029-assisted-entry-1",
      laboratory: "../smart-entry.js?v=20261029-assisted-entry-1",
      agronomy: "../environmental-data.js?v=20261027-sentinel-fallback-fix-1"
    };

    if (!Object.prototype.hasOwnProperty.call(moduleByDomain, domain)) {
      showStartupError("Espace inconnu", "Le domaine de cet espace CultureOps n’est pas reconnu.");
      return false;
    }

    window.BA_LABS_DOMAIN = domain;

    if (!window.supabase || typeof window.supabase.createClient !== "function") {
      showStartupError(
        "Service de données indisponible",
        "La bibliothèque Supabase n’a pas pu être chargée. Vérifiez la connexion puis rechargez la page."
      );
      return false;
    }

    try {
      const workspaceResponse = await fetch("../workspace.html?v=20261026-core-refresh-1");
      if (!workspaceResponse.ok) throw new Error("workspace");
      root.innerHTML = await workspaceResponse.text();
    } catch {
      showStartupError(
        "Interface indisponible",
        "L’interface commune n’a pas pu être chargée. Vérifiez la connexion puis rechargez la page."
      );
      return false;
    }

    try {
      await loadScript("../i18n.js?v=20261026-core-refresh-1", "translations");
    } catch {
      showStartupError(
        "Traductions indisponibles",
        "Le module de langues n’a pas pu être chargé. Rechargez la page."
      );
      return false;
    }

    try {
      await loadScript("../tracker.js?v=20261101-auth-session-stability-1", "engine");
    } catch {
      showStartupError(
        "Moteur indisponible",
        "Le moteur de CultureOps n’a pas pu être chargé. Rechargez la page."
      );
      return false;
    }

    try {
      await loadScript(moduleByDomain[domain], "workspace-module");
    } catch {
      showStartupError(
        "Module de l’espace indisponible",
        "Un module nécessaire à cet espace n’a pas pu être chargé. Rechargez la page."
      );
      return false;
    }

    return true;
  }

  function start() {
    if (!startupPromise) startupPromise = initializeWorkspace();
    return startupPromise;
  }

  window.BA_LABS_WORKSPACE_BOOTSTRAP = {
    start,
    ready: start()
  };
})();
