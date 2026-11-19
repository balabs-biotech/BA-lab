/* BA Labs CultureOps — assisted entry, deterministic and reviewable.
 * Accepts JSON or pasted key/value notes. It never saves data itself:
 * it only prefills the existing form, whose normal validation and save flow remain authoritative.
 */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const panel = $("smartEntryPanel");
  const source = $("smartEntrySource");
  const applyButton = $("smartEntryApply");
  const clearButton = $("smartEntryClear");
  const status = $("smartEntryStatus");
  if (!panel || !source || !applyButton || !status) return;
  // Green Tech uses the separate plant registry; do not expose a biological
  // culture prefill panel there until a plant-specific adapter exists.
  if (window.BA_LABS_DOMAIN === "agronomy") {
    panel.hidden = true;
    return;
  }

  const aliases = {
    strain: ["strain", "souche", "ressource", "organisme", "biological resource"],
    cultureCode: ["cultureCode", "culture_code", "code culture", "code de culture", "code"],
    cultureType: ["cultureType", "culture_type", "type culture", "type de culture", "type"],
    protocol: ["protocol", "protocole", "méthode", "method"],
    startedAt: ["startedAt", "started_at", "date de démarrage", "date", "started"],
    notes: ["notes", "note", "observations", "observation", "compte rendu", "description"]
  };

  function normalize(value) {
    return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase().replace(/[\s_\-:]+/g, " ").trim();
  }

  function parseSource(raw) {
    const text = raw.trim();
    if (!text) throw new Error("Collez d’abord un texte ou un objet JSON.");
    if (text.startsWith("{")) {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Le JSON doit être un objet avec des champs nommés.");
      }
      return parsed;
    }
    const result = {};
    const lines = text.split(/\r?\n/);
    for (const line of lines) {
      const match = line.match(/^\s*([^:=\t]{2,80})\s*[:=\t]\s*(.*?)\s*$/);
      if (match && match[2]) result[match[1].trim()] = match[2].trim();
    }
    if (Object.keys(result).length) return result;

    // Fallback: extract a likely culture code from unstructured pasted notes.
    const code = text.match(/\b(?:CULT|PO|TRI|LC|WA|LAB)[-_][A-Z0-9][A-Z0-9_-]{2,}\b/i);
    if (code) result.cultureCode = code[0];
    result.notes = text;
    return result;
  }

  function getValue(object, field) {
    const keys = Object.keys(object);
    const accepted = aliases[field].map(normalize);
    const key = keys.find((candidate) => accepted.includes(normalize(candidate)));
    return key ? object[key] : undefined;
  }

  function setSelect(select, value) {
    if (!select || value == null || String(value).trim() === "") return "skipped";
    const target = normalize(value);
    const options = Array.from(select.options);
    const exact = options.filter((option) =>
      normalize(option.value) === target || normalize(option.textContent) === target
    );
    if (exact.length === 1) {
      select.value = exact[0].value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      return "filled";
    }
    if (exact.length > 1) return "unmatched";

    // Permit a partial match only when it is unique and both compared values
    // are non-empty. Empty placeholder labels must never match every input.
    const partial = options.filter((option) => {
      const value = normalize(option.value);
      const label = normalize(option.textContent);
      if (target.length < 4) return false;
      const valueMatch = value.length >= 4 && (value.includes(target) || target.includes(value));
      const labelMatch = label.length >= 4 && (label.includes(target) || target.includes(label));
      return valueMatch || labelMatch;
    });
    if (partial.length !== 1) return "unmatched";
    const match = partial[0];
    select.value = match.value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return "filled";
  }

  function setInput(id, value) {
    const element = $(id);
    if (!element || value == null || String(value).trim() === "") return "skipped";
    let text = String(value).trim();
    if (id === "startedAt") {
      const date = new Date(text);
      if (!Number.isNaN(date.getTime()) && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text)) {
        text = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      }
    }
    element.value = text;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return "filled";
  }

  function apply() {
    let data;
    try {
      data = parseSource(source.value);
    } catch (error) {
      status.textContent = error.message || "Le texte n’a pas pu être interprété.";
      status.dataset.state = "error";
      return;
    }
    const results = [];
    const strain = getValue(data, "strain");
    if (strain !== undefined) results.push(["souche", setSelect($("strain"), strain)]);
    for (const [field, id, kind] of [
      ["cultureCode", "cultureCode", "input"],
      ["cultureType", "cultureType", "select"],
      ["protocol", "protocol", "select"],
      ["startedAt", "startedAt", "input"]
    ]) {
      const value = getValue(data, field);
      if (value === undefined) continue;
      results.push([field === "cultureCode" ? "code" : field === "cultureType" ? "type" : field === "startedAt" ? "date" : "protocole",
        kind === "select" ? setSelect($(id), value) : setInput(id, value)]);
    }
    const notes = getValue(data, "notes");
    if (notes !== undefined && $("bioOperationNote") && !$("bioOperationNote").value) {
      $("bioOperationNote").value = String(notes).slice(0, 4000);
    }
    const filled = results.filter((item) => item[1] === "filled").length;
    const unmatched = results.filter((item) => item[1] === "unmatched").map((item) => item[0]);
    const skipped = results.length - filled - unmatched.length;
    if (filled) {
      const stepTwo = document.querySelector('[data-entry-step="2"]');
      const stepThree = document.querySelector('[data-entry-step="3"]');
      if (stepTwo) stepTwo.hidden = false;
      if (stepThree && $("cultureCode")?.value.trim() && $("strain")?.value) stepThree.hidden = false;
    }
    const summary = [];
    summary.push(filled + " champ(s) prérempli(s).");
    if (unmatched.length) summary.push("À sélectionner manuellement : " + unmatched.join(", ") + ".");
    if (!filled && !unmatched.length) summary.push("Aucun champ reconnu : vérifiez les clés ou utilisez le format JSON.");
    summary.push("Vérifiez chaque valeur, puis utilisez le bouton normal de création pour enregistrer.");
    status.textContent = summary.join(" ");
    status.dataset.state = filled ? "success" : "notice";
  }

  applyButton.addEventListener("click", apply);
  if (clearButton) clearButton.addEventListener("click", () => {
    source.value = "";
    status.textContent = "Contenu effacé. Aucune donnée n’a été enregistrée.";
    status.dataset.state = "idle";
    source.focus();
  });
  source.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") apply();
  });
})();