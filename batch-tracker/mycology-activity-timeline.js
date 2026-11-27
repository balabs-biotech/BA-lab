/* BA Labs Mycology — PixiJS culture activity timeline.
   Projects the existing culture-detail entries; never derives biological growth values. */
(() => {
  "use strict";
  if (document.body.dataset.domain !== "mycology") return;
  const target = document.getElementById("cultureDetailTimeline");
  if (!target || target.dataset.activityTimelineReady === "true") return;
  target.dataset.activityTimelineReady = "true";

  const shell = document.createElement("section");
  shell.className = "mycology-activity-map";
  shell.setAttribute("aria-label", "Chronologie visuelle des événements de la culture sélectionnée");
  shell.innerHTML = '<div class="mycology-activity-heading"><div><span class="mycology-activity-kicker">HISTORIQUE BIOLOGIQUE</span><h3>Chronologie de la culture</h3><p>Événements, mesures et observations enregistrés dans la fiche</p></div><div class="mycology-activity-tools" role="group" aria-label="Commandes de la chronologie"><button type="button" data-activity-page="prev" aria-label="Page précédente">‹</button><span data-activity-page-label aria-live="polite">0 / 0</span><button type="button" data-activity-page="next" aria-label="Page suivante">›</button><button type="button" data-activity-zoom="out" aria-label="Réduire le zoom">−</button><button type="button" data-activity-zoom="in" aria-label="Augmenter le zoom">+</button><button type="button" data-activity-zoom="fit">Ajuster</button><span data-activity-zoom-label aria-live="polite">100 %</span></div></div><div class="mycology-activity-stage" tabindex="0" aria-label="Chronologie horizontale. Faites défiler horizontalement pour parcourir les enregistrements."><p class="mycology-activity-status">Sélectionnez une culture pour afficher son historique.</p></div><p class="mycology-activity-note">La chronologie reprend les enregistrements chargés dans la fiche. Elle ne constitue pas une mesure de croissance mycélienne.</p>';
  target.prepend(shell);
  const stage = shell.querySelector(".mycology-activity-stage");
  const zoomLabel = shell.querySelector("[data-activity-zoom-label]");
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  let PIXI = null, app = null, zoom = 1, baseWidth = 0, frame = 0, revision = 0, pageIndex = 0;

  const pageSize = 24;
  const pageLabel = shell.querySelector("[data-activity-page-label]");
  const previousPage = shell.querySelector('[data-activity-page="prev"]');
  const nextPage = shell.querySelector('[data-activity-page="next"]');
  let resizeObserver = null;

  function collectEntries() {
    return [...target.querySelectorAll(":scope > .culture-timeline-entry")].map((entry, index) => {
      const time = entry.querySelector("time");
      const heading = entry.querySelector("strong");
      const description = entry.querySelector("p");
      const dateLabel = time?.textContent?.trim() || "Date non renseignée";
      const timestamp = time?.dateTime ? Date.parse(time.dateTime) : Date.parse(dateLabel);
      const title = heading?.textContent?.trim() || "Enregistrement";
      const detail = description?.textContent?.trim() || "";
      const combined = (title + " " + detail).toLowerCase();
      const kind = combined.includes("observation") ? "observation"
        : combined.includes("mesure") ? "measurement"
        : combined.includes("lot") ? "batch"
        : combined.includes("opération") || combined.includes("operation") ? "operation"
        : "event";
      return { index, title, detail, dateLabel, timestamp: Number.isFinite(timestamp) ? timestamp : null, kind };
    });
  }

  const colors = {
    observation: 0xd9a36e,
    measurement: 0x9b6d54,
    batch: 0xc98259,
    operation: 0xe2c29b,
    event: 0xb0aaa0
  };

  function fallback(message) {
    if (app) { app.destroy(true, true); app = null; }
    stage.replaceChildren();
    const note = document.createElement("p");
    note.className = "mycology-activity-status";
    note.textContent = message;
    stage.appendChild(note);
    pageLabel.textContent = "Liste complète";
    previousPage.disabled = true;
    nextPage.disabled = true;
    shell.dataset.state = "fallback";
  }

  async function loadPixi() {
    if (!PIXI) PIXI = await import("https://cdn.jsdelivr.net/npm/pixi.js@8.17.1/dist/pixi.min.mjs");
    return PIXI;
  }

  function applyZoom(value) {
    zoom = Math.max(0.65, Math.min(1.55, value));
    if (app?.canvas) {
      app.canvas.style.width = Math.round(baseWidth * zoom) + "px";
      app.canvas.style.height = Math.round(190 * zoom) + "px";
    }
    zoomLabel.textContent = Math.round(zoom * 100) + " %";
  }

  shell.querySelector('[data-activity-zoom="in"]').addEventListener("click", () => applyZoom(zoom + 0.12));
  shell.querySelector('[data-activity-zoom="out"]').addEventListener("click", () => applyZoom(zoom - 0.12));
  shell.querySelector('[data-activity-zoom="fit"]').addEventListener("click", () => {
    applyZoom(1);
    stage.scrollTo({ left: 0, top: 0, behavior: reducedMotion ? "auto" : "smooth" });
  });
  previousPage.addEventListener("click", () => { pageIndex = Math.max(0, pageIndex - 1); schedule(); });
  nextPage.addEventListener("click", () => { pageIndex += 1; schedule(); });

  async function render() {
    const token = ++revision;
    const entries = collectEntries();
    if (!entries.length) {
      if (app) { app.destroy(true, true); app = null; }
      stage.replaceChildren();
      const note = document.createElement("p");
      note.className = "mycology-activity-status";
      note.textContent = "Aucun événement, mesure ou observation n’est encore enregistré pour cette culture.";
      stage.appendChild(note);
      pageIndex = 0;
      pageLabel.textContent = "0 / 0";
      previousPage.disabled = true;
      nextPage.disabled = true;
      shell.dataset.state = "empty";
      return;
    }
    let pendingApp = null;
    try {
      const pixi = await loadPixi();
      if (token !== revision) return;
      if (app) { app.destroy(true, true); app = null; }
      stage.replaceChildren();
      const allEntries = entries.slice().reverse();
      const pageCount = Math.max(1, Math.ceil(allEntries.length / pageSize));
      pageIndex = Math.min(pageIndex, pageCount - 1);
      const startIndex = pageIndex * pageSize;
      const ordered = allEntries.slice(startIndex, startIndex + pageSize);
      pageLabel.textContent = (startIndex + 1) + "–" + (startIndex + ordered.length) + " / " + allEntries.length;
      previousPage.disabled = pageIndex === 0;
      nextPage.disabled = pageIndex >= pageCount - 1;
      const nodeWidth = 176, gap = 24, left = 22;
      baseWidth = Math.max(340, left * 2 + ordered.length * nodeWidth + Math.max(0, ordered.length - 1) * gap);
      const height = 190;
      const next = pendingApp = new pixi.Application();
      await next.init({ width: baseWidth, height, backgroundAlpha: 0, antialias: true, autoDensity: true, resolution: Math.min(window.devicePixelRatio || 1, 1.5), autoStart: false, preference: "webgl" });
      if (token !== revision) { next.destroy(true, true); return; }
      app = next;
      pendingApp = null;
      next.canvas.className = "mycology-activity-canvas";
      next.canvas.setAttribute("aria-hidden", "true");
      next.canvas.style.width = baseWidth + "px";
      next.canvas.style.height = height + "px";
      stage.appendChild(next.canvas);
      const { Container, Graphics, Text } = pixi;
      const root = new Container();
      next.stage.addChild(root);
      const y = 86;
      const axis = new Graphics().moveTo(left + nodeWidth / 2, y).lineTo(baseWidth - left - nodeWidth / 2, y)
        .stroke({ color: 0x765c4d, alpha: 0.72, width: 2 });
      root.addChild(axis);
      ordered.forEach((item, index) => {
        const x = left + index * (nodeWidth + gap);
        const color = colors[item.kind];
        if (index) {
          const connector = new Graphics().moveTo(x - gap, y).lineTo(x, y).stroke({ color: 0x765c4d, alpha: 0.75, width: 2 });
          root.addChild(connector);
        }
        const card = new Container();
        card.position.set(x, 18);
        card.addChild(new Graphics().roundRect(0, 0, nodeWidth, 54, 9).fill({ color: 0x292725, alpha: 0.98 }).stroke({ color, alpha: 0.68, width: 1.2 }));
        const title = new Text({ text: item.title.length > 24 ? item.title.slice(0, 22) + "…" : item.title, style: { fontFamily: "Inter,Arial,sans-serif", fontSize: 10, fontWeight: "700", fill: 0xeee5dc } });
        title.position.set(10, 9); card.addChild(title);
        const detail = new Text({ text: item.detail.length > 27 ? item.detail.slice(0, 25) + "…" : item.detail || "Détail non renseigné", style: { fontFamily: "Inter,Arial,sans-serif", fontSize: 10, fill: 0xb6aaa0 } });
        detail.position.set(10, 29); card.addChild(detail);
        root.addChild(card);
        const marker = new Graphics().circle(x + nodeWidth / 2, y, 5).fill({ color }).stroke({ color: 0x171d1c, width: 2 });
        root.addChild(marker);
        const date = new Text({ text: item.dateLabel.length > 20 ? item.dateLabel.slice(0, 18) + "…" : item.dateLabel, style: { fontFamily: "Inter,Arial,sans-serif", fontSize: 10, fill: 0xc7b8ab } });
        date.anchor.set(0.5, 0); date.position.set(x + nodeWidth / 2, 101); root.addChild(date);
      });
      const caption = new Text({ text: "Page " + (pageIndex + 1) + " / " + pageCount + " · " + allEntries.length + " enregistrement(s) au total", style: { fontFamily: "Inter,Arial,sans-serif", fontSize: 10, fontWeight: "600", fill: 0xb9a99d, letterSpacing: 0.6 } });
      caption.position.set(left, 158); root.addChild(caption);
      next.render();
      next.stop();
      applyZoom(1);
      shell.dataset.state = "ready";
    } catch (error) {
      console.info("BA Labs: chronologie PixiJS indisponible; historique textuel conservé.", error);
      if (pendingApp) { pendingApp.destroy(true, true); pendingApp = null; }
      fallback("La chronologie graphique est indisponible. L’historique détaillé reste accessible.");
    }
  }

  function schedule() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => void render());
  }
  const observer = new MutationObserver(records => {
    if (!shell.isConnected) target.prepend(shell);
    if (records.some(record => record.target !== shell && !shell.contains(record.target))) schedule();
  });
  observer.observe(target, { childList: true, subtree: true });
  resizeObserver = new ResizeObserver(schedule);
  resizeObserver.observe(target);
  schedule();
  window.addEventListener("pagehide", () => {
    observer.disconnect();
    resizeObserver?.disconnect();
    if (app) app.destroy(true, true);
    app = null;
  }, { once: true });
})();