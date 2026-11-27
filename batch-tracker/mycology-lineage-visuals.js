/* BA Labs Mycology — interactive strain lineage graph.
   PixiJS is progressive enhancement; the semantic button list remains available. */
(() => {
  "use strict";
  if (document.body.dataset.domain !== "mycology") return;
  const target = document.getElementById("cultureLineage");
  if (!target || target.dataset.graphEnhanced === "true") return;
  target.dataset.graphEnhanced = "true";

  const panel = target.closest(".bio-lineage-panel");
  if (!panel) return;
  const shell = document.createElement("div");
  shell.className = "lineage-graph-shell";
  shell.innerHTML = '<div class="lineage-graph-heading"><span>CARTE DE FILIATION</span><small>Vue PixiJS · sélectionnez un nœud pour ouvrir sa fiche</small></div><div class="lineage-graph-legend" aria-label="Légende"><span data-kind="ancestor">Origines</span><span data-kind="current">Sélectionnée</span><span data-kind="descendant">Descendantes</span></div><div class="lineage-graph-toolbar" role="group" aria-label="Commandes de la carte"><button type="button" data-graph-zoom="out" aria-label="Réduire le zoom">−</button><button type="button" data-graph-zoom="in" aria-label="Augmenter le zoom">+</button><button type="button" data-graph-zoom="fit">Recentrer</button><span class="lineage-graph-zoom-label" aria-live="polite">100 %</span></div><div class="lineage-graph-stage" tabindex="0" aria-label="Carte de filiation interactive. Utilisez les commandes de zoom ou faites glisser la carte."><p class="lineage-graph-status">Préparation de la carte de filiation…</p></div>'
  const details = document.createElement("details");
  details.className = "lineage-data-details";
  const summary = document.createElement("summary");
  summary.textContent = "Liste détaillée et navigation clavier";
  details.appendChild(summary);
  panel.insertBefore(shell, target);
  panel.insertBefore(details, target.nextSibling);
  details.appendChild(target);

  const stage = shell.querySelector(".lineage-graph-stage");
  let PIXI = null;
  let app = null;
  let frame = 0;
  let renderToken = 0;
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  const colors = { ancestor: 0x9b9a8f, current: 0xc98259, descendant: 0xd9a36e, line: 0x765c4d, text: 0xe9eee7, muted: 0xb6aaa0 };

  function collectNodes() {
    return [...target.querySelectorAll("button.culture-lineage-node[data-culture-id]")].map(button => ({
      id: button.dataset.cultureId,
      parentId: button.dataset.parentCultureId || "",
      role: button.dataset.lineageRole || "related",
      depth: Number(button.dataset.lineageDepth || 0),
      title: button.querySelector("strong")?.textContent?.trim() || "Culture sans code",
      subtitle: button.querySelector("small")?.textContent?.trim() || "",
      button
    }));
  }

  function showFallback(message, revealList = false) {
    stage.replaceChildren();
    const note = document.createElement("p");
    note.className = "lineage-graph-status";
    note.textContent = message;
    stage.appendChild(note);
    if (revealList) details.open = true;
  }

  async function loadPixi() {
    if (!PIXI) PIXI = await import("https://cdn.jsdelivr.net/npm/pixi.js@8.17.1/dist/pixi.min.mjs");
    return PIXI;
  }

  function layout(nodes) {
    const ancestors = nodes.filter(n => n.role === "ancestor");
    const current = nodes.find(n => n.role === "current");
    const descendants = nodes.filter(n => n.role === "descendant");
    const levels = new Map();
    descendants.forEach(node => {
      if (!levels.has(node.depth)) levels.set(node.depth, []);
      levels.get(node.depth).push(node);
    });
    const maxDepth = Math.max(0, ...levels.keys());
    const gapX = 226, gapY = 104, left = 34;
    const maxCount = Math.max(1, ...[...levels.values()].map(items => items.length));
    const height = Math.max(210, maxCount * gapY + 112);
    const currentX = left + ancestors.length * gapX;
    const positions = new Map();
    ancestors.forEach((node, index) => {
      positions.set(node.id, { x: left + index * gapX, y: height / 2 - 34, node });
    });
    if (current) positions.set(current.id, { x: currentX, y: height / 2 - 34, node: current });
    levels.forEach((items, depth) => {
      const totalHeight = Math.max(0, items.length - 1) * gapY;
      items.forEach((node, index) => {
        positions.set(node.id, { x: currentX + depth * gapX, y: height / 2 - totalHeight / 2 + index * gapY - 34, node });
      });
    });
    return { positions, width: Math.max(560, currentX + (maxDepth + 1) * gapX + 220), height };
  }

  async function render() {
    const token = ++renderToken;
    const nodes = collectNodes();
    if (!nodes.length) {
      if (app) { app.destroy(true, true); app = null; }
      showFallback("La carte apparaîtra lorsqu’une culture sera sélectionnée.");
      return;
    }
    try {
      const pixi = await loadPixi();
      if (token !== renderToken) return;
      if (app) { app.destroy(true, true); app = null; }
      stage.replaceChildren();
      const graph = layout(nodes);
      const nextApp = new pixi.Application();
      await nextApp.init({
        width: graph.width,
        height: graph.height,
        backgroundAlpha: 0,
        antialias: true,
        autoDensity: true,
        resolution: Math.min(window.devicePixelRatio || 1, 1.5),
        autoStart: false,
        preference: "webgl"
      });
      if (token !== renderToken) { nextApp.destroy(true, true); return; }
      app = nextApp;
      nextApp.canvas.className = "lineage-graph-canvas";
      nextApp.canvas.setAttribute("aria-hidden", "true");
      nextApp.canvas.style.width = graph.width + "px";
      nextApp.canvas.style.height = graph.height + "px";
      stage.appendChild(nextApp.canvas);

      const { Container, Graphics, Text, Rectangle } = pixi;
      const scene = new Container();
      nextApp.stage.addChild(scene);
      const zoomLabel = shell.querySelector(".lineage-graph-zoom-label");
      let zoom = 1;
      const applyZoom = value => {
        zoom = Math.max(0.55, Math.min(1.8, value));
        if (nextApp.canvas) {
          nextApp.canvas.style.width = Math.round(graph.width * zoom) + "px";
          nextApp.canvas.style.height = Math.round(graph.height * zoom) + "px";
        }
        if (zoomLabel) zoomLabel.textContent = Math.round(zoom * 100) + " %";
      };
      shell.querySelector('[data-graph-zoom="in"]').addEventListener("click", () => applyZoom(zoom + 0.15));
      shell.querySelector('[data-graph-zoom="out"]').addEventListener("click", () => applyZoom(zoom - 0.15));
      shell.querySelector('[data-graph-zoom="fit"]').addEventListener("click", () => {
        applyZoom(1);
        stage.scrollTo({ left: 0, top: 0, behavior: reducedMotion ? "auto" : "smooth" });
      });
      let drag = null;
      stage.addEventListener("pointerdown", event => {
        if (event.target === nextApp.canvas) {
          drag = { x: event.clientX, y: event.clientY, left: stage.scrollLeft, top: stage.scrollTop };
          stage.classList.add("is-panning");
        }
      });
      window.addEventListener("pointermove", event => {
        if (!drag) return;
        stage.scrollLeft = drag.left - (event.clientX - drag.x);
        stage.scrollTop = drag.top - (event.clientY - drag.y);
      });
      const stopDrag = () => { drag = null; stage.classList.remove("is-panning"); };
      window.addEventListener("pointerup", stopDrag);
      window.addEventListener("pointercancel", stopDrag);
      stage.addEventListener("wheel", event => {
        if (!event.ctrlKey && !event.metaKey) return;
        event.preventDefault();
        applyZoom(zoom + (event.deltaY < 0 ? 0.08 : -0.08));
      }, { passive: false });
      const nodeWidth = 184, nodeHeight = 68;
      const byId = graph.positions;
      const drawEdge = (from, to) => {
        if (!from || !to) return;
        const startX = from.x + nodeWidth, startY = from.y + nodeHeight / 2;
        const endX = to.x, endY = to.y + nodeHeight / 2;
        const bend = Math.max(34, (endX - startX) * 0.46);
        const line = new Graphics().moveTo(startX, startY)
          .bezierCurveTo(startX + bend, startY, endX - bend, endY, endX, endY)
          .stroke({ color: colors.line, alpha: 0.78, width: 1.8 });
        scene.addChild(line);
      };
      nodes.forEach(node => {
        if (node.parentId && byId.has(node.parentId)) drawEdge(byId.get(node.parentId), byId.get(node.id));
      });
      // Keep the source-to-current chain visible even when a parent record is outside the loaded data.
      const orderedAncestors = nodes.filter(n => n.role === "ancestor");
      const current = nodes.find(n => n.role === "current");
      orderedAncestors.forEach((node, index) => {
        const child = orderedAncestors[index + 1] || current;
        if (child && !node.parentId) drawEdge(byId.get(node.id), byId.get(child.id));
      });

      const drawNode = (node, point) => {
        const color = colors[node.role] || colors.line;
        const card = new Container();
        card.position.set(point.x, point.y);
        card.eventMode = "static";
        card.cursor = "pointer";
        card.hitArea = new Rectangle(0, 0, nodeWidth, nodeHeight);
        const halo = new Graphics().roundRect(-3, -3, nodeWidth + 6, nodeHeight + 6, 12)
          .fill({ color, alpha: node.role === "current" ? 0.11 : 0.035 });
        card.addChild(halo);
        const plate = new Graphics().roundRect(0, 0, nodeWidth, nodeHeight, 10)
          .fill({ color: 0x202d2b, alpha: 0.98 })
          .stroke({ color, alpha: node.role === "current" ? 0.9 : 0.52, width: node.role === "current" ? 2 : 1 });
        card.addChild(plate);
        const marker = new Graphics().roundRect(0, 0, 4, nodeHeight, 3).fill({ color, alpha: 0.95 });
        card.addChild(marker);
        const title = new Text({ text: node.title.length > 24 ? node.title.slice(0, 22) + "…" : node.title, style: { fontFamily: "Inter,Arial,sans-serif", fontSize: 12, fontWeight: "700", fill: colors.text } });
        title.position.set(14, 14);
        card.addChild(title);
        const subtitle = new Text({ text: node.subtitle.length > 30 ? node.subtitle.slice(0, 28) + "…" : node.subtitle, style: { fontFamily: "Inter,Arial,sans-serif", fontSize: 10, fill: colors.muted } });
        subtitle.position.set(14, 39);
        card.addChild(subtitle);
        card.on("pointertap", () => node.button.click());
        card.on("pointerover", () => { plate.clear().roundRect(0, 0, nodeWidth, nodeHeight, 10).fill({ color: 0x2c3b36, alpha: 1 }).stroke({ color, alpha: 1, width: 2 }); });
        card.on("pointerout", () => { plate.clear().roundRect(0, 0, nodeWidth, nodeHeight, 10).fill({ color: 0x202d2b, alpha: 0.98 }).stroke({ color, alpha: node.role === "current" ? 0.9 : 0.52, width: node.role === "current" ? 2 : 1 }); });
        scene.addChild(card);
      };
      nodes.forEach(node => {
        const point = byId.get(node.id);
        if (point) drawNode(node, point);
      });
      // The graph is static between culture selections: render once instead of
      // running a permanent GPU ticker. Rebuild only when the lineage data changes.
      nextApp.render();
      nextApp.stop();
      shell.dataset.graphState = "ready";
    } catch (error) {
      console.info("BA Labs: carte PixiJS indisponible, liste de filiation conservée.", error);
      shell.dataset.graphState = "fallback";
      showFallback("La visualisation graphique est indisponible. La liste détaillée reste accessible ci-dessous.", true);
    }
  }

  const scheduleRender = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => { void render(); });
  };
  const observer = new MutationObserver(scheduleRender);
  observer.observe(target, { childList: true, subtree: true });
  scheduleRender();
  window.addEventListener("pagehide", () => {
    observer.disconnect();
    if (app) app.destroy(true, true);
    app = null;
  }, { once: true });
})();
