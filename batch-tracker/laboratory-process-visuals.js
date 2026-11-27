/* BA Labs Laboratory — PixiJS batch process map.
   The drawing is a read-only projection of the persisted stage statuses.
   The semantic stage list remains visible and usable as the accessible fallback. */
(() => {
  "use strict";
  if (document.body.dataset.domain !== "laboratory") return;
  const panel = document.getElementById("batchStages");
  const list = document.getElementById("batchStageList");
  if (!panel || !list || panel.dataset.processMapReady === "true") return;
  panel.dataset.processMapReady = "true";

  const shell = document.createElement("section");
  shell.className = "lab-process-map";
  shell.setAttribute("aria-label", "Schéma visuel des étapes du lot");
  shell.innerHTML = '<div class="lab-process-map-heading"><div><span class="lab-process-map-kicker">VUE DU PROCÉDÉ</span><p>Progression issue des statuts enregistrés pour ce lot</p></div><div class="lab-process-map-controls" role="group" aria-label="Commandes du schéma"><button type="button" data-process-zoom="out" aria-label="Réduire le zoom">−</button><button type="button" data-process-zoom="in" aria-label="Augmenter le zoom">+</button><button type="button" data-process-zoom="fit">Ajuster</button><span data-process-zoom-label aria-live="polite">100 %</span></div></div><div class="lab-process-map-stage" tabindex="0" aria-label="Schéma horizontal des étapes. Faites défiler horizontalement pour parcourir le procédé."><p class="lab-process-map-status">Le schéma apparaîtra à la sélection d’un lot.</p></div>';
  panel.insertBefore(shell, list);
  const stageHost = shell.querySelector(".lab-process-map-stage");
  const zoomLabel = shell.querySelector("[data-process-zoom-label]");
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  let PIXI = null, app = null, frame = 0, renderToken = 0, zoom = 1;

  let baseWidth = 0, baseHeight = 0;

  const palette = {
    completed: { line: 0x91b78f, fill: 0x24352f, border: 0x82a982, badge: 0xb9d9b6, label: "TERMINÉE" },
    active: { line: 0x78b8e8, fill: 0x243440, border: 0x78b8e8, badge: 0xb9e1f5, label: "EN COURS" },
    failed: { line: 0xc97869, fill: 0x3b2928, border: 0xc97869, badge: 0xefaaa0, label: "ÉCHEC" },
    pending: { line: 0x71817f, fill: 0x202d2b, border: 0x526361, badge: 0xa8b9b4, label: "EN ATTENTE" }
  };

  function collectStages() {
    return [...list.querySelectorAll(":scope > .stage")].map((element, index) => {
      const statusNode = element.querySelector(".stage-status");
      const status = element.classList.contains("completed") ? "completed"
        : element.classList.contains("active") ? "active"
        : element.classList.contains("failed") ? "failed" : "pending";
      return {
        index: index + 1,
        name: element.querySelector(".stage-name")?.textContent?.trim() || "Étape " + (index + 1),
        code: element.querySelector(".muted")?.textContent?.trim() || "",
        status,
        statusText: statusNode?.textContent?.trim() || palette[status].label
      };
    });
  }

  function fallback(message, revealList = false) {
    if (app) { app.destroy(true, true); app = null; }
    stageHost.replaceChildren();
    const note = document.createElement("p");
    note.className = "lab-process-map-status";
    note.textContent = message;
    stageHost.appendChild(note);
    if (revealList) list.scrollIntoView({ block: "nearest" });
  }

  async function loadPixi() {
    if (!PIXI) PIXI = await import("https://cdn.jsdelivr.net/npm/pixi.js@8.17.1/dist/pixi.min.mjs");
    return PIXI;
  }

  function applyZoom(value) {
    zoom = Math.max(0.62, Math.min(1.5, value));
    const canvas = app?.canvas;
    if (canvas) {
      canvas.style.width = Math.round(baseWidth * zoom) + "px";
      canvas.style.height = Math.round(baseHeight * zoom) + "px";
    }
    zoomLabel.textContent = Math.round(zoom * 100) + " %";
  }

  shell.querySelector('[data-process-zoom="in"]').addEventListener("click", () => applyZoom(zoom + 0.12));
  shell.querySelector('[data-process-zoom="out"]').addEventListener("click", () => applyZoom(zoom - 0.12));
  shell.querySelector('[data-process-zoom="fit"]').addEventListener("click", () => {
    applyZoom(1);
    stageHost.scrollTo({ left: 0, top: 0, behavior: reducedMotion ? "auto" : "smooth" });
  });

  async function render() {
    const token = ++renderToken;
    const stages = collectStages();
    if (!stages.length) {
      fallback("Le schéma apparaîtra à la sélection d’un lot.");
      shell.dataset.state = "empty";
      return;
    }
    let pendingApp = null;
    try {
      const pixi = await loadPixi();
      if (token !== renderToken) return;
      if (app) { app.destroy(true, true); app = null; }
      stageHost.replaceChildren();
      const nodeWidth = 190, nodeHeight = 104, gap = 54, left = 30, top = 42;
      baseWidth = Math.max(340, left * 2 + stages.length * nodeWidth + (stages.length - 1) * gap);
      baseHeight = 190;
      const next = pendingApp = new pixi.Application();
      await next.init({
        width: baseWidth, height: baseHeight, backgroundAlpha: 0,
        antialias: true, autoDensity: true,
        resolution: Math.min(window.devicePixelRatio || 1, 1.5),
        autoStart: false, preference: "webgl"
      });
      if (token !== renderToken) { next.destroy(true, true); return; }
      app = next;
      pendingApp = null;
      next.canvas.className = "lab-process-map-canvas";
      next.canvas.setAttribute("aria-hidden", "true");
      next.canvas.style.width = baseWidth + "px";
      next.canvas.style.height = baseHeight + "px";
      stageHost.appendChild(next.canvas);

      const { Container, Graphics, Text } = pixi;
      const scene = new Container();
      next.stage.addChild(scene);

      stages.forEach((item, index) => {
        const x = left + index * (nodeWidth + gap);
        const y = top;
        const colors = palette[item.status];
        if (index < stages.length - 1) {
          const startX = x + nodeWidth + 5, endX = x + nodeWidth + gap - 7;
          const connector = new Graphics().moveTo(startX, y + nodeHeight / 2)
            .bezierCurveTo(startX + 18, y + nodeHeight / 2, endX - 18, y + nodeHeight / 2, endX, y + nodeHeight / 2)
            .stroke({ color: item.status === "completed" ? palette.completed.line : 0x61716f, alpha: 0.9, width: 2 });
          connector.moveTo(endX - 5, y + nodeHeight / 2 - 4).lineTo(endX, y + nodeHeight / 2).lineTo(endX - 5, y + nodeHeight / 2 + 4)
            .stroke({ color: item.status === "completed" ? palette.completed.line : 0x61716f, width: 2 });
          scene.addChild(connector);
        }
        const card = new Container();
        card.position.set(x, y);
        const plate = new Graphics().roundRect(0, 0, nodeWidth, nodeHeight, 12)
          .fill({ color: colors.fill, alpha: 0.98 })
          .stroke({ color: colors.border, alpha: item.status === "active" ? 1 : 0.72, width: item.status === "active" ? 2.4 : 1.35 });
        card.addChild(plate);
        card.addChild(new Graphics().roundRect(0, 0, 5, nodeHeight, 3).fill({ color: colors.border }));
        const number = new Text({ text: String(item.index).padStart(2, "0"), style: { fontFamily: "Inter,Arial,sans-serif", fontSize: 10, fontWeight: "700", fill: colors.badge } });
        number.position.set(15, 12); card.addChild(number);
        const title = new Text({ text: item.name.length > 23 ? item.name.slice(0, 21) + "…" : item.name, style: { fontFamily: "Inter,Arial,sans-serif", fontSize: 12, fontWeight: "700", fill: 0xe9eee7, wordWrap: true, wordWrapWidth: 158 } });
        title.position.set(15, 36); card.addChild(title);
        const code = new Text({ text: item.code.length > 25 ? item.code.slice(0, 23) + "…" : item.code, style: { fontFamily: "Inter,Arial,sans-serif", fontSize: 10, fill: 0xa8b9b4 } });
        code.position.set(15, 63); card.addChild(code);
        const status = new Text({ text: item.statusText.toUpperCase().slice(0, 24), style: { fontFamily: "Inter,Arial,sans-serif", fontSize: 10, fontWeight: "700", fill: colors.badge, letterSpacing: 0.7 } });
        status.position.set(15, 83); card.addChild(status);
        scene.addChild(card);
      });

      const legend = new Text({ text: "STATUTS DU LOT  ·  " + stages.filter(item => item.status === "completed").length + " / " + stages.length + " étapes terminées", style: { fontFamily: "Inter,Arial,sans-serif", fontSize: 10, fontWeight: "600", fill: 0xa8b9b4, letterSpacing: 1 } });
      legend.position.set(left, 12); scene.addChild(legend);
      next.render();
      next.stop();
      applyZoom(1);
      shell.dataset.state = "ready";
    } catch (error) {
      console.info("BA Labs: schéma PixiJS indisponible, liste des étapes conservée.", error);
      if (pendingApp) { pendingApp.destroy(true, true); pendingApp = null; }
      shell.dataset.state = "fallback";
      fallback("La vue graphique est indisponible. La liste détaillée des étapes reste accessible.");
    }
  }

  function scheduleRender() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => { void render(); });
  }
  const observer = new MutationObserver(scheduleRender);
  observer.observe(list, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
  scheduleRender();
  window.addEventListener("pagehide", () => {
    observer.disconnect();
    if (app) app.destroy(true, true);
    app = null;
  }, { once: true });
})();