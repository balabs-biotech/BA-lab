(() => {
  "use strict";

  const SUPABASE_URL = "https://axcouwiodqsauwnsiotn.supabase.co";

  const $ = (id) => document.getElementById(id);
  const states = ["loading", "missing", "error", "passport"];
  const show = (active) => states.forEach((name) => { $(name).hidden = name !== active; });
  const safeText = (value, fallback = "—") =>
    typeof value === "string" && value.trim() ? value.trim() : fallback;
  const formatDate = (value) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit", month: "long", year: "numeric"
    }).format(date);
  };
  const addFact = (label, value) => {
    if (value === null || value === undefined || value === "") return;
    const item = document.createElement("div");
    item.className = "fact";
    const caption = document.createElement("span");
    caption.textContent = label;
    const content = document.createElement("strong");
    content.textContent = String(value);
    item.append(caption, content);
    $("facts").append(item);
  };
  const addAlert = (alert) => {
    const item = document.createElement("article");
    item.className = "public-alert";
    const title = document.createElement("strong");
    title.textContent = safeText(alert.title, "Information produit");
    const summary = document.createElement("p");
    summary.textContent = safeText(alert.summary, "");
    item.append(title, summary);
    const published = formatDate(alert.published_at);
    if (published) {
      const date = document.createElement("small");
      date.textContent = "Information publiée le " + published;
      item.append(date);
    }
    $("alerts-list").append(item);
  };
  const tokenFromLocation = () => {
    const direct = new URLSearchParams(window.location.search).get("token");
    if (direct) return direct;
    const hash = window.location.hash.replace(/^#\/?/, "");
    const queryAt = hash.indexOf("?");
    if (queryAt >= 0) return new URLSearchParams(hash.slice(queryAt + 1)).get("token");
    return null;
  };
  const showError = (title, message) => {
    $("error-title").textContent = title;
    $("error-copy").textContent = message;
    show("error");
  };

  const tokenFromInput = (value) => {
    const raw = value.trim();
    if (!raw) return null;
    try {
      const url = new URL(raw, window.location.origin);
      const direct = url.searchParams.get("token");
      if (direct) return direct;
      const hash = url.hash.replace(/^#\/?/, "");
      const queryAt = hash.indexOf("?");
      if (queryAt >= 0) return new URLSearchParams(hash.slice(queryAt + 1)).get("token");
    } catch {
      // A raw token is also accepted below.
    }
    return raw;
  };
  const renderPassport = (data) => {
    const product = data?.product || {};
    const lot = data?.lot || {};
    const quality = data?.quality || {};
    $("product-name").textContent = safeText(product.name, "Produit BA Labs");
    $("product-code").textContent = safeText(product.code, "");
    $("product-category").textContent = [product.category, product.family].filter(Boolean).join(" · ");
    $("lot-code").textContent = safeText(lot.code || data.passport_code);
    $("facts").replaceChildren();

    const lotStatus = data.status || lot.status || quality.status;
    const statusLabels = { released: "Lot libéré", published: "Passeport publié" };
    addFact("DATE DE FABRICATION", formatDate(lot.manufactured_on));
    addFact("DATE LIMITE D’UTILISATION", formatDate(lot.expires_on));
    addFact("STATUT DU LOT", statusLabels[lotStatus] || safeText(lotStatus, "Passeport publié"));
    addFact("RÉFÉRENCE PRODUIT", safeText(product.code, ""));
    addFact("CATÉGORIE", safeText(product.category, ""));
    if (Number.isInteger(quality.reviewed_passing_checks)) {
      addFact("CONTRÔLES QUALITÉ VALIDÉS", quality.reviewed_passing_checks);
    }
    addFact("RÉFÉRENCE DU PASSEPORT", safeText(data.passport_code, ""));
    addFact("VERSION DU SCHÉMA", safeText(data.schema_version, ""));

    const description = safeText(product.description, "");
    $("description-section").hidden = !description;
    $("product-description").textContent = description;

    const usage = safeText(product.usage, "");
    $("usage-section").hidden = !usage;
    $("product-usage").textContent = usage;

    const alerts = Array.isArray(data.alerts) ? data.alerts : [];
    $("alerts-list").replaceChildren();
    alerts.forEach(addAlert);
    $("alerts-section").hidden = alerts.length === 0;

    $("published-date").textContent = formatDate(data.published_at) || "";
    show("passport");
  };

  async function init() {
    const token = tokenFromLocation();
    if (!token) {
      show("missing");
      return;
    }
    // The backend issues 32 random bytes encoded as a 43-character base64url token.
    if (token.length < 32 || token.length > 256 || !/^[A-Za-z0-9_-]+$/.test(token)) {
      showError("QR code non reconnu", "Le jeton fourni ne correspond pas au format attendu. Vérifiez que le QR code est complet.");
      return;
    }

    show("loading");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(
        SUPABASE_URL + "/functions/v1/public-passport?token=" + encodeURIComponent(token),
        {
          method: "GET",
          headers: { "Accept": "application/json" },
          signal: controller.signal,
          cache: "no-store"
        }
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.error || !body?.passport) {
        showError("Passeport indisponible", "Ce passeport est introuvable, non publié ou a été révoqué. Vérifiez le QR code ou contactez BA Labs.");
        return;
      }
      renderPassport(body.passport);
    } catch (error) {
      const message = error?.name === "AbortError"
        ? "Le service de vérification met trop de temps à répondre. Réessayez dans quelques instants."
        : "Le service de vérification est momentanément inaccessible. Vérifiez votre connexion puis réessayez.";
      showError("Vérification interrompue", message);
    } finally {
      window.clearTimeout(timeout);
    }
  }

  const lookupForm = $("manual-lookup");
  if (lookupForm) {
    lookupForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const input = $("passport-entry");
      const token = tokenFromInput(input.value);
      const valid = typeof token === "string" &&
        token.length >= 32 &&
        token.length <= 256 &&
        /^[A-Za-z0-9_-]+$/.test(token);
      $("lookup-error").hidden = valid;
      if (!valid) {
        input.setAttribute("aria-invalid", "true");
        return;
      }
      input.removeAttribute("aria-invalid");
      window.location.hash = "/p?token=" + encodeURIComponent(token);
      init();
    });
  }

  init();
})();