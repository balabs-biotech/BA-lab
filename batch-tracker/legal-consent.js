(() => {
  "use strict";

  const STORAGE_KEY = "ba-labs-privacy-preferences-v1";
  const POLICY_VERSION = "2026-11-11";
  const legalBase = document.body?.dataset?.domain ? "../../legal/" : "legal/";

  const readPreferences = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed?.policyVersion !== POLICY_VERSION) return null;
      return {
        necessary: true,
        analytics: parsed.analytics === true,
        marketing: parsed.marketing === true,
        savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : null,
        policyVersion: POLICY_VERSION
      };
    } catch (_) {
      return null;
    }
  };

  const savePreferences = ({ analytics = false, marketing = false } = {}) => {
    const preferences = {
      necessary: true,
      analytics: analytics === true,
      marketing: marketing === true,
      savedAt: new Date().toISOString(),
      policyVersion: POLICY_VERSION
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch (_) {
      // The interface remains usable when browser storage is unavailable.
    }
    document.dispatchEvent(new CustomEvent("ba-labs:privacy-preferences-changed", {
      detail: { ...preferences }
    }));
    banner?.remove();
    dialog?.close?.();
    return preferences;
  };

  let banner;
  let dialog;

  const style = document.createElement("style");
  style.textContent = `
    .ba-privacy-banner{position:fixed;z-index:10000;inset:auto 16px 16px;max-width:920px;margin:auto;padding:18px 20px;background:#151d18;color:#f0f4ef;border:1px solid #526454;border-radius:14px;box-shadow:0 18px 60px #0008;font:14px/1.55 system-ui,sans-serif}
    .ba-privacy-banner p{margin:6px 0 12px;color:#c6d0c7}
    .ba-privacy-banner a,.ba-privacy-dialog a{color:#c4dfb6;text-underline-offset:3px}
    .ba-privacy-actions{display:flex;gap:8px;flex-wrap:wrap}
    .ba-privacy-actions button,.ba-privacy-dialog button{border:1px solid #81917f;border-radius:8px;padding:9px 13px;background:#243328;color:#fff;font:inherit;font-weight:650;cursor:pointer}
    .ba-privacy-actions button.primary,.ba-privacy-dialog button.primary{background:#d4e4c8;color:#172018;border-color:#d4e4c8}
    .ba-privacy-actions button:focus-visible,.ba-privacy-dialog button:focus-visible{outline:3px solid #8eb9df;outline-offset:3px}
    .ba-privacy-dialog{width:min(560px,calc(100% - 28px));max-height:85vh;overflow:auto;padding:24px;background:#151d18;color:#f0f4ef;border:1px solid #647465;border-radius:14px;box-shadow:0 18px 60px #0009;font:14px/1.6 system-ui,sans-serif}
    .ba-privacy-dialog::backdrop{background:#050907b8}
    .ba-privacy-dialog h2{margin:0 0 8px;font-size:22px}
    .ba-privacy-dialog p{color:#c6d0c7}
    .ba-privacy-dialog .ba-privacy-row{display:flex;justify-content:space-between;gap:16px;align-items:center;padding:12px 0;border-top:1px solid #39463c}
    .ba-privacy-dialog input{width:20px;height:20px;accent-color:#a8c99b}
    .ba-privacy-footer{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:18px}
    .ba-privacy-links{display:flex;gap:14px;flex-wrap:wrap;margin-top:10px;font-size:12px}
    .ba-privacy-manage{border:0;background:transparent;color:inherit;text-decoration:underline;text-underline-offset:3px;padding:0;cursor:pointer;font:inherit}
    @media(max-width:560px){.ba-privacy-banner{inset:auto 8px 8px;padding:15px}.ba-privacy-actions button{flex:1 1 100%}.ba-privacy-footer button{flex:1 1 100%}}
  `;
  document.head.appendChild(style);

  banner = document.createElement("section");
  banner.className = "ba-privacy-banner";
  banner.setAttribute("aria-label", "Information sur les cookies et le stockage local");
  banner.hidden = true;
  banner.innerHTML = `
    <strong>Confidentialité et technologies de stockage</strong>
    <p>CultureOps utilise un stockage local nécessaire à la session, à la sécurité et aux préférences d’interface. Aucun outil publicitaire ni outil d’analyse facultatif n’est actuellement activé. Vous pouvez consulter les politiques ou gérer vos choix.</p>
    <div class="ba-privacy-actions">
      <button type="button" data-choice="reject">Refuser les cookies facultatifs</button>
      <button type="button" data-choice="customize">Personnaliser</button>
      <button type="button" class="primary" data-choice="accept">Tout accepter</button>
    </div>
    <div class="ba-privacy-links">
      <a href="${legalBase}privacy.html">Politique de confidentialité</a>
      <a href="${legalBase}cookies.html">Politique cookies</a>
      <a href="${legalBase}terms.html">Conditions d’utilisation</a>
    </div>`;
  document.body.appendChild(banner);

  dialog = document.createElement("dialog");
  dialog.className = "ba-privacy-dialog";
  dialog.setAttribute("aria-labelledby", "baPrivacyTitle");
  dialog.innerHTML = `
    <h2 id="baPrivacyTitle">Préférences de confidentialité</h2>
    <p>Les éléments strictement nécessaires restent actifs pour permettre l’authentification, la sécurité et le fonctionnement de CultureOps. Les catégories facultatives sont désactivées par défaut.</p>
    <div class="ba-privacy-row"><span><strong>Stockage nécessaire</strong><br><small>Session, sécurité et préférences de base. Toujours actif.</small></span><input type="checkbox" checked disabled aria-label="Stockage nécessaire activé"></div>
    <div class="ba-privacy-row"><span><strong>Mesure d’audience</strong><br><small>Aucun outil de mesure d’audience n’est actuellement installé.</small></span><input id="baPrivacyAnalytics" type="checkbox" aria-label="Autoriser la mesure d’audience"></div>
    <div class="ba-privacy-row"><span><strong>Marketing</strong><br><small>Aucun outil marketing ou publicitaire n’est actuellement installé.</small></span><input id="baPrivacyMarketing" type="checkbox" aria-label="Autoriser les cookies marketing"></div>
    <p>Votre choix est conservé dans le stockage local de ce navigateur. Vous pouvez le modifier à tout moment depuis le lien « Gérer les cookies ».</p>
    <div class="ba-privacy-footer">
      <button type="button" data-dialog-choice="reject">Tout refuser</button>
      <button type="button" data-dialog-choice="save" class="primary">Enregistrer mes choix</button>
    </div>`;
  document.body.appendChild(dialog);

  const openSettings = () => {
    const current = readPreferences();
    const analytics = dialog.querySelector("#baPrivacyAnalytics");
    const marketing = dialog.querySelector("#baPrivacyMarketing");
    if (analytics) analytics.checked = current?.analytics === true;
    if (marketing) marketing.checked = current?.marketing === true;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  };

  banner.addEventListener("click", event => {
    const choice = event.target.closest("[data-choice]")?.dataset.choice;
    if (choice === "reject") savePreferences();
    if (choice === "accept") savePreferences({ analytics: true, marketing: true });
    if (choice === "customize") openSettings();
  });

  dialog.addEventListener("click", event => {
    const choice = event.target.closest("[data-dialog-choice]")?.dataset.dialogChoice;
    if (choice === "reject") savePreferences();
    if (choice === "save") {
      savePreferences({
        analytics: dialog.querySelector("#baPrivacyAnalytics")?.checked === true,
        marketing: dialog.querySelector("#baPrivacyMarketing")?.checked === true
      });
    }
  });

  window.BALabsOpenPrivacySettings = openSettings;
  window.BALabsGetPrivacyPreferences = readPreferences;
  window.BALabsIsStorageCategoryAllowed = category => {
    if (category === "necessary") return true;
    const preferences = readPreferences();
    return preferences?.[category] === true;
  };

  if (!readPreferences()) banner.hidden = false;

  // Pages can expose this button in their footer to reopen the preference panel.
  document.addEventListener("click", event => {
    if (event.target.closest("[data-open-privacy-settings]")) {
      event.preventDefault();
      openSettings();
    }
  });
})();
